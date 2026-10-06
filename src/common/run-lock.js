// One bulk run at a time across the dashboard and the side panel, so two pages
// never classify, label or trash the same mail at once. The holder refreshes a
// heartbeat; a lock whose page closed mid-run goes stale and is taken over.

const KEY = 'runLock';
const STALE_MS = 45_000;
const BEAT_MS = 15_000;

const me = `${location.pathname}#${Math.random().toString(36).slice(2)}`;
let beat = null;

/** Take the lock, or return the label of the page holding it. */
export async function acquire(label) {
  const { [KEY]: lock } = await chrome.storage.session.get(KEY);
  if (lock && lock.owner !== me && Date.now() - lock.at < STALE_MS) return { ok: false, holder: lock.label };

  await chrome.storage.session.set({ [KEY]: { owner: me, label, at: Date.now() } });
  // Re-read: if another page wrote in the same instant, the later write wins.
  const { [KEY]: check } = await chrome.storage.session.get(KEY);
  if (check?.owner !== me) return { ok: false, holder: check?.label };

  clearInterval(beat);
  beat = setInterval(() => {
    chrome.storage.session.set({ [KEY]: { owner: me, label, at: Date.now() } }).catch(() => {});
  }, BEAT_MS);
  return { ok: true };
}

export async function release() {
  clearInterval(beat);
  beat = null;
  const { [KEY]: lock } = await chrome.storage.session.get(KEY);
  if (lock?.owner === me) await chrome.storage.session.remove(KEY);
}
