/* Give every page the board layout. Detail stays behind Show detail. */
(function () {
  'use strict';
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  const TITLES = {
    auctions: ['Auctions', 'Current lots'],
    assets: ['Find', 'Where to look'],
    distress: ['Leads', 'Who has to sell'],
    deal: ['Deal', 'The decision'],
    comps: ['Comps', 'Sold prices'],
    rentgap: ['Rents and ONS', 'Allowance against market rent'],
    map: ['Map', 'One town at a time'],
    valuation: ['Local OMV / LHA', 'Sold evidence'],
    accom: ['Demand', 'Published figures'],
    pipeline: ['Pipeline', 'Stages in this browser'],
    shortlist: ['Shortlist', 'Marked sites'],
    overview: ['Overview', 'The book']
  };
  const SCREEN = new Set(['board', 'assets', 'rentgap']);
  let mode = '';
  let painting = false;
  let ticket = 0;
  let quiet = false;

  function counts(nodes, pick) {
    const map = new Map();
    nodes.forEach((node) => {
      const key = pick(node) || 'Not stated';
      map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, count]) => ({label, count}));
  }
  function bars(rows, filter) {
    const max = Math.max(1, ...rows.map((row) => row.count));
    if (!rows.length) return '<p>Not yet recorded</p>';
    return rows.map((row) => {
      const mute = /not stated|not published|no guide|ungraded/i.test(row.label);
      return '<button type="button" class="bd-bar' + (mute ? ' muted' : '') + '" data-sheet="' + esc(row.label) + '"><span>' + esc(row.label) + '</span><i><b style="width:' + Math.max(4, row.count / max * 100) + '%"></b></i><em>' + row.count + '</em></button>';
    }).join('');
  }
  function head(title, kpis, chartTitle, series, takes) {
    return '<div class="bd-top"><div><p class="bd-kicker">' + esc(title[0]) + '</p><h1>' + esc(title[1]) + '</h1></div></div>'
      + '<div class="bd-kpis">' + kpis.map((row) => '<div class="bd-tile"><span>' + esc(row[0]) + '</span><b>' + esc(row[1]) + '</b></div>').join('') + '</div>'
      + '<div class="bd-charts"><article class="bd-chart"><h2>' + esc(chartTitle) + '</h2>' + bars(series) + '</article><article class="bd-chart"><h2>Takeaways</h2><ul class="bd-take">' + takes.map((line) => '<li>' + esc(line) + '</li>').join('') + '</ul></article></div>';
  }
  function spec(name, root) {
    const title = TITLES[name] || ['Sheet', 'Detail'];
    if (name === 'auctions') {
      const cards = [...root.querySelectorAll('.aq-lot')];
      const series = counts(cards, (card) => {
        const eye = card.querySelector('.aq-eyebrow');
        return eye ? eye.textContent.split('·').slice(1).join('·').trim() : 'Not stated';
      });
      const beds = cards.filter((card) => /\b[34]\s*-?\s*bed/i.test(card.textContent)).length;
      return head(title, [['Current lots', String(cards.length || 'Not yet recorded')], ['3 or 4 bed stated', String(beds)], ['Types', String(series.length)]], 'Lots by type', series, [
        cards.length ? cards.length + ' current lots are listed. Sold, unsold, withdrawn and past lots stay out.' : 'Lots are still loading.',
        beds + ' of the visible cards state 3 or 4 bed.',
        'None of these cards are treated as reserved matters discharged unless the listing says so.'
      ]);
    }
    if (name === 'assets') {
      const cities = [...root.querySelectorAll('.ios-city')];
      const series = cities.map((city) => ({label: (city.querySelector('.ios-city-name') || {}).textContent || city.textContent.slice(0, 18), count: 1}));
      return head(title, [['Areas', String(cities.length || 'Not yet recorded')], ['With a price', String(cities.filter((city) => /£/.test(city.textContent)).length)]], 'Areas', series, [
        'Open an area to see who has to sell there.',
        'A price is shown only where a floor area or a 2025 sale median is on file.',
        'This is a screen, not a valuation.'
      ]);
    }
    if (name === 'distress') {
      const rows = [...root.querySelectorAll('.dm-row')];
      const series = counts(rows, (row) => ((row.querySelector('.dm-tag, .lvl') || {}).textContent || 'Not stated').trim().slice(0, 24));
      return head(title, [['Sites', String(rows.length || 'Not yet recorded')], ['Bands', String(series.length)]], 'Sites by band', series, [
        rows.length ? rows.length + ' sites are on the list.' : 'The lead list is still loading.',
        'A is a live insolvency. B is a lender or receiver sale. C is a watchlist.',
        'A blank band is not proof the owner is healthy.'
      ]);
    }
    if (name === 'deal') {
      let saved = [];
      try { saved = JSON.parse(localStorage.getItem('ed_uw_deals') || '[]'); } catch (error) { saved = []; }
      if (!Array.isArray(saved)) saved = [];
      const examples = window.lcGates && window.lcGates.examples ? window.lcGates.examples() : [];
      const loaded = window.lcGates && window.lcGates.exampleId ? window.lcGates.exampleId() : '';
      // The example and the saved models open from here, so neither is hidden in a list or a fold further down.
      const pick = (attr, id, label, note, on) => '<button type="button" class="bd-row' + (on ? ' on' : '') + '" ' + attr + '="' + esc(id) + '"><span style="max-width:none;white-space:normal">' + esc(label) + '</span><i style="background:none"></i><em>' + esc(note) + '</em></button>';
      const shown = saved.filter((row) => row && row.state).slice(0, 8);
      const list = examples.map((item) => pick('data-deal-example', item.id, item.title, item.id === loaded ? 'Example, loaded' : 'Example, open', item.id === loaded)).join('')
        + shown.map((row) => pick('data-deal-saved', row.id, (row.state.name || row.state.pc || 'Unnamed deal'), 'Saved ' + (row.date || 'date not recorded') + ', open', false)).join('')
        + (saved.length > shown.length ? '<p class="bd-src">' + (saved.length - shown.length) + ' more saved in the full underwriting model below.</p>' : '')
        + (!examples.length && !saved.length ? '<p>Not yet recorded</p>' : '');
      return '<div class="bd-top"><div><p class="bd-kicker">' + esc(title[0]) + '</p><h1>' + esc(title[1]) + '</h1></div></div>'
        + '<div class="bd-kpis">' + [['Examples', String(examples.length)], ['Saved models', String(saved.length)]].map((row) => '<div class="bd-tile"><span>' + esc(row[0]) + '</span><b>' + esc(row[1]) + '</b></div>').join('') + '</div>'
        + '<div class="bd-charts"><article class="bd-chart"><h2>Examples and saved models</h2>' + list + '</article><article class="bd-chart"><h2>Takeaways</h2><ul class="bd-take">' + [
          saved.length ? saved.length + ' underwriting model' + (saved.length === 1 ? ' is' : 's are') + ' saved in this browser.' : 'No underwriting model is saved yet.',
          examples.length ? 'An example is a published illustration, not advice.' : 'No example is published.',
          'Enter rent and costs yourself. A public contract is not a rent offer.',
          'Download the workbook if you need the figures outside this browser.'
        ].map((line) => '<li>' + esc(line) + '</li>').join('') + '</ul></article></div>';
    }
    if (name === 'rentgap') {
      const cards = [...root.querySelectorAll('.ios-gap')];
      const series = counts(cards, (card) => ((card.querySelector('.lc-kicker') || {}).textContent || '').split('·').pop().trim() || 'Not stated');
      return head(title, [['Comparisons', String(cards.length || 'Not yet recorded')]], 'Gaps by area', series, [
        'Open-market rent minus the Local Housing Allowance, both monthly.',
        'September 2026 ONS rents and 2026/27 allowances.',
        'A missing comparison is not yet recorded. It is not zero.'
      ]);
    }
    const rows = [...root.querySelectorAll('tbody tr, .card, .opc')].slice(0, 80);
    const series = counts(rows, (row) => (row.cells && row.cells[0] ? row.cells[0].textContent : row.textContent).trim().slice(0, 22));
    return head(title, [['Records', String(rows.length || 'Not yet recorded')]], 'What is on this sheet', series, [
      rows.length ? rows.length + ' records are in the detail.' : 'Detail is still loading.',
      'Open Show detail for the full list.',
      'A blank figure is not yet recorded.'
    ]);
  }
  function wire(headEl, root) {
    headEl.querySelectorAll('[data-sheet]').forEach((button) => button.onclick = () => {
      const label = button.dataset.sheet;
      const on = button.classList.toggle('on');
      headEl.querySelectorAll('[data-sheet]').forEach((other) => { if (other !== button) other.classList.remove('on'); });
      const fold = root.querySelector(':scope > details.sheet-detail, details.sheet-detail');
      if (fold) fold.open = true;
      const items = root.querySelectorAll('.aq-lot, .ios-city, .dm-row, .ios-gap, tbody tr');
      items.forEach((item) => { item.style.display = !on || item.textContent.toLowerCase().includes(label.toLowerCase()) ? '' : 'none'; });
    });
  }
  function apply(root, html) {
    if (!root || !html) return;
    let headEl = root.querySelector(':scope > .sheet-head');
    if (!headEl) {
      headEl = document.createElement('div');
      headEl.className = 'bd sheet-head';
      root.insertBefore(headEl, root.firstChild);
    }
    headEl.innerHTML = html;
    wire(headEl, root);
    if (root.querySelector(':scope > details.sheet-detail')) return;
    const fold = document.createElement('details');
    fold.className = 'bd-fold sheet-detail';
    const summary = document.createElement('summary');
    summary.textContent = 'Show detail';
    fold.appendChild(summary);
    const kids = [...root.children].filter((node) => node !== headEl && !node.classList.contains('sheet-keep'));
    root.appendChild(fold);
    kids.forEach((node) => fold.appendChild(node));
  }
  function ownRoot(next) {
    if (next === 'entry') return document.getElementById('me-panel');
    if (next === 'assets' || next === 'rentgap') return document.getElementById('lc_screen');
    return document.getElementById(next + '_view');
  }
  function dress(next) {
    if (!next || next === 'board' || next === 'entry' || painting) return;
    const root = ownRoot(next);
    if (!root || root.classList.contains('hidden') || root.hidden) return;
    if (next === 'entry' && root.querySelector('.bd-kpis')) return;
    mode = next;
    const screen = document.getElementById('lc_screen');
    if (screen && !SCREEN.has(next)) screen.hidden = true;
    painting = true;
    quiet = true;
    try { apply(root, spec(next, root)); }
    finally {
      painting = false;
      queueMicrotask(() => { quiet = false; });
    }
  }
  const previous = window.viewMode;
  if (typeof previous === 'function') {
    window.viewMode = function (next) {
      const mine = ++ticket;
      const screen = document.getElementById('lc_screen');
      if (screen && next) screen.hidden = !SCREEN.has(next);
      const out = previous.apply(this, arguments);
      const run = () => { if (mine === ticket) dress(next); };
      setTimeout(run, 40);
      setTimeout(run, 900);
      return out;
    };
  }
  function watch(id, name, subtree) {
    const node = document.getElementById(id);
    if (!node || !window.MutationObserver) return;
    const observer = new MutationObserver(() => { if (!quiet && !painting && mode === name) dress(name); });
    observer.observe(node, {childList: true, subtree: !!subtree});
  }
  watch('auctions_body', 'auctions', false);
  watch('distress_view', 'distress', true);
  watch('comps_view', 'comps', true);
  watch('deal_view', 'deal', true);
  watch('map_view', 'map', true);
  watch('valuation_view', 'valuation', true);
  watch('accom_view', 'accom', true);
  watch('pipeline_view', 'pipeline', true);
  watch('shortlist_view', 'shortlist', true);
  watch('overview_view', 'overview', true);
  document.addEventListener('click', (event) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const summary = event.target.closest('summary');
    if (!summary) return;
    const details = summary.parentElement;
    if (!details || details.tagName !== 'DETAILS' || details.classList.contains('lc-inline') || !details.open) return;
    event.preventDefault();
    details.classList.add('is-closing');
    window.setTimeout(() => {
      details.open = false;
      details.classList.remove('is-closing');
    }, 250);
  }, true);
  // Deal sheet: open an example or a saved model from the list at the top.
  document.addEventListener('click', (event) => {
    const example = event.target.closest('[data-deal-example]');
    const model = example ? null : event.target.closest('[data-deal-saved]');
    if (!example && !model) return;
    if (example) {
      if (!(window.lcGates && window.lcGates.loadExample && window.lcGates.loadExample(example.dataset.dealExample))) return;
    } else {
      let saved = [];
      try { saved = JSON.parse(localStorage.getItem('ed_uw_deals') || '[]'); } catch (error) { saved = []; }
      const row = Array.isArray(saved) ? saved.find((item) => item && String(item.id) === model.dataset.dealSaved) : null;
      if (!row || !row.state || typeof UW === 'undefined') return;
      UW.state = JSON.parse(JSON.stringify(row.state));
      if (typeof uwStore === 'function') uwStore();
      if (typeof uwStart === 'function') uwStart();
    }
    const gates = document.getElementById('gates_root');
    if (gates) gates.scrollIntoView({block: 'start'});
  });
  window.lcSheets = {dress};
})();
