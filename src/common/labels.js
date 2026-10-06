// Turns stored classifications into Gmail labels ("folders").
//
// Gmail has no folders: moving an email into one means adding a label and, if
// the user asked for it, removing INBOX (archiving). Everything here is
// reversible: labels can be removed, and archived mail is still in All Mail.

import { listLabels, createLabel, batchModify, BATCH_LIMIT } from './gmail.js';
import { putEmails } from './db.js';

export const ROOT = 'Jev';
export const REVIEW = `${ROOT}/Review`;
export const NEEDS_REPLY = `${ROOT}/Needs Reply`;
export const PRIORITY_ROOT = `${ROOT}/Priority`;
const PRIORITIES = ['High', 'Medium', 'Low'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Gmail nests on "/", so "Finance/Invoices" would become two levels. Keep each
// category one level under Jev/.
export function categoryLabel(category) {
  return `${ROOT}/${String(category).replace(/\s*\/\s*/g, ' & ').trim()}`;
}

export function allLabelNames(categories) {
  return [
    ROOT,
    ...categories.map((c) => categoryLabel(c.name)),
    PRIORITY_ROOT,
    ...PRIORITIES.map((p) => `${PRIORITY_ROOT}/${p}`),
    NEEDS_REPLY,
    REVIEW
  ];
}

/** Create any missing Jev/... labels. Returns a name -> id map of all of them. */
export async function ensureLabels(settings, { signal } = {}) {
  const existing = await listLabels({ signal });
  const byName = new Map(existing.map((l) => [l.name, l.id]));

  // Parents first, so Gmail shows them nested.
  for (const name of allLabelNames(settings.categories)) {
    if (byName.has(name)) continue;
    try {
      const label = await createLabel(name, { signal });
      byName.set(name, label.id);
    } catch (err) {
      // Created by another run in the meantime: re-read rather than fail.
      if (!/409|exists/i.test(err.message)) throw err;
      for (const l of await listLabels({ signal })) byName.set(l.name, l.id);
    }
  }
  return byName;
}

/** True when any answer that drives a label is less sure than the threshold. */
export function isLowConfidence(result, threshold) {
  const scores = [result.categoryConfidence, result.priorityConfidence, result.confidence?.needsReply];
  return scores.some((c) => typeof c !== 'number' || c < threshold);
}

/**
 * Which label names one classified email should carry. Low confidence gets
 * Jev/Review and nothing else: no category, no priority, no archiving.
 */
export function planLabels(result, settings) {
  if (isLowConfidence(result, settings.confidenceThreshold)) {
    return { names: [REVIEW], archive: false, review: true };
  }
  const names = [categoryLabel(result.category), `${PRIORITY_ROOT}/${result.priority}`];
  if ((result.reply ?? 0) >= 0.5) names.push(NEEDS_REPLY);

  const archive = Boolean(settings.archiveAfterLabeling) &&
    (settings.archiveCategories || []).includes(result.category);
  return { names, archive, review: false };
}

/**
 * Apply labels to every classified email that has a Gmail message id and whose
 * labels are out of date. Emails needing the same change share one
 * batchModify call.
 */
export async function applyLabels(settings, rows, { onEvent = () => {}, signal } = {}) {
  const targets = rows.filter((r) => r.result && !r.id.startsWith('dom:'));
  if (!targets.length) {
    onEvent({ type: 'stage', stage: 'idle', text: 'Nothing to label yet. Classify first.' });
    return { labeled: 0, review: 0, archived: 0 };
  }

  onEvent({ type: 'stage', stage: 'labeling', text: 'Preparing Jev labels…' });
  const ids = await ensureLabels(settings, { signal });
  const jevIds = new Set([...ids].filter(([name]) => name === ROOT || name.startsWith(`${ROOT}/`)).map(([, id]) => id));

  // Group by the exact change, so one call covers every email that needs it.
  const groups = new Map();
  let review = 0;
  let archived = 0;
  for (const row of targets) {
    const plan = planLabels(row.result, settings);
    const add = plan.names.map((n) => ids.get(n)).filter(Boolean);
    // Drop Jev labels from an earlier verdict that no longer applies.
    const remove = [...jevIds].filter((id) => !add.includes(id));
    if (plan.archive) remove.push('INBOX');

    const signature = `${add.sort().join(',')}|${remove.sort().join(',')}`;
    if (row.labelsApplied === signature) continue;

    if (plan.review) review++;
    if (plan.archive) archived++;
    if (!groups.has(signature)) groups.set(signature, { add, remove, rows: [] });
    groups.get(signature).rows.push(row);
  }

  const total = [...groups.values()].reduce((n, g) => n + g.rows.length, 0);
  if (!total) {
    onEvent({ type: 'stage', stage: 'idle', text: 'Labels are already up to date.' });
    return { labeled: 0, review: 0, archived: 0 };
  }

  let done = 0;
  for (const [signature, group] of groups) {
    for (let i = 0; i < group.rows.length; i += BATCH_LIMIT) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const chunk = group.rows.slice(i, i + BATCH_LIMIT);
      await batchModify(chunk.map((r) => r.id), group, { signal });

      const updated = chunk.map((r) => {
        const labelIds = new Set(r.labelIds || []);
        for (const id of group.remove) labelIds.delete(id);
        for (const id of group.add) labelIds.add(id);
        return { ...r, labelIds: [...labelIds], labelsApplied: signature };
      });
      await putEmails(updated);
      done += chunk.length;
      onEvent({ type: 'rows', rows: updated });
      onEvent({ type: 'progress', phase: 'label', done, total });
      // A short pause between batches keeps well inside Gmail's per-user quota.
      await sleep(300);
    }
  }

  const parts = [`Labeled ${done} emails`];
  if (review) parts.push(`${review} sent to ${REVIEW}`);
  if (archived) parts.push(`${archived} archived`);
  onEvent({ type: 'stage', stage: 'idle', text: `${parts.join(', ')}.` });
  return { labeled: done, review, archived };
}
