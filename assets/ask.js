/* Ask Deals: a question box over the files already on this site. Answers come from AskDealsModel only. */
(function () {
  'use strict';
  if (typeof document === 'undefined' || document.getElementById('askd-fab')) return;
  const KEY = 'dealsAskHistory';
  const PASS_KEY = 'dealsAskPass';
  const AI_NOTE = 'AI answer with web search. Not from the site files. Check the sources before relying on it.';
  const SUGGESTIONS = [
    'How many current lots in Manchester?',
    'Cheapest flats in Liverpool under £80k',
    'Rent gap for 3 bed in Bristol',
    'Which contracts are on file for Bristol?',
    'Temporary accommodation in Manchester',
    'What are the 14 hurdles?'
  ];
  let history = [];
  try { history = JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (error) { history = []; }
  let ready = null;
  const ctx = {};

  const style = document.createElement('style');
  style.textContent = '#askd-fab{position:fixed;right:18px;bottom:18px;z-index:80;background:#021a2b;color:#fff;border:0;border-radius:22px;padding:11px 16px;font:600 14px inherit;cursor:pointer;box-shadow:0 6px 18px rgba(2,26,43,.25)}' +
    '#askd-pane{position:fixed;right:18px;bottom:68px;z-index:80;width:min(440px,calc(100vw - 24px));height:min(640px,calc(100vh - 96px));background:#fff;color:#021a2b;border:1px solid #e3e7ec;border-radius:12px;box-shadow:0 12px 32px rgba(2,26,43,.18);display:flex;flex-direction:column}' +
    '#askd-pane.hidden{display:none}#askd-log{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px}' +
    '#askd-hd{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #e3e7ec}' +
    '#askd-hd button{border:0;background:transparent;color:#5b6472;cursor:pointer;font:inherit;font-size:13px}' +
    '#askd-f{display:flex;gap:6px;padding:8px;border-top:1px solid #e3e7ec}' +
    '#askd-f textarea{flex:1;resize:none;height:46px;font:inherit;padding:8px;border:1px solid #e3e7ec;border-radius:8px}' +
    '#askd-go{background:#021a2b;color:#fff;border:0;border-radius:8px;padding:0 14px;font-weight:600;cursor:pointer}#askd-go:disabled{opacity:.5}' +
    '.askd-m{padding:8px 10px;border-radius:8px;white-space:pre-wrap;font-size:14px;line-height:1.4;overflow-wrap:anywhere}' +
    '.askd-u{align-self:flex-end;background:#021a2b;color:#fff;max-width:88%}.askd-a{background:#f1f3f6;max-width:100%}' +
    '.askd-tools{font-size:11px;color:#5b6472;margin-bottom:4px}' +
    '.askd-cite{display:inline-block;margin:6px 4px 0 0;border:1px solid #cfd8e3;background:#fff;color:#021a2b;border-radius:6px;padding:3px 8px;cursor:pointer;font:inherit;font-size:12px;text-decoration:none}' +
    '.askd-ai{background:#fff8e6;border:1px solid #f0dca8}.askd-pass{display:flex;gap:6px;margin-top:6px}.askd-pass input{flex:1;min-width:0;font:inherit;padding:6px 8px;border:1px solid #cfd8e3;border-radius:6px}' +
    '.askd-foot{margin:0;padding:0 12px 8px;font-size:11px;color:#5b6472}' +
    '@media(max-width:700px){#askd-fab{right:12px;bottom:12px}#askd-pane{right:12px;bottom:62px}}';
  document.head.appendChild(style);

  const fab = document.createElement('button');
  fab.id = 'askd-fab';
  fab.type = 'button';
  fab.textContent = 'Ask Deals';
  const pane = document.createElement('div');
  pane.id = 'askd-pane';
  pane.className = 'hidden';
  pane.innerHTML = '<div id="askd-hd"><b>Ask Deals</b><span><button type="button" id="askd-clear">Clear</button> <button type="button" id="askd-x">Close</button></span></div><div id="askd-log"></div><form id="askd-f"><textarea id="askd-q" maxlength="600" placeholder="Ask about lots, the rent gap, sold prices, contracts or demand"></textarea><button type="submit" id="askd-go">Ask</button></form><p class="askd-foot">Screening research, not an investment recommendation or credit approval. Answers use the files on this site. The wider AI is marked when used.</p>';
  document.body.append(fab, pane);
  const log = pane.querySelector('#askd-log');
  const input = pane.querySelector('#askd-q');

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])); }
  function safeHref(href) { return /^https?:\/\//i.test(String(href || '')) ? String(href) : ''; }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(history.slice(-16))); } catch (error) {} }
  function getJson(path) { return fetch(path).then((response) => response.ok ? response.json() : null).catch(() => null); }

  function ensure() {
    if (ready) return ready;
    ready = Promise.all([
      getJson('data/auctions/lots.json'),
      getJson('data/rent-scenarios.json'),
      getJson('prices.json'),
      getJson('contracts.json'),
      getJson('demand.json')
    ]).then((files) => {
      const book = files[0];
      const isCurrent = window.lcCurrentLot && window.lcCurrentLot.currentLot;
      const today = window.lcCurrentLot && window.lcCurrentLot.londonDay ? window.lcCurrentLot.londonDay() : undefined;
      ctx.lots = book && Array.isArray(book.lots) ? book.lots.filter((lot) => isCurrent ? isCurrent(lot, today) : true) : [];
      ctx.lotsUpdated = book && book.updated_at;
      ctx.rentGap = files[1] && window.lcRentGap && window.lcRentGap.build ? window.lcRentGap.build(files[1]) : null;
      ctx.prices = files[2];
      ctx.contracts = Array.isArray(files[3]) ? files[3] : [];
      ctx.demand = files[4];
      return ctx;
    });
    return ready;
  }

  function go(action) {
    if (!action || action.type !== 'navigate' || typeof window.viewMode !== 'function') return;
    window.lcUserNav = true;
    window.viewMode(action.view);
    if (window.matchMedia && window.matchMedia('(max-width:700px)').matches) pane.classList.add('hidden');
  }

  function draw(extra) {
    log.innerHTML = '';
    if (!history.length && !extra) {
      log.innerHTML = '<div class="askd-m askd-a"><div class="askd-tools">Reads the auction lots, rent tables, sold prices, contracts and demand files already on this site.</div>Ask a question. I give the figure and where it comes from. I do not estimate a rent, a yield or a value.</div><div>' + SUGGESTIONS.map((item) => '<button type="button" class="askd-cite askd-sug">' + esc(item) + '</button>').join('') + '</div>';
      log.querySelectorAll('.askd-sug').forEach((button) => button.onclick = () => ask(button.textContent));
      return;
    }
    for (const message of history) {
      const block = document.createElement('div');
      block.className = 'askd-m ' + (message.role === 'user' ? 'askd-u' : 'askd-a') + (message.ai ? ' askd-ai' : '');
      if (message.role === 'user') block.textContent = message.content;
      else {
        const cites = (message.citations || []).map((cite) => safeHref(cite.href) ? '<a class="askd-cite" target="_blank" rel="noopener" href="' + esc(safeHref(cite.href)) + '">' + esc(cite.label || 'Source') + '</a>' : '').join('');
        const actions = (message.actions || []).map((action, index) => '<button type="button" class="askd-cite" data-a="' + index + '">Open ' + esc(action.label || action.view) + '</button>').join('');
        const head = message.ai ? '<div class="askd-tools">' + esc(AI_NOTE) + '</div>' : (message.trace && message.trace.length ? '<div class="askd-tools">Used: ' + esc(message.trace.join(', ')) + '</div>' : '');
        const wider = message.q && !message.ai && !message.needPass ? '<button type="button" class="askd-cite" data-w="1">Ask the wider AI</button>' : '';
        const pass = message.needPass ? '<form class="askd-pass"><input type="password" autocomplete="off" maxlength="80" placeholder="Passcode" aria-label="Passcode"><button type="submit" class="askd-cite" style="margin:0">Unlock</button></form>' : '';
        block.innerHTML = head + esc(message.content) + '<div>' + cites + actions + wider + '</div>' + pass;
        block.querySelectorAll('[data-a]').forEach((button) => button.onclick = () => go(message.actions[button.dataset.a]));
        block.querySelectorAll('[data-w]').forEach((button) => button.onclick = () => wider_(message.q));
        const form = block.querySelector('.askd-pass');
        if (form) form.onsubmit = (event) => { event.preventDefault(); const value = form.querySelector('input').value.trim(); if (!value) return; setPass(value); message.needPass = false; wider_(message.q); };
      }
      log.appendChild(block);
    }
    if (extra) { const wait = document.createElement('div'); wait.className = 'askd-m askd-a'; wait.textContent = extra; log.appendChild(wait); }
    log.scrollTop = log.scrollHeight;
  }

  async function ask(text) {
    text = String(text || '').trim();
    if (!text) return;
    history.push({role: 'user', content: text});
    draw('Checking the files on this site...');
    pane.querySelector('#askd-go').disabled = true;
    try {
      await ensure();
      const result = window.AskDealsModel.answer(text, ctx);
      const open = result.trace.indexOf('no_match') >= 0;
      if (open && getPass()) { pane.querySelector('#askd-go').disabled = false; return wider_(text); }
      history.push({role: 'assistant', content: result.text, trace: result.trace, citations: result.citations, actions: result.actions, q: result.trace.indexOf('list_tabs') >= 0 ? '' : text});
    } catch (error) {
      history.push({role: 'assistant', content: 'The files could not be read: ' + (error && error.message ? error.message : 'unknown error'), trace: ['error'], citations: [], actions: []});
    }
    pane.querySelector('#askd-go').disabled = false;
    save();
    draw();
  }

  function getPass() { try { return localStorage.getItem(PASS_KEY) || ''; } catch (error) { return ''; } }
  function setPass(value) { try { if (value) localStorage.setItem(PASS_KEY, value); else localStorage.removeItem(PASS_KEY); } catch (error) {} }
  function say(content, more) { history.push(Object.assign({role: 'assistant', content: content, trace: [], citations: [], actions: []}, more || {})); save(); draw(); }

  // Wider answers come from a server function that holds the AI key. Nothing secret is in this page.
  async function wider_(question) {
    question = String(question || '').trim();
    if (!question) return;
    const base = typeof SUPA_URL !== 'undefined' ? SUPA_URL : '';
    const anon = typeof SUPA_KEY !== 'undefined' ? SUPA_KEY : '';
    if (!base) return say('The wider AI is not switched on for this site.');
    if (!getPass()) return say('The wider AI needs the passcode. It is asked once on this device.', {needPass: true, q: question});
    draw('Asking the wider AI. This can take a few seconds...');
    pane.querySelector('#askd-go').disabled = true;
    let status = 0;
    let body = null;
    try {
      const response = await fetch(base + '/functions/v1/ask-deals', {method: 'POST', headers: {'content-type': 'application/json', apikey: anon, Authorization: 'Bearer ' + anon}, body: JSON.stringify({question: question, passcode: getPass()})});
      status = response.status;
      body = await response.json().catch(() => null);
    } catch (error) { status = -1; }
    pane.querySelector('#askd-go').disabled = false;
    if (status === 200 && body && body.text) return say(body.text, {ai: true, citations: (body.sources || []).map((source) => ({label: String(source.title || 'Source').slice(0, 48), href: source.url}))});
    if (status === 401 && body && body.error === 'wrong_passcode') { setPass(''); return say('That passcode was not accepted. Enter it again.', {needPass: true, q: question}); }
    if (status === 404 || status === 503 || status === -1) return say('The wider AI is not switched on yet, so I can only answer from the site files.');
    return say('The wider AI could not answer just now. Try again in a minute.');
  }

  fab.onclick = () => { pane.classList.toggle('hidden'); if (!pane.classList.contains('hidden')) { draw(); input.focus(); } };
  pane.querySelector('#askd-x').onclick = () => pane.classList.add('hidden');
  pane.querySelector('#askd-clear').onclick = () => { history = []; save(); draw(); };
  pane.querySelector('#askd-f').onsubmit = (event) => { event.preventDefault(); const text = input.value; input.value = ''; ask(text); };
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); pane.querySelector('#askd-f').requestSubmit(); } });
  window.AskDeals = {ask, wider: wider_, open() { pane.classList.remove('hidden'); draw(); }};
})();
