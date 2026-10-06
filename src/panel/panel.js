// Side panel: counts, the four bulk actions, and a progress bar. Uses the
// same pipeline, labeling and cleanup code as the dashboard.

import { loadSettings, resolveProvider } from '../common/settings.js';
import { getToken } from '../common/auth.js';
import { getAllEmails } from '../common/db.js';
import { syncInbox, classifyAll } from '../common/pipeline.js';
import { applyLabels } from '../common/labels.js';
import { findCandidates, groupBySender, trashConfirmed, undoLast, lastUndoable } from '../common/cleanup.js';
import { renderCleanupPreview } from '../common/cleanup-preview.js';
import { PRIORITY_LEVELS } from '../common/jev.js';
import { acquire, release } from '../common/run-lock.js';

const $ = (id) => document.getElementById(id);
const DASHBOARD = chrome.runtime.getURL('src/dashboard/dashboard.html');

const state = { settings: null, rows: new Map(), running: false, controller: null };

init();

async function init() {
  $('p-dashboard').addEventListener('click', () => chrome.tabs.create({ url: DASHBOARD }));
  $('p-settings').addEventListener('click', () => chrome.tabs.create({ url: `${DASHBOARD}#settings` }));
  $('p-classify').addEventListener('click', onClassify);
  $('p-labels').addEventListener('click', () => run('Applying labels…', doLabels));
  $('p-cleanup').addEventListener('click', openCleanup);
  $('p-undo').addEventListener('click', onUndo);

  // Pick up what the dashboard did while the panel was hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !state.running) reload();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings && !state.running) reload();
  });

  await reload();
  setStatus(state.rows.size ? 'Ready.' : 'Ready. Press Classify inbox to start.');
}

async function reload() {
  state.settings = await loadSettings();
  state.rows = new Map((await getAllEmails()).map((r) => [r.id, r]));
  renderCounts();
  await refreshUndo();
}

/* ------------------------------------------------------------------ runs */

async function run(label, task) {
  if (state.running) return;
  const lock = await acquire('the side panel');
  if (!lock.ok) {
    showError(`A run is already going in ${lock.holder}. Wait for it to finish.`);
    return;
  }
  state.running = true;
  state.controller = new AbortController();
  showError('');
  setRunning(true);
  setStatus(label);
  try {
    await reload();
    await task();
  } catch (err) {
    if (err.name === 'AbortError') setStatus('Stopped.');
    else {
      showError(err.message);
      setStatus('Stopped with an error.');
    }
  } finally {
    await release();
    state.running = false;
    setRunning(false);
    setProgress(0);
    await reload();
  }
}

async function ensureReady() {
  if (!resolveProvider(state.settings)) {
    throw new Error('No API key. Add a TypeSafe or OpenRouter key in Settings (or .env).');
  }
  if (!state.settings.googleClientId.trim()) {
    throw new Error('Not signed in: Gmail needs a Google OAuth client ID first. Open Settings → Gmail.');
  }
  // Interactive only when needed: a valid session signs in silently.
  try {
    await getToken({ interactive: false });
  } catch {
    setStatus('Waiting for Gmail sign-in…');
    await getToken({ interactive: true });
  }
}

function onClassify() {
  if (state.running) {
    state.controller?.abort();
    setStatus('Stopping…');
    return;
  }
  run('Classifying inbox…', async () => {
    await ensureReady();
    const opts = { onEvent, signal: state.controller.signal };
    await syncInbox(state.settings, opts);
    await classifyAll(state.settings, { ...opts, rows: [...(await getAllEmails())] });
    await doLabels();
  });
}

async function doLabels() {
  await ensureReady();
  await applyLabels(state.settings, [...(await getAllEmails())], { onEvent, signal: state.controller.signal });
}

/* --------------------------------------------------------------- cleanup */

function openCleanup() {
  if (state.running) return;
  const candidates = findCandidates([...state.rows.values()], state.settings);
  const dialog = $('p-cleanup-dialog');
  renderCleanupPreview($('p-cleanup-body'), {
    candidates,
    groups: groupBySender(candidates),
    onCancel: () => dialog.close(),
    onConfirm: (ids) => {
      dialog.close();
      run(`Moving ${ids.length} to Trash…`, async () => {
        await ensureReady();
        const out = await trashConfirmed(ids, state.rows, state.settings, { onEvent, signal: state.controller.signal });
        setStatus(
          `Moved ${out.trashed.length} to Trash` +
            (out.skipped.length ? `, skipped ${out.skipped.length} (${summarizeSkips(out.skipped)})` : '') +
            (out.trashed.length ? '. Undo restores them.' : '.')
        );
      });
    }
  });
  dialog.showModal();
}

