export function createGlobalChat(send) {
  const root = document.querySelector('#global-chat');
  if (!root) return;
  const toggle = root.querySelector('#chat-toggle');
  const panel = root.querySelector('#chat-panel');
  const log = root.querySelector('#chat-log');
  const feed = root.querySelector('#chat-feed');
  const form = root.querySelector('form');
  const input = form.querySelector('input');
  const status = root.querySelector('#chat-status');
  let profile, rows = [], initialized = false;
  const seen = new Set(), timers = new Set();
  const lines = new Map();

  function render() {
    const follow = log.scrollHeight - log.scrollTop - log.clientHeight < 20;
    const retained = new Set(rows.map(row => row.id));
    for (const [id, line] of lines) {
      if (retained.has(id)) continue;
      line.remove();
      lines.delete(id);
    }
    if (!rows.length) {
      log.textContent = 'No messages yet.';
      return;
    }
    if (!lines.size) log.replaceChildren();
    for (const row of rows) {
      if (lines.has(row.id)) continue;
      const line = document.createElement('p');
      const author = document.createElement('strong');
      author.textContent = row.name;
      line.append(author, document.createTextNode(' ' + row.body));
      log.append(line);
      lines.set(row.id, line);
    }
    if (follow) log.scrollTop = log.scrollHeight;
  }
  function clearFeed() {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    feed.replaceChildren();
  }
  function showMessage(row) {
    const line = document.createElement('p');
    const author = document.createElement('strong');
    author.textContent = row.name;
    line.append(author, document.createTextNode(' ' + row.body));
    feed.append(line);
    while (feed.children.length > 4) feed.firstElementChild.remove();
    const timer = setTimeout(() => { line.remove(); timers.delete(timer); }, 8000);
    timers.add(timer);
  }
  function expand(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      clearFeed();
      render();
      log.scrollTop = log.scrollHeight;
    } else if (!root.hidden) toggle.focus();
  }
  toggle.onclick = () => expand(panel.hidden);
  root.querySelector('#chat-close').onclick = () => expand(false);
  root.onkeydown = event => {
    event.stopPropagation();
    if (event.key === 'Escape') expand(false);
  };
  form.onsubmit = async event => {
    event.preventDefault();
    const body = input.value.trim();
    if (!body || input.readOnly || profile === undefined) return;
    const sender = profile;
    input.readOnly = true;
    status.textContent = '';
    try {
      await send(body);
      if (sender === profile) input.value = '';
    } catch (error) {
      if (sender === profile) status.textContent = error.message || 'Could not send your message. Try again.';
    } finally {
      if (sender === profile) input.readOnly = false;
    }
  };
  return (account, messages) => {
    if (profile !== account) {
      root.hidden = account === undefined;
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      input.value = '';
      input.readOnly = false;
      status.textContent = '';
      log.replaceChildren();
      lines.clear();
      clearFeed();
      seen.clear();
      initialized = false;
    }
    if (account !== undefined) {
      for (const row of messages) {
        if (initialized && !seen.has(row.id) && panel.hidden) showMessage(row);
        seen.add(row.id);
      }
      initialized = true;
      const current = new Set(messages.map(row => row.id));
      for (const id of seen) if (!current.has(id)) seen.delete(id);
    }
    profile = account;
    rows = account === undefined ? [] : messages;
    if (!panel.hidden) render();
  };
}
