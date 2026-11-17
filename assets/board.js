/* One-screen board for the selected area. Detail opens from a tile or a bar. */
(function () {
  'use strict';
  const M = window.BoardModel;
  if (!M) return;

  const state = {area: 'Manchester', drill: null, screen: null, error: '', loading: false};
  let cache = null;
  let pending = null;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  }
  function bars(rows, kind) {
    const max = Math.max(1, ...rows.map((row) => row.count || row.median || 0));
    if (!rows.length) return '<p>Not yet recorded</p>';
    return rows.slice(0, 8).map((row) => {
      const size = row.count != null ? row.count : row.median;
      const on = state.drill && state.drill.kind === kind && state.drill.id === row.id;
      const label = row.count != null ? row.count : M.money(row.median);
      const mute = /not stated|no guide|no date|unpublished/i.test(String(row.id) + ' ' + row.label);
      return '<button type="button" class="bd-bar' + (on ? ' on' : '') + (mute ? ' muted' : '') + '" data-kind="' + esc(kind) + '" data-id="' + esc(row.id) + '"><span>' + esc(row.label) + '</span><i><b style="width:' + Math.max(4, (size / max) * 100) + '%"></b></i><em>' + esc(label) + '</em></button>';
    }).join('');
  }
  function drillLots(rows) {
    const shown = rows.slice(0, 8);
    const rest = rows.slice(8);
    const line = (lot) => '<article class="bd-lot"><b>' + esc(lot.address) + '</b><p>' + esc(lot.buyLabel || 'No') + '. ' + esc(lot.type) + '. ' + esc(lot.beds === 'Not stated' ? 'Beds not stated' : lot.beds + ' bed') + '. ' + (lot.guide ? esc(M.money(lot.guide)) : 'No guide') + '. ' + esc(lot.date || 'No date') + (lot.buyReason ? '. ' + esc(lot.buyReason) : '') + '</p>' + (lot.url ? '<a href="' + esc(lot.url) + '" target="_blank" rel="noopener">Open the lot</a>' : '') + '</article>';
    return '<div class="bd-list">' + shown.map(line).join('') + '</div>' + (rest.length ? '<details class="bd-fold"><summary>Show detail (' + rest.length + ' more)</summary><div class="bd-list">' + rest.map(line).join('') + '</div></details>' : '');
  }
  function rentPairs(screen) {
    if (!screen.rents.length) return '<p>Not yet recorded</p>';
    return screen.rents.map((row) => {
      const ons = row.ons != null ? row.ons : row.ons3;
      const lha = row.lha;
      const max = Math.max(ons || 0, lha || 0, 1);
      return '<button type="button" class="bd-pair" data-kind="rent" data-id="' + esc(row.id) + '"><span>' + esc(String(row.label).replace(' bed', '')) + '</span><i><b class="ons" style="width:' + ((ons || 0) / max * 100) + '%"></b><b class="lha" style="width:' + ((lha || 0) / max * 100) + '%"></b></i></button>';
    }).join('');
  }
  function agentBars(area) {
    const rows = ((cache && cache.agents && cache.agents.agents) || []).filter((row) => row.area === area);
    const counts = {};
    rows.forEach((row) => { counts[row.type || 'Other'] = (counts[row.type || 'Other'] || 0) + 1; });
    const list = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, count]) => ({id, label: id.replace(' agent', '').replace('Sales and letting', 'Sales + let').replace('Registered provider', 'Provider'), count}));
    if (!list.length) return '<p>Not yet recorded</p>';
    return '<p class="bd-src">' + rows.length + ' branches</p>' + bars(list, 'agents');
  }
  function gngBars(area) {
    let workstreams = null;
    try {
      const saved = JSON.parse(localStorage.getItem('ed-market-entry-v1') || 'null');
      if (saved && saved.checklists && saved.checklists[area]) workstreams = saved.checklists[area].workstreams;
    } catch (error) { workstreams = null; }
    if (!workstreams && cache && cache.checklist) {
      const answers = (cache.checklist.answers && cache.checklist.answers[area]) || {};
      workstreams = (cache.checklist.workstreams || []).map((ws) => ({
        title: ws.title,
        items: (ws.items || []).map((item) => Object.assign({}, item, answers[item.id] || {}))
      }));
    }
    const streams = (workstreams || []).map((ws) => {
      const total = (ws.items || []).length;
      const done = (ws.items || []).filter((item) => item.done || item.status === 'done').length;
      return {id: ws.title, label: ws.title.replace('Local Authority 10-year Lease Agreements', 'LA leases').replace('Assembling A Portfolio', 'Portfolio'), count: done, total};
    });
    if (!streams.length) return '<p>Not yet recorded</p>';
    const done = streams.reduce((sum, row) => sum + row.count, 0);
    const total = streams.reduce((sum, row) => sum + row.total, 0);
    const barsHtml = streams.map((row) => '<button type="button" class="bd-bar" data-go="entry"><span>' + esc(row.label) + '</span><i><b style="width:' + (row.total ? Math.round(row.count / row.total * 100) : 0) + '%"></b></i><em>' + row.count + '/' + row.total + '</em></button>').join('');
    return '<p class="bd-src">' + done + ' of ' + total + ' done</p>' + barsHtml;
  }
  function html(screen) {
    const rent = screen.rents.find((row) => row.id === '3');
    const gapText = screen.area === 'Cheshire' ? 'Not yet recorded' : (rent && rent.gap != null ? M.money(rent.gap) : 'Not yet recorded');
    const compsText = screen.comps.rows.length ? M.money(M.median(screen.comps.rows.map((row) => row.median))) : 'Not yet recorded';
    const drill = state.drill;
    const matched = drill && drill.kind !== 'rent' && drill.kind !== 'comps' && drill.kind !== 'map' ? M.matches(screen, drill) : [];
    const drillTitle = !drill ? '' : drill.kind === 'rent' ? 'Rents' : drill.kind === 'comps' ? 'Sold prices' : drill.kind === 'map' ? 'Map' : (drill.label || drill.id);
    return '<div class="bd"><div class="bd-top"><div><p class="bd-kicker">Board</p><h1>' + esc(screen.area) + '</h1></div><label>Area <select id="bd-area">' + M.AREAS.map((area) => '<option' + (area === screen.area ? ' selected' : '') + '>' + esc(area) + '</option>').join('') + '</select></label></div>'
      + '<div class="bd-kpis">'
      + '<button type="button" class="bd-tile" data-kind="all" data-id="all"><span>Current lots</span><b>' + screen.lots.length + '</b></button>'
      + '<button type="button" class="bd-tile" data-kind="price" data-id=""><span>Median guide</span><b>' + esc(M.money(screen.medianGuide)) + '</b><span>' + screen.guideCount + ' published</span></button>'
      + '<button type="button" class="bd-tile" data-kind="rent" data-id="3"><span>3 bed rent gap</span><b>' + esc(gapText) + '</b><span>' + (screen.onsMonth ? esc(screen.onsMonth) + ' ONS minus the allowance' : 'ONS minus the allowance') + '</span></button>'
      + '<button type="button" class="bd-tile" data-kind="comps" data-id=""><span>District medians</span><b>' + esc(compsText) + '</b><span>' + (screen.comps.rows.length ? 'Middle of ' + screen.comps.rows.length + ' districts, ' + esc(screen.comps.year) : 'Land Registry') + '</span></button>'
      + '</div>'
      + (window.BuyBox ? window.BuyBox.cardHtml(screen.area, screen.buyCounts) : '')
      + (screen.gateCounts ? '<article class="bd-chart"><h2>Gates screen</h2><p class="bd-src">A catalogue lot is never a pass. Where rent is missing it stays not testable yet.</p><div class="bd-buy-counts"><button type="button" class="bd-tile" data-kind="gate" data-id="holds"><span>Price screen holds</span><b>' + screen.gateCounts.holds + '</b></button><button type="button" class="bd-tile" data-kind="gate" data-id="out"><span>Screens out</span><b>' + screen.gateCounts.out + '</b></button><button type="button" class="bd-tile" data-kind="gate" data-id="untested"><span>Not testable yet</span><b>' + screen.gateCounts.untested + '</b></button></div></article>' : '')
      + '<div class="bd-charts">'
      + '<article class="bd-chart"><h2>Lots by type</h2>' + bars(screen.types, 'type') + '</article>'
      + '<article class="bd-chart"><h2>Lots by beds</h2>' + bars(screen.beds, 'beds') + '</article>'
      + '<article class="bd-chart"><h2>Guide prices</h2>' + bars(screen.prices, 'price') + '</article>'
      + '<article class="bd-chart"><h2>Auction dates</h2>' + bars(screen.calendar, 'month') + '</article>'
      + '<article class="bd-chart"><h2>ONS rent and LHA</h2><p class="bd-key"><span><i class="ons"></i>ONS rent</span><span><i class="lha"></i>Allowance</span></p>' + rentPairs(screen) + '<p class="bd-src">Monthly figures. A 4 bed gap is not shown, because ONS is 4 or more bedrooms.</p></article>'
      + '<article class="bd-chart"><h2>Land Registry district medians</h2>' + bars(screen.comps.rows, 'comps') + '<p class="bd-src">' + (screen.comps.year ? 'Price Paid, ' + esc(screen.comps.year) + '. A district is shown when it has at least 5 sales.' : 'Not yet recorded') + '</p><button type="button" class="btn sec" data-go="map">Open the map</button></article>'
      + '<article class="bd-chart"><h2>Agents by type</h2>' + agentBars(screen.area) + '<button type="button" class="btn sec" data-go="entry">Open the register</button></article>'
      + '<article class="bd-chart"><h2>Go / No-Go</h2>' + gngBars(screen.area) + '<button type="button" class="btn sec" data-go="entry">Open the checklist</button></article>'
      + '</div>'
      + '<article class="bd-chart"><h2>Takeaways</h2><ul class="bd-take">' + screen.takeaways.map((line) => '<li>' + esc(line) + '</li>').join('') + '</ul></article>'
      + (drill ? '<section class="bd-drill"><p class="bd-kicker">Board / ' + esc(screen.area) + ' / ' + esc(drillTitle) + '</p><button type="button" class="btn sec" id="bd-back">Back to the board</button><h2>' + esc(drillTitle) + '</h2>'
        + (drill.kind === 'rent' ? '<ul class="bd-take">' + screen.rents.map((row) => '<li>' + esc(row.label) + ': ONS ' + esc(row.ons != null ? M.money(row.ons) : (row.ons3 != null ? M.money(row.ons3) : 'Not yet recorded')) + '. Allowance ' + esc(row.lha != null ? M.money(row.lha) : 'Not yet recorded') + '.' + (row.note ? ' ' + esc(row.note) : '') + '</li>').join('') + '</ul><button type="button" class="btn sec" data-go="rentgap">Open the rent comparison</button>' : '')
        + (drill.kind === 'comps' ? '<p>' + (screen.comps.rows.length ? esc(screen.comps.rows.length) + ' districts in ' + esc(screen.comps.year) + '.' : 'Not yet recorded') + '</p><button type="button" class="btn sec" data-go="comps">Open comps</button>' : '')
        + (drill.kind === 'map' ? '<p>The map uses the existing town view. It is not redrawn from these lots.</p>' : '')
        + (matched.length ? '<p>' + matched.length + ' current lot' + (matched.length === 1 ? '' : 's') + '.</p>' + drillLots(matched) + '<button type="button" class="btn" data-go="auctions">Open these in Auctions</button>' : (drill.kind === 'type' || drill.kind === 'beds' || drill.kind === 'price' || drill.kind === 'month' ? '<p>No current lot is in this cut.</p>' : ''))
        + '</section>' : '')
      + '</div>';
  }

  function paint(host) {
    if (!host) return;
    if (!cache) {
      host.innerHTML = '<div class="bd"><p class="bd-kicker">Board</p><h1>Reading the current lots</h1></div>';
      load().then((data) => { if (!data) return; if (location.hash && location.hash !== '#board') return; paint(host); });
      return;
    }
    if (state.error) {
      host.innerHTML = '<div class="bd"><h1>The board did not load</h1><p>' + esc(state.error) + '</p></div>';
      return;
    }
    state.screen = M.build({lots: cache.lots, today: M.londonDay(), area: state.area, rents: cache.rents, comps: cache.comps, buyBox: cache.buyBox, gates: cache.gates});
    host.innerHTML = html(state.screen);
    const select = host.querySelector('#bd-area');
    if (select) select.onchange = () => { state.area = select.value; state.drill = null; paint(host); };
    host.querySelectorAll('[data-kind]').forEach((button) => button.onclick = () => {
      const kind = button.dataset.kind;
      const id = button.dataset.id;
      if (kind === 'agents') { open('entry'); return; }
      state.drill = state.drill && state.drill.kind === kind && state.drill.id === id ? null : {kind, id, label: button.querySelector('span') ? button.querySelector('span').textContent : id};
      paint(host);
      const drill = host.querySelector('.bd-drill');
      if (drill) drill.scrollIntoView({block: 'nearest'});
    });
    const back = host.querySelector('#bd-back');
    if (back) back.onclick = () => { state.drill = null; paint(host); };
    host.querySelectorAll('[data-go]').forEach((button) => button.onclick = () => open(button.dataset.go));
    if (location.hash !== '#board') history.replaceState(null, '', '#board');
  }

  function open(mode) {
    if (mode === 'auctions') {
      if (typeof viewMode === 'function') viewMode('auctions');
      const apply = (tries) => {
        const sel = document.querySelector('#auctions_body [data-aq-filter="town"]');
        if (sel) { sel.value = state.area; sel.dispatchEvent(new Event('change', {bubbles: true})); return; }
        if (tries < 8) setTimeout(() => apply(tries + 1), 400);
      };
      setTimeout(() => apply(0), 300);
      return;
    }
    if (mode === 'map') {
      if (typeof viewMode === 'function') viewMode('map');
      setTimeout(() => {
        const sel = document.getElementById('map_city');
        if (!sel) return;
        const option = Array.from(sel.options).find((item) => item.value === state.area || item.textContent.indexOf(state.area) >= 0);
        if (option) { sel.value = option.value; sel.dispatchEvent(new Event('change', {bubbles: true})); }
      }, 400);
      return;
    }
    if (mode === 'comps') {
      if (typeof viewMode === 'function') viewMode('comps');
      setTimeout(() => {
        const sel = document.getElementById('comp_city');
        if (sel && Array.from(sel.options).some((item) => item.value === state.area)) {
          sel.value = state.area;
          sel.dispatchEvent(new Event('change', {bubbles: true}));
        }
      }, 400);
      return;
    }
    if (typeof viewMode === 'function') viewMode(mode);
  }

  function load() {
    if (cache) return Promise.resolve(cache);
    if (pending) return pending;
    state.loading = true;
    pending = Promise.all(['data/auctions/lots.json', 'data/rent-scenarios.json', 'comps/summary.json', 'data/market-entry/agents.json', 'data/market-entry/checklist.json', 'data/market-entry/buy-box.json', 'data/market-entry/gates.json'].map((file) => fetch(file + '?v=20261117-gates', {cache: 'no-store'}).then((response) => {
      if (!response.ok) throw new Error(file + ' returned HTTP ' + response.status);
      return response.json();
    }))).then((rows) => {
      if (window.BuyBox) window.BuyBox.use(rows[5]);
      cache = {lots: rows[0].lots || [], rents: rows[1], comps: rows[2], agents: rows[3], checklist: rows[4], buyBox: rows[5], gates: rows[6]};
      state.loading = false;
      state.error = '';
      pending = null;
      return cache;
    }).catch((error) => {
      state.loading = false;
      pending = null;
      state.error = error.message || 'The files did not load.';
      return null;
    });
    return pending;
  }

  function fold(root) {
    if (!root) return;
    root.querySelectorAll('table').forEach((table) => {
      if (table.closest('details') || table.rows.length < 8) return;
      const details = document.createElement('details');
      details.className = 'bd-fold';
      const summary = document.createElement('summary');
      summary.textContent = 'Show detail';
      table.parentNode.insertBefore(details, table);
      details.appendChild(summary);
      details.appendChild(table);
    });
  }
  function tagAuctionCards(rootEl) {
    if (!window.BuyBox || !rootEl) return;
    rootEl.querySelectorAll('.aq-lot').forEach((card) => {
      const eye = card.querySelector('.aq-eyebrow');
      const town = M.townOf(eye ? eye.textContent.split('·')[0] : '');
      if (!town) return;
      const heading = card.querySelector('h2, h3, .aq-address');
      const type = eye ? eye.textContent.split('·').slice(1).join('·') : '';
      const tag = window.BuyBox.classify(town, {title: card.textContent, address: heading ? heading.textContent : '', lot_type: type});
      if (card.dataset.buy === tag.tag && card.querySelector('.bd-buy-tag')) return;
      card.dataset.buy = tag.tag;
      let badge = card.querySelector('.bd-buy-tag');
      if (!badge) {
        badge = document.createElement('p');
        card.appendChild(badge);
      }
      badge.className = 'bd-buy-tag ' + tag.tag;
      badge.textContent = tag.label;
      badge.title = tag.reason;
    });
  }
  function auctionSummary() {
    const rootEl = document.getElementById('auctions_body');
    if (!rootEl) return;
    const cards = rootEl.querySelectorAll('.aq-lot');
    if (!cards.length) return;
    tagAuctionCards(rootEl);
    if (rootEl.querySelector('.bd-auc')) return;
    const counts = new Map();
    cards.forEach((card) => {
      const eye = card.querySelector('.aq-eyebrow');
      const type = eye ? eye.textContent.split('·').slice(1).join('·').trim() : 'Not stated';
      counts.set(type || 'Not stated', (counts.get(type || 'Not stated') || 0) + 1);
    });
    const bar = document.createElement('div');
    bar.className = 'bd-auc';
    const buyCounts = {match: 0, partial: 0, no: 0};
    cards.forEach((card) => { if (buyCounts[card.dataset.buy] != null) buyCounts[card.dataset.buy] += 1; });
    bar.innerHTML = '<b>' + cards.length + ' current</b>' + Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, count]) => '<button type="button" data-aq-type="' + esc(label) + '">' + esc(label) + ' ' + count + '</button>').join('')
      + '<button type="button" data-buy-filter="match">Matches buy box ' + buyCounts.match + '</button><button type="button" data-buy-filter="partial">Partial ' + buyCounts.partial + '</button><button type="button" data-buy-filter="no">No ' + buyCounts.no + '</button>';
    rootEl.insertBefore(bar, rootEl.firstChild);
    const grid = rootEl.querySelector('.aq-lots');
    if (grid && !grid.closest('details')) {
      const details = document.createElement('details');
      details.className = 'bd-fold';
      const summary = document.createElement('summary');
      summary.textContent = 'Show the lots';
      grid.parentNode.insertBefore(details, grid);
      details.appendChild(summary);
      details.appendChild(grid);
    }
    bar.querySelectorAll('[data-aq-type]').forEach((button) => button.onclick = () => {
      const sel = rootEl.querySelector('[data-aq-filter="type"]');
      if (!sel) return;
      const option = Array.from(sel.options).find((item) => item.value === button.dataset.aqType || item.textContent === button.dataset.aqType);
      if (!option) return;
      sel.value = option.value;
      sel.dispatchEvent(new Event('change', {bubbles: true}));
    });
    bar.querySelectorAll('[data-buy-filter]').forEach((button) => button.onclick = () => {
      const on = button.classList.toggle('on');
      bar.querySelectorAll('[data-buy-filter]').forEach((other) => { if (other !== button) other.classList.remove('on'); });
      rootEl.querySelectorAll('.aq-lot').forEach((card) => { card.style.display = !on || card.dataset.buy === button.dataset.buyFilter ? '' : 'none'; });
      const fold = rootEl.querySelector('details.bd-fold');
      if (fold) fold.open = true;
    });
  }

  const auctions = document.getElementById('auctions_body');
  if (auctions && window.MutationObserver) {
    const observer = new MutationObserver(() => auctionSummary());
    observer.observe(auctions, {childList: true});
  }
  window.addEventListener('hashchange', () => {
    if (location.hash === '#board' && typeof viewMode === 'function') viewMode('board');
  });
  window.lcBoard = {paint, fold, open, state};
})();
