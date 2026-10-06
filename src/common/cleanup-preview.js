// The cleanup preview: a checklist of candidates, by email or by sender.
// Nothing is pre-selected and nothing is trashed until the user presses the
// confirm button. Email text is untrusted, so it only ever goes in textContent.

const pct = (n) => `${Math.round((n ?? 0) * 100)}%`;

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node[k] = v;
  }
  node.append(...children.filter(Boolean));
  return node;
}

/**
 * Render into `container`. `groups` is groupBySender(candidates).
 * onConfirm(ids) is called with exactly the ids the user ticked.
 */
export function renderCleanupPreview(container, { candidates, groups, onConfirm, onCancel }) {
  const selected = new Set();
  let view = 'sender';

  const count = el('span', { class: 'cp-count' });
  const confirm = el('button', { type: 'button', class: 'danger', text: 'Move to Trash' });
  const list = el('div', { class: 'cp-list' });

  const refresh = () => {
    confirm.disabled = selected.size === 0;
    confirm.textContent = selected.size ? `Move ${selected.size} to Trash` : 'Move to Trash';
    count.textContent = `${selected.size} of ${candidates.length} selected`;
    for (const box of list.querySelectorAll('input[data-id]')) box.checked = selected.has(box.dataset.id);
    for (const box of list.querySelectorAll('input[data-sender]')) {
      const ids = groups.find((g) => g.fromEmail === box.dataset.sender).items.map((i) => i.id);
      const n = ids.filter((id) => selected.has(id)).length;
      box.checked = n === ids.length;
      box.indeterminate = n > 0 && n < ids.length;
    }
  };

  const itemRow = (c) => {
    const box = el('input', { type: 'checkbox' });
    box.dataset.id = c.id;
    box.addEventListener('change', () => {
      if (box.checked) selected.add(c.id);
      else selected.delete(c.id);
      refresh();
    });
    return el('label', { class: 'cp-item' },
      box,
      el('span', { class: 'cp-from', text: c.fromName || c.fromEmail, title: c.fromEmail }),
      el('span', { class: 'cp-subject', text: c.subject, title: c.subject }),
      el('span', { class: 'cp-reason', text: c.reason }),
      el('span', { class: 'cp-conf', text: pct(c.confidence), title: 'Junk confidence' })
    );
  };

  const draw = () => {
    list.replaceChildren();
    if (view === 'email') {
      list.append(...candidates.map(itemRow));
    } else {
      for (const g of groups) {
        const box = el('input', { type: 'checkbox' });
        box.dataset.sender = g.fromEmail;
        box.addEventListener('click', (e) => e.stopPropagation());
        box.addEventListener('change', () => {
          for (const i of g.items) {
            if (box.checked) selected.add(i.id);
            else selected.delete(i.id);
          }
          refresh();
        });
        const summary = el('summary', { class: 'cp-group' },
          box,
          el('span', { class: 'cp-group-n', text: String(g.items.length) }),
          el('span', { text: ` email${g.items.length === 1 ? '' : 's'} from ` }),
          el('b', { text: g.fromEmail })
        );
        list.append(el('details', {}, summary, ...g.items.map(itemRow)));
      }
    }
    refresh();
  };

  const tab = (name, label) => {
    const b = el('button', { type: 'button', class: 'ghost', text: label });
    b.addEventListener('click', () => {
      view = name;
      for (const t of tabs.children) t.classList.toggle('on', t === b);
      draw();
    });
    if (name === view) b.classList.add('on');
    return b;
  };
  const tabs = el('span', { class: 'cp-tabs' }, tab('sender', 'By sender'), tab('email', 'By email'));

  const all = el('button', { type: 'button', class: 'linkish', text: 'Select all' });
  all.addEventListener('click', () => {
    for (const c of candidates) selected.add(c.id);
    refresh();
  });
  const none = el('button', { type: 'button', class: 'linkish', text: 'Select none' });
  none.addEventListener('click', () => {
    selected.clear();
    refresh();
  });

  const cancel = el('button', { type: 'button', class: 'ghost', text: 'Cancel' });
  cancel.addEventListener('click', () => onCancel?.());
  confirm.addEventListener('click', () => {
    if (selected.size) onConfirm([...selected]);
  });

  container.replaceChildren(
    el('h2', { text: 'Clean up — preview' }),
    el('p', { class: 'hint', text: candidates.length
      ? 'Nothing has been touched. Tick what you want gone, then confirm. Selected emails go to Gmail\'s Trash (emptied after 30 days) and can be restored with Undo.'
      : 'No emails are safe to clean up right now. Starred, important, needs-reply, High priority, protected categories and senders, recent and low-confidence emails are always skipped.' }),
    candidates.length ? el('div', { class: 'cp-bar' }, tabs, all, none, el('span', { class: 'spacer' }), count) : null,
    candidates.length ? list : null,
    el('footer', {}, el('span', { class: 'spacer' }), cancel, candidates.length ? confirm : null)
  );
  draw();
}
