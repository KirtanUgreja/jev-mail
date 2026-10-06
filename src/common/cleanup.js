// Cleanup: move unwanted mail to Trash, safely and reversibly.
//
// - Trash only (users.messages.trash). Never permanent delete; the extension
//   does not even hold a scope that could. Gmail empties Trash after 30 days.
// - Nothing happens without a preview the user confirms, item by item.
// - Every protection below is a hard veto. A candidate needs junk = yes at or
//   above the cleanup threshold AND must pass all of them.
// - Labels are re-read from Gmail right before trashing, so an email starred
//   since the last sync is still skipped.
// - Each batch is logged (date, sender, subject, message id — never bodies) and
//   the last one can be restored with users.messages.untrash.

import { trashMessage, untrashMessage, getLabelIds } from './gmail.js';
import { isLowConfidence } from './labels.js';
import { putEmails } from './db.js';

const LOG_KEY = 'cleanupLog';
const MAX_LOG_BATCHES = 100;
const DAY = 86_400_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 'shop.com', '@shop.com' or 'promo@shop.com', one per entry. */
export function isProtectedSender(address, protectedList = []) {
  const email = String(address || '').trim().toLowerCase();
  const domain = email.split('@')[1] || '';
  return protectedList.some((raw) => {
    const entry = String(raw || '').trim().toLowerCase().replace(/^@/, '');
    if (!entry) return false;
    if (entry.includes('@')) return entry === email;
    return domain === entry || domain.endsWith(`.${entry}`);
  });
}

/**
 * Why this email must not be trashed, or null if it may be offered. The checks
 * run cheapest-first, and the first veto wins.
 */
export function vetoReason(row, settings, now = Date.now()) {
  const r = row.result;
  if (!r || row.status !== 'done') return 'not classified';
  if (String(row.id).startsWith('dom:')) return 'no Gmail message id';

  const labels = row.labelIds || [];
  if (labels.includes('TRASH')) return 'already in Trash';
  if (labels.includes('STARRED')) return 'starred';
  if (labels.includes('IMPORTANT')) return 'marked important by Gmail';

  const minAge = Number(settings.cleanupMinAgeDays) || 0;
  if (!row.internalDate || now - row.internalDate < minAge * DAY) return `newer than ${minAge} days`;
  if (isProtectedSender(row.fromEmail, settings.protectedSenders)) return 'protected sender';

  // A low-confidence verdict can't be trusted to say it's not Finance, etc.
  if (isLowConfidence(r, settings.confidenceThreshold)) return 'low confidence (Jev/Review)';
  if ((settings.protectedCategories || []).includes(r.category)) return `protected category ${r.category}`;
  if (r.priority === 'High') return 'priority High';
  if ((r.important ?? 1) >= 0.5) return 'important';
  if ((r.reply ?? 1) >= 0.5) return 'needs a reply';

  // Cross-check with the narrow questions: a genuine notice about a service the
  // recipient uses is never junk, whatever the junk question said.
  const serviceNotice = r.signals?.serviceNotice ?? 0;
  if (serviceNotice >= 0.5 && (r.spam ?? 0) < 0.5) return 'genuine service notice';

  const junk = r.junk ?? 0;
  if (junk < 0.5) return 'not junk';
  if (junk < settings.cleanupThreshold) return `junk confidence ${pct(junk)} below ${pct(settings.cleanupThreshold)}`;
  return null;
}

const pct = (n) => `${Math.round(n * 100)}%`;

function describe(row) {
  const r = row.result;
  const parts = [`junk ${pct(r.junk)}`, r.category];
  if ((r.spam ?? 0) >= 0.5) parts.push(`spam ${pct(r.spam)}`);
  else if ((r.signals?.unsolicited ?? 0) >= 0.5) parts.push('unsolicited');
  return parts.join(' · ');
}

/** Everything that may be offered for cleanup, newest first. */
export function findCandidates(rows, settings, now = Date.now()) {
  return rows
    .filter((row) => vetoReason(row, settings, now) === null)
    .sort((a, b) => (b.internalDate || 0) - (a.internalDate || 0))
    .map((row) => ({
      id: row.id,
      fromName: row.fromName,
      fromEmail: row.fromEmail,
      subject: row.subject,
      date: row.date,
      internalDate: row.internalDate,
      reason: describe(row),
      confidence: row.result.junk
    }));
}