function summarizeSkips(skipped) {
  const counts = new Map();
  for (const s of skipped) counts.set(s.reason, (counts.get(s.reason) || 0) + 1);
  return [...counts].map(([reason, n]) => `${n} ${reason}`).join(', ');
}

function onUndo() {
  run('Restoring from Trash…', async () => {
    await ensureReady();
    const out = await undoLast(state.rows, { onEvent, signal: state.controller.signal });
    setStatus(`Restored ${out.restored.length} from Trash.`);
    if (out.failed.length) showError(`${out.failed.length} could not be restored: ${out.failed[0].reason}. Press Undo again to retry.`);
  });
}

async function refreshUndo() {
  const last = await lastUndoable();
  const n = last ? last.items.filter((i) => !i.restoredAt).length : 0;
  $('p-undo').disabled = !n || state.running;
  $('p-undo').textContent = n ? `Undo last cleanup (${n})` : 'Undo last cleanup';
}

/* ---------------------------------------------------------------- events */

const PHASES = {
  fetch: 'Fetching',
  classify: 'Classifying',
  label: 'Labeling',
  trash: 'Moving to Trash',
  untrash: 'Restoring'
};

function onEvent(evt) {
  if (evt.type === 'stage') setStatus(evt.text);
  else if (evt.type === 'progress') {
    setProgress(evt.total ? evt.done / evt.total : 0);
    setStatus(`${PHASES[evt.phase] || 'Working'}… ${evt.done} / ${evt.total}`);
  } else if (evt.type === 'row') {
    state.rows.set(evt.row.id, evt.row);
    scheduleCounts();
  } else if (evt.type === 'rows') {
    for (const r of evt.rows) state.rows.set(r.id, r);
    scheduleCounts();
  } else if (evt.type === 'warn' && /\((401|402|429)\)|permission denied|Not signed in/i.test(evt.text)) {
    // Per-email failures that mean every email will fail: say so once, plainly.
    showError(evt.text.replace(/^.* — /, ''));
  }
}

/* ---------------------------------------------------------------- render */

let countsTimer = null;
function scheduleCounts() {
  if (countsTimer) return;
  countsTimer = setTimeout(() => {
    countsTimer = null;
    renderCounts();
  }, 300);
}

function renderCounts() {
  const done = [...state.rows.values()].filter((r) => r.result && !(r.labelIds || []).includes('TRASH'));

  const byPriority = Object.fromEntries(PRIORITY_LEVELS.map((p) => [p, 0]));
  const byCategory = new Map(state.settings.categories.map((c) => [c.name, 0]));
  let needsReply = 0;
  for (const r of done) {
    if (r.result.priority in byPriority) byPriority[r.result.priority]++;
    byCategory.set(r.result.category, (byCategory.get(r.result.category) || 0) + 1);
    if ((r.result.reply ?? 0) >= 0.5) needsReply++;
  }

  $('p-priority').replaceChildren(
    ...[...PRIORITY_LEVELS].reverse().map((p) => {
      const tile = document.createElement('div');
      tile.className = 'p-tile';
      const n = document.createElement('b');
      n.textContent = byPriority[p].toLocaleString();
      const label = document.createElement('span');
      label.textContent = p;
      tile.append(n, label);
      return tile;
    })
  );

  const max = Math.max(1, ...byCategory.values());
  $('p-categories').replaceChildren(
    ...[...byCategory].sort((a, b) => b[1] - a[1]).map(([name, n]) => {
      const li = document.createElement('li');
      const label = document.createElement('span');
      label.className = 'name';
      label.textContent = name;
      const count = document.createElement('span');
      count.className = 'n';
      count.textContent = n.toLocaleString();
      const track = document.createElement('span');
      track.className = 'track';
      const fill = document.createElement('span');
      fill.className = 'fill';
      fill.style.display = 'block';
      fill.style.width = `${(n / max) * 100}%`;
      track.append(fill);
      li.append(label, count, track);
      return li;
    })
  );

  const pending = state.rows.size - done.length;
  $('p-totals').textContent =
    `${done.length.toLocaleString()} classified · ${needsReply.toLocaleString()} need a reply` +
    (pending > 0 ? ` · ${pending.toLocaleString()} not yet classified` : '');
}

function setStatus(text) {
  $('p-status').textContent = text;
}

function showError(text) {
  $('p-error').textContent = text;
  $('p-error').hidden = !text;
}

function setProgress(fraction) {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  $('p-bar').style.width = `${pct}%`;
  document.querySelector('.p-progress').setAttribute('aria-valuenow', String(pct));
}

function setRunning(running) {
  $('p-classify').textContent = running ? 'Stop' : 'Classify inbox';
  $('p-classify').dataset.state = running ? 'running' : '';
  for (const id of ['p-labels', 'p-cleanup', 'p-undo']) $(id).disabled = running;
}