/** Candidates grouped by sender address, biggest group first. */
export function groupBySender(candidates) {
  const groups = new Map();
  for (const c of candidates) {
    const key = String(c.fromEmail || '').toLowerCase();
    if (!groups.has(key)) groups.set(key, { fromEmail: key, fromName: c.fromName, items: [] });
    groups.get(key).items.push(c);
  }
  return [...groups.values()].sort((a, b) => b.items.length - a.items.length || a.fromEmail.localeCompare(b.fromEmail));
}

/* ------------------------------------------------------------------- log */

export async function readLog() {
  const { [LOG_KEY]: log } = await chrome.storage.local.get(LOG_KEY);
  return Array.isArray(log) ? log : [];
}

async function writeLog(log) {
  await chrome.storage.local.set({ [LOG_KEY]: log.slice(-MAX_LOG_BATCHES) });
}

/** The most recent batch that has not been undone, or null. */
export async function lastUndoable() {
  const log = await readLog();
  const last = log[log.length - 1];
  return last && !last.undoneAt && last.items.some((i) => !i.restoredAt) ? last : null;
}

/* ------------------------------------------------------------- actions */

/**
 * Trash exactly the confirmed ids. Each one is re-checked against the stored
 * rules and against its live Gmail labels first; anything that fails is
 * skipped and reported, never trashed.
 */
export async function trashConfirmed(ids, rowsById, settings, { onEvent = () => {}, signal } = {}) {
  const trashed = [];
  const skipped = [];
  const updatedRows = [];
  let done = 0;

  for (const id of ids) {
    if (signal?.aborted) break;
    const row = rowsById.get(id);
    const reason = row ? vetoReason(row, settings) : 'unknown email';
    if (reason) {
      skipped.push({ id, reason });
    } else {
      try {
        const live = await getLabelIds(id, { signal });
        const liveReason = vetoReason({ ...row, labelIds: live }, settings);
        if (liveReason) {
          skipped.push({ id, reason: liveReason });
        } else {
          const res = await trashMessage(id, { signal });
          trashed.push({ id, fromEmail: row.fromEmail, fromName: row.fromName, subject: row.subject, date: row.date });
          updatedRows.push({ ...row, labelIds: res.labelIds || [...live, 'TRASH'] });
        }
      } catch (err) {
        if (err.name === 'AbortError') break;
        skipped.push({ id, reason: err.message });
      }
    }
    done++;
    onEvent({ type: 'progress', phase: 'trash', done, total: ids.length });
    // Gentle pacing: messages.trash has no batch form.
    if (done % 10 === 0) await sleep(250);
  }

  if (updatedRows.length) await putEmails(updatedRows);
  if (trashed.length) {
    const log = await readLog();
    log.push({ id: `c${Date.now()}`, at: new Date().toISOString(), items: trashed, undoneAt: null });
    await writeLog(log);
  }
  return { trashed, skipped, rows: updatedRows };
}

/** Restore the last cleanup batch from Trash. */
export async function undoLast(rowsById, { onEvent = () => {}, signal } = {}) {
  const log = await readLog();
  const batch = log[log.length - 1];
  if (!batch || batch.undoneAt) return { restored: [], failed: [] };
  const pending = batch.items.filter((i) => !i.restoredAt);

  const restored = [];
  const failed = [];
  const updatedRows = [];
  let done = 0;
  for (const item of pending) {
    if (signal?.aborted) break;
    try {
      const res = await untrashMessage(item.id, { signal });
      item.restoredAt = new Date().toISOString();
      restored.push(item.id);
      const row = rowsById.get(item.id);
      if (row) updatedRows.push({ ...row, labelIds: res.labelIds || (row.labelIds || []).filter((l) => l !== 'TRASH') });
    } catch (err) {
      if (err.name === 'AbortError') break;
      failed.push({ id: item.id, reason: err.message });
    }
    done++;
    onEvent({ type: 'progress', phase: 'untrash', done, total: pending.length });
    if (done % 10 === 0) await sleep(250);
  }

  if (updatedRows.length) await putEmails(updatedRows);
  // Only mark the batch undone when everything came back, so Undo can be
  // pressed again to finish the rest. The log keeps every item either way.
  if (batch.items.every((i) => i.restoredAt)) batch.undoneAt = new Date().toISOString();
  await writeLog(log);
  return { restored, failed, rows: updatedRows };
}
