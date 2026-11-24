/* Ecosystem Underwrite. Same chrome as Deals. Numbers come from the shared models. */
(function () {
  'use strict';

  const M = window.MatchModel;
  const SRC = {
    frameworks: 'https://pgraham974.github.io/ecosystem-partners/frameworks.json',
    partners: 'https://pgraham974.github.io/ecosystem-partners/partners.json',
    offers: '../provider_offers.json',
    evidence: '../presence.json',
    lots: '../data/auctions/lots.json',
    watch: '../pre_distress.json',
    rent: '../data/rent-scenarios.json',
    areaYields: '../comps/area-yields.json',
    auctionYields: '../comps/yields.json',
    pps: '../comps/home-ppsqft.json',
    prices: '../prices.json',
    gates: '../data/market-entry/gates.json',
    supabase: 'https://kkdfprhrgxbkydqeifgz.supabase.co/rest/v1/owners?select=company_no,name,distress_class&distress_class=neq.unknown',
    supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrZGZwcmhyZ3hia3lkcWVpZmd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3OTgzMDEsImV4cCI6MjEwNzM3NDMwMX0.dd32w-wmLe1vlwzPwZsTpoGra3cFghE2bb5LGorJjJM'
  };
  const VIEWS = {
    shortlist: ['Shortlist', 'Ranked matches', 'Each row is one recorded framework and one recorded property. A blank stays not recorded.'],
    demand: ['Demand', 'Who holds it', 'Partners and evidence named on the framework. Nothing is added.'],
    requirement: ['Requirement', 'Where and what', 'Town, form, beds, term and rent basis taken from the framework text.'],
    supply: ['Supply', 'The property', 'A live auction lot, or a watchlist title. Commercial lots are left out of a homes requirement.'],
    evidence: ['Evidence', 'Price and rent context', 'Published area figures. Not a valuation of this building.'],
    underwrite: ['Underwrite', 'Monthly model and 14 gates', 'The guide is filled where one is recorded. Rent is filled only when the framework states what the owner is paid.']
  };
  const app = document.getElementById('app');
  const state = {
    sources: [],
    matches: [],
    prices: null,
    pps: null,
    rentTable: null,
    yieldRows: [],
    niy: [],
    config: null,
    distress: {},
    townOnly: true,
    channel: 'auction',
    town: '',
    q: '',
    rentBook: null,
    sort: {k: 'points', d: -1},
    view: 'shortlist',
    openId: '',
    inputs: {},
    failed: false
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[ch];
    });
  }
  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function noteSource(name, url, ok, detail) {
    state.sources.push({name: name, url: url, ok: ok, detail: detail || ''});
  }
  async function getJson(name, url, note) {
    let detail = 'Could not load';
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetch(url, {cache: 'no-store'});
        if (response.ok) {
          const data = await response.json();
          noteSource(name, url, true, note || '');
          return data;
        }
        detail = 'HTTP ' + response.status;
        if (response.status >= 400 && response.status < 500) break;
      } catch (error) {
        detail = 'Could not load';
      }
      if (attempt < 2) await sleep(400 * (attempt + 1));
    }
    noteSource(name, url, false, detail);
    return null;
  }
  async function distressRegister() {
    const headers = {apikey: SRC.supabaseKey, Authorization: 'Bearer ' + SRC.supabaseKey};
    const out = {};
    let from = 0;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        from = 0;
        while (from < 8000) {
          const response = await fetch(SRC.supabase, {headers: Object.assign({Range: from + '-' + (from + 999)}, headers)});
          if (!response.ok) throw new Error('HTTP ' + response.status);
          const rows = await response.json();
          rows.forEach(function (row) { if (row.company_no) out[String(row.company_no)] = row; });
          if (rows.length < 1000) break;
          from += 1000;
        }
        noteSource('Distress register', SRC.supabase, true, Object.keys(out).length + ' classified owners');
        return out;
      } catch (error) {
        if (attempt === 1) noteSource('Distress register', SRC.supabase, false, 'Could not load');
        else await sleep(500);
      }
    }
    return out;
  }
  function thisMonth() {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/London', year: 'numeric', month: '2-digit'}).format(new Date()).split('-');
    return parts[0] + '-' + parts[1];
  }
  function currentMatch() {
    return state.matches.filter(function (row) { return row.id === state.openId; })[0] || null;
  }
  function inputsFor(match) {
    if (!state.inputs[match.id]) state.inputs[match.id] = M.sheetInput(match, thisMonth());
    return state.inputs[match.id];
  }
  function part(match, key) {
    return (match.parts || []).filter(function (row) { return row.key === key; })[0] || {points: null, max: 0, reason: M.NOT};
  }
  function pointsText(row) {
    if (!row || row.points == null) return M.NOT;
    return row.points + ' / ' + row.max;
  }
  function bandMark(band) {
    if (band === 'A') return '<span class="lvl d">A</span>';
    if (band === 'B') return '<span class="lvl b">B</span>';
    if (band === 'C') return '<span class="lvl s">C</span>';
    return '<span class="tag">none</span>';
  }
  function scoreMark(points) {
    const klass = points >= 55 ? 'score hi' : points >= 40 ? 'score mid' : 'score';
    return '<span class="' + klass + '">' + points + '</span>';
  }
  function valueOf(match, key) {
    if (key === 'points') return match.points;
    if (key === 'framework') return match.requirement.name || '';
    if (key === 'address') return match.supply.address || '';
    if (key === 'town') return match.supply.town || '';
    if (key === 'form') return match.supply.form || '';
    if (key === 'beds') return match.supply.beds;
    if (key === 'guide') return match.supply.guide;
    if (key === 'bed') return facts(match).perBed;
    if (key === 'gap') return facts(match).gap;
    if (key === 'yield') return facts(match).lhaYield;
    if (key === 'distress') return {A: 3, B: 2, C: 1}[match.supply.band] || 0;
    if (key === 'gates') return part(match, 'gates').points;
    return null;
  }
  function visible() {
    const query = state.q.trim().toLowerCase();
    const rows = state.matches.filter(function (match) {
      if (state.townOnly && !match.townLevel) return false;
      if (state.channel === 'auction' && match.supply.channel !== 'auction') return false;
      if (state.channel === 'watchlist' && match.supply.channel !== 'watchlist') return false;
      if (state.town && match.supply.town !== state.town) return false;
      if (!query) return true;
      return [match.requirement.name, match.requirement.buyer, match.supply.address, match.supply.town, match.supply.postcode].join(' ').toLowerCase().indexOf(query) >= 0;
    });
    const dir = state.sort.d;
    const key = state.sort.k;
    rows.sort(function (a, b) {
      const x = valueOf(a, key);
      const y = valueOf(b, key);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === 'string' || typeof y === 'string') return String(x).localeCompare(String(y)) * dir;
      return (x - y) * dir;
    });
    return rows;
  }
  function towns() {
    const seen = [];
    state.matches.forEach(function (match) {
      if (match.supply.town && seen.indexOf(match.supply.town) < 0) seen.push(match.supply.town);
    });
    seen.sort();
    return seen;
  }
  function rentRow(supply) {
    if (!state.rentTable || !window.lcRentGap || supply.beds == null) return null;
    const area = window.lcRentGap.areaOf({postcode: supply.postcode, city: supply.city, address: supply.address, addr: supply.address});
    if (!area || area === 'other' || area === 'Cheshire') return {area: area, row: null};
    const row = state.rentTable.ranked.filter(function (item) { return item.area === area && item.beds === String(supply.beds); })[0] || null;
    return {area: area, row: row};
  }
  function yieldLines(supply) {
    if (!window.lcAreaYield) return [];
    return window.lcAreaYield.setsForCity(state.yieldRows, supply.town || supply.city).filter(function (set) { return set.average; }).map(function (set) {
      return set.asset + ' ' + set.average.mean + '% ' + (set.kind || '') + ' (n=' + set.average.n + (set.average.thin ? ', thin' : '') + ')';
    });
  }
  function niyLine(supply) {
    const city = /bristol/i.test(supply.town) || /bristol/i.test(supply.city) ? 'Bristol' : (supply.town || '');
    const asset = supply.form === 'flat' ? 'Flats' : supply.form === 'house' ? 'Houses' : supply.form === 'hmo' ? 'HMO' : '';
    const row = state.niy.filter(function (item) { return item.city === city && item.asset === asset && item.stat; })[0];
    if (!row) return M.NOT;
    return row.stat.mean + '% mean NIY, n=' + row.stat.n + ', ' + city + ' ' + asset;
  }
  const NEXT = {
    shortlist: ['demand', 'Demand'],
    demand: ['requirement', 'Requirement'],
    requirement: ['supply', 'Supply'],
    supply: ['evidence', 'Evidence'],
    evidence: ['underwrite', 'Underwrite']
  };
  function pct1(rate) {
    if (rate == null || !isFinite(rate)) return M.NOT;
    return (rate * 100).toFixed(1) + '%';
  }
  function facts(match) {
    const supply = match.supply;
    const rent = rentRow(supply);
    const pps = M.ppsLine(state.pps, supply);
    const perBed = supply.guide > 0 && supply.beds ? supply.guide / supply.beds : null;
    const lha = rent && rent.row ? rent.row.lha : null;
    const omr = rent && rent.row ? rent.row.omr : null;
    const gap = rent && rent.row ? rent.row.gap : null;
    const lhaYield = lha && supply.guide > 0 ? (lha * 12) / supply.guide : null;
    return {rent: rent, pps: pps, perBed: perBed, lha: lha, omr: omr, gap: gap, lhaYield: lhaYield};
  }
  function pickBar() {
    const match = currentMatch();
    if (!match) return '';
    const next = NEXT[state.view];
    const action = state.view === 'underwrite'
      ? '<button type="button" class="btn" id="print_deal">Print one page</button>'
      : '<button type="button" class="btn" id="next_step">Next: ' + esc(next[1]) + '</button>';
    return '<div id="pick"><div><p class="foot">' + esc(match.requirement.name) + '</p><p><b>' + esc(match.supply.address) + '</b> ' + scoreMark(match.points) + ' <span class="foot">/ ' + match.counted + ' scored</span></p></div>' + action + '</div>';
  }
  function wirePick() {
    const next = document.getElementById('next_step');
    if (next) next.onclick = function () { state.view = NEXT[state.view][0]; render(); };
    const print = document.getElementById('print_deal');
    if (print) print.onclick = function () { window.print(); };
  }
  function fillPrint(match) {
    const sheet = document.getElementById('print-sheet');
    if (!sheet) return;
    if (!match) { sheet.innerHTML = ''; return; }
    const fact = facts(match);
    const under = match.underwrite && match.underwrite.ok ? match.underwrite.gates : null;
    const summary = under
      ? under.cleared + ' pass, ' + under.gates.filter(function (g) { return g.status === 'fail'; }).length + ' fail, ' + under.gates.filter(function (g) { return g.status === 'amber'; }).length + ' need evidence. ' + window.GatesModel.takeaway(under)
      : 'Not run. Year one rent or operating costs are not recorded, so none of the 14 gates has been tested.';
    sheet.innerHTML = '<p>Laurito Capital · Underwrite · ' + esc(new Date().toISOString().slice(0, 10)) + '</p><h1>' + esc(match.supply.address) + '</h1><p>' + esc(match.requirement.name) + ' · ' + esc(match.requirement.buyer) + '</p>' +
      '<table><tbody>' + match.parts.map(function (row) { return '<tr><th>' + esc(row.key) + '</th><td>' + esc(pointsText(row)) + '</td><td>' + esc(row.reason) + '</td></tr>'; }).join('') +
      '<tr><th>Guide</th><td colspan="2">' + esc(match.supply.guide ? M.money(match.supply.guide) : M.NOT) + '</td></tr>' +
      '<tr><th>Guide per bedroom</th><td colspan="2">' + esc(fact.perBed ? M.money(fact.perBed) : M.NOT) + '</td></tr>' +
      '<tr><th>Allowance gap</th><td colspan="2">' + esc(fact.gap == null ? M.NOT : M.money(fact.gap) + ' a month') + '</td></tr>' +
      '<tr><th>Gross yield if the rent were the allowance</th><td colspan="2">' + esc(pct1(fact.lhaYield)) + '</td></tr>' +
      '</tbody></table><h2>14 gates</h2><p>' + esc(summary) + '</p>' +
      (under ? '<table><tbody>' + under.gates.map(function (g) { return '<tr><td>' + g.n + ' ' + esc(g.name) + '</td><td>' + esc(g.status) + '</td><td>' + esc(g.valueText) + '</td></tr>'; }).join('') + '</tbody></table>' : '') +
      '<p>Screening research, not an investment recommendation. A blank is not recorded.</p>';
  }
  function companyNote(supply) {
    const row = supply.company && (state.distress[String(supply.company).padStart(8, '0')] || state.distress[supply.company]);
    if (!row) return '';
    return 'Companies House classification on file for ' + (row.name || supply.company) + ': ' + (row.distress_class || M.NOT) + '. That word is not re-graded as A, B or C here.';
  }

  function chrome(stats) {
    const copy = VIEWS[state.view] || VIEWS.shortlist;
    const match = currentMatch();
    const title = state.view === 'shortlist' || !match ? copy[1] : match.supply.address;
    document.getElementById('screen').innerHTML = '<p class="lc-kicker">' + esc(copy[0]) + '</p><h1>' + esc(title) + '</h1><p class="lc-purpose">' + esc(copy[2]) + '</p>' + (stats || '');
    document.querySelectorAll('#nav2 .mainb').forEach(function (button) {
      button.classList.toggle('on', button.getAttribute('data-v') === state.view);
      button.setAttribute('aria-current', button.getAttribute('data-v') === state.view ? 'page' : 'false');
    });
    const sub = document.getElementById('subnav');
    if (state.view !== 'shortlist' || !state.matches.length) { sub.innerHTML = ''; return; }
    sub.innerHTML = '<button type="button" class="subb' + (state.town ? '' : ' on') + '" data-town="">All towns</button>' + towns().map(function (town) {
      return '<button type="button" class="subb' + (state.town === town ? ' on' : '') + '" data-town="' + esc(town) + '">' + esc(town) + '</button>';
    }).join('');
    sub.querySelectorAll('.subb').forEach(function (button) {
      button.onclick = function () { state.town = button.getAttribute('data-town') || ''; render(); };
    });
  }
  function setStatus(text) { document.getElementById('status').textContent = text; }
  function failedSources() { return state.sources.filter(function (row) { return !row.ok; }); }
  function sourceLine() {
    const bad = failedSources();
    if (!bad.length) return '<p class="foot">Frameworks and partners from the Partners site. Lots, comps and allowances from this repository.</p>';
    return '<div class="card"><h2>Some files did not load</h2><p class="lead">Nothing was estimated in their place.</p><ul>' + bad.map(function (row) {
      return '<li>' + esc(row.name) + ': ' + esc(row.detail) + '</li>';
    }).join('') + '</ul><button type="button" class="btn" id="retry">Retry</button></div>';
  }

  function examples() {
    return M.featured(state.matches).filter(function (item) { return item.match; });
  }
  function exampleCards() {
    const rows = examples();
    if (!rows.length) return '';
    return '<h2>Worked examples</h2><div class="opgrid">' + rows.map(function (item) {
      const match = item.match;
      const supply = match.supply;
      return '<article class="card"><p class="lc-kicker">Worked example</p><h2>' + esc(match.requirement.name) + '</h2><p>' + esc(supply.address) + '</p><p>' +
        '<span class="tag">' + (supply.live ? 'Live auction' : 'Watchlist') + '</span> ' +
        '<span class="tag">' + esc(supply.town || M.NOT) + '</span> ' +
        '<span class="tag">' + esc(supply.form) + (supply.beds ? ' · ' + supply.beds + '-bed' : '') + '</span> ' +
        (supply.guide ? '<span class="tag">Guide ' + esc(M.money(supply.guide)) + '</span>' : '') +
        '</p><p>' + scoreMark(match.points) + ' <span class="foot">/ ' + match.counted + ' scored' + (match.missed ? ' · ' + match.missed + ' not recorded' : '') + '</span></p>' +
        '<button type="button" class="btn" data-open="' + esc(match.id) + '">Open</button></article>';
    }).join('') + '</div>';
  }
  function head(key, label) {
    const on = state.sort.k === key;
    const mark = on ? (state.sort.d < 0 ? ' ↓' : ' ↑') : '';
    return '<th' + (key === 'framework' || key === 'address' || key === 'town' || key === 'form' ? ' class="l"' : '') + ' data-k="' + key + '">' + esc(label) + mark + '</th>';
  }
  function whyCell(match) {
    const reasons = match.parts.map(function (row) { return '<li><b>' + esc(row.key) + ' ' + esc(pointsText(row)) + '.</b> ' + esc(row.reason) + '</li>'; }).join('');
    return '<details><summary>' + esc(match.requirement.name) + '</summary><ul>' + reasons + '</ul></details>';
  }
  function csvCell(value) {
    const text = value == null ? '' : String(value);
    return '"' + text.replace(/"/g, '""') + '"';
  }
  function exportCsv() {
    const rows = visible();
    const header = ['Framework', 'Buyer', 'Address', 'Postcode', 'Town', 'Form', 'Beds', 'Guide', 'Guide per bedroom', 'Channel', 'Distress', 'Score', 'Location', 'Type', 'Rent cover', 'Allowance gap £/month', 'Gross yield if rent were the allowance', 'Town £ per sq ft', 'Listing'];
    const lines = [header.map(csvCell).join(',')];
    rows.forEach(function (match) {
      const fact = facts(match);
      const supply = match.supply;
      const ppsNum = fact.pps && fact.pps.value && fact.pps.value.indexOf('£') === 0 ? fact.pps.value : M.NOT;
      lines.push([
        match.requirement.name, match.requirement.buyer, supply.address, supply.postcode, supply.town || M.NOT, supply.form,
        supply.beds == null ? M.NOT : supply.beds, supply.guide == null ? M.NOT : supply.guide, fact.perBed == null ? M.NOT : Math.round(fact.perBed),
        supply.live ? 'Live auction' : 'Watchlist', supply.band || 'none', match.points,
        pointsText(part(match, 'location')), pointsText(part(match, 'type')), pointsText(part(match, 'rent')),
        fact.gap == null ? M.NOT : Math.round(fact.gap), fact.lhaYield == null ? M.NOT : (fact.lhaYield * 100).toFixed(1) + '%',
        ppsNum, supply.url || M.NOT
      ].map(csvCell).join(','));
    });
    const blob = new Blob([lines.join('\n')], {type: 'text/csv'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'underwrite-shortlist.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }
  function shortlist() {
    const rows = visible();
    const stats = '<div class="lc-stats"><div><b>' + rows.length + '</b><span>On this filter</span></div><div><b>' + examples().length + '</b><span>Checked examples</span></div><div><b>' + state.matches.length + '</b><span>Ranked</span></div></div>';
    chrome(stats);
    const empty = rows.length ? '' : '<div class="card pipe-empty"><h2>No matches</h2><p class="lead">Nothing on this filter. The files are loaded. Choose another town, or include region matches and the watchlist.</p></div>';
    const checks = examples().map(function (item) {
      return '<button type="button" class="btn sec" data-open="' + esc(item.match.id) + '">' + esc(item.title) + ' ' + item.match.points + '</button>';
    }).join(' ');
    app.innerHTML = pickBar() + '<div class="ctl noprint"><div class="seg" id="channel">' +
      [['auction', 'Live lots'], ['watchlist', 'Watchlist'], ['both', 'Both']].map(function (pair) {
        return '<button type="button" class="segb' + (state.channel === pair[0] ? ' on' : '') + '" data-c="' + pair[0] + '">' + pair[1] + '</button>';
      }).join('') + '</div>' +
      '<label><input id="town_only" type="checkbox"' + (state.townOnly ? ' checked' : '') + '> Town named on the framework</label>' +
      '<input id="q" type="search" placeholder="Search" aria-label="Search framework, town or address" value="' + esc(state.q) + '">' +
      '<button type="button" class="btn sec" id="csv">Export CSV</button></div>' +
      (checks ? '<p class="noprint"><span class="foot">Checked examples </span>' + checks + '</p>' : '') +
      empty +
      (rows.length ? '<div class="scroll"><table id="match_table"><caption class="foot">Ranked framework-to-property matches. Open Why for the score. Gross yield is the allowance times 12, divided by the guide. It is not the lease rent.</caption><thead><tr>' +
        head('framework', 'Framework') + head('address', 'Property') + head('town', 'Town') + head('beds', 'Beds') + head('guide', 'Guide') + head('bed', '£/bed') + head('gap', 'LHA gap') + head('yield', 'LHA yield') + head('distress', 'Flag') + head('points', 'Score') +
        '</tr></thead><tbody>' + rows.map(function (match) {
          const supply = match.supply;
          const fact = facts(match);
          const flag = (supply.live ? '<span class="tag">Live</span> ' : '<span class="tag">Watch</span> ') + bandMark(supply.band);
          const gapTitle = fact.rent && fact.rent.row ? 'Open-market rent minus the ' + fact.rent.row.brma + ' allowance. Not the lease rent.' : 'Not recorded';
          return '<tr><td class="l">' + whyCell(match) + ' <button type="button" class="btn sec" data-open="' + esc(match.id) + '">Open</button></td><td class="l">' + esc(supply.address) + '</td><td class="l">' + esc(supply.town || M.NOT) + '</td><td>' + (supply.beds == null ? M.NOT : supply.beds) + '</td><td>' + esc(supply.guide ? M.money(supply.guide) : M.NOT) + '</td><td>' + esc(fact.perBed ? M.money(fact.perBed) : M.NOT) + '</td><td title="' + esc(gapTitle) + '">' + esc(fact.gap == null ? M.NOT : M.money(fact.gap)) + '</td><td title="Allowance times 12, divided by the guide. Not the lease rent.">' + esc(pct1(fact.lhaYield)) + '</td><td>' + flag + '</td><td>' + scoreMark(match.points) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '') +
      '<p class="foot">Twenty live lots and eight watchlist titles are kept for each framework. £/bed is the guide divided by the recorded bedrooms. LHA yield uses the published allowance, not a lease rent.</p>' +
      sourceLine();
    wireShortlist();
    wirePick();
  }
  function wireShortlist() {
    const channel = document.getElementById('channel');
    if (channel) channel.querySelectorAll('.segb').forEach(function (button) {
      button.onclick = function () { state.channel = button.getAttribute('data-c'); render(); };
    });
    const townOnly = document.getElementById('town_only');
    if (townOnly) townOnly.onchange = function (event) { state.townOnly = event.target.checked; render(); };
    const box = document.getElementById('q');
    if (box) box.oninput = function (event) {
      state.q = event.target.value;
      const pos = event.target.selectionStart;
      render();
      const again = document.getElementById('q');
      if (again) { again.focus(); again.setSelectionRange(pos, pos); }
    };
    app.querySelectorAll('th[data-k]').forEach(function (th) {
      th.onclick = function () {
        const key = th.getAttribute('data-k');
        if (state.sort.k === key) state.sort.d *= -1;
        else state.sort = {k: key, d: key === 'framework' || key === 'address' || key === 'town' || key === 'form' ? 1 : -1};
        render();
      };
    });
    app.querySelectorAll('[data-open]').forEach(function (node) {
      node.onclick = function (event) { event.stopPropagation(); openMatch(node.getAttribute('data-open')); };
    });
    const retry = document.getElementById('retry');
    if (retry) retry.onclick = function () { start(); };
    const csv = document.getElementById('csv');
    if (csv) csv.onclick = exportCsv;
  }

  function needMatch() {
    chrome('');
    app.innerHTML = '<div class="card pipe-empty"><h2>Open a match first</h2><p class="lead">Choose a row on the shortlist. This step shows that one framework and that one property.</p><button type="button" class="btn" id="to_list">Shortlist</button></div>';
    document.getElementById('to_list').onclick = function () { state.view = 'shortlist'; render(); };
  }
  function holders(requirement) {
    if (!requirement.holders.length && !requirement.evidence.length) return '<p class="lead">No partner in the partner file is recorded against this framework. Buyer: ' + esc(requirement.buyer) + '.</p>';
    const people = requirement.holders.map(function (holder) {
      return '<tr><td class="l"><b>' + esc(holder.name) + '</b></td><td class="l">' + esc(holder.how) + (holder.calledOff ? ' · homes called off' : '') + '</td><td class="l">' + esc(holder.kind || M.NOT) + '</td><td class="l">' + esc(holder.cities.length ? holder.cities.join(', ') : M.NOT) + '</td></tr>';
    }).join('');
    const proof = requirement.evidence.map(function (row) {
      const link = row.url ? '<a href="' + esc(row.url) + '" target="_blank" rel="noopener">source</a>' : M.NOT;
      return '<tr><td class="l">' + esc(row.provider) + '</td><td class="l"><span class="tag">' + esc(row.label) + '</span></td><td class="l">' + esc(row.city) + '</td><td class="l">' + esc(row.detail) + (row.date ? ' · ' + esc(row.date) : '') + ' · ' + link + '</td></tr>';
    }).join('');
    return (people ? '<div class="scroll"><table><thead><tr><th class="l">Partner</th><th class="l">How linked</th><th class="l">Kind</th><th class="l">Cities</th></tr></thead><tbody>' + people + '</tbody></table></div>' : '') +
      (proof ? '<div class="scroll"><table><thead><tr><th class="l">Provider</th><th class="l">Evidence</th><th class="l">Place</th><th class="l">Record</th></tr></thead><tbody>' + proof + '</tbody></table></div>' : '<p class="foot">No presence row names this framework.</p>');
  }
  function scoreList(match) {
    return '<div class="scroll"><table><thead><tr><th class="l">Part</th><th>Points</th><th class="l">Why</th></tr></thead><tbody>' + match.parts.map(function (row) {
      return '<tr><td class="l">' + esc(row.key) + '</td><td>' + esc(pointsText(row)) + '</td><td class="l">' + esc(row.reason) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  function demand(match) {
    const requirement = match.requirement;
    chrome('<div class="lc-stats"><div><b>' + scoreMark(match.points) + '</b><span>/ ' + match.counted + '</span></div></div>');
    app.innerHTML = pickBar() + '<div class="card"><h2>' + esc(requirement.name) + '</h2><p class="lead">Who already holds this framework, from the partner file and the presence file.</p>' + scoreList(match) +
      holders(requirement) + '<dl class="kv"><dt>Buyer</dt><dd>' + esc(requirement.buyer) + '</dd><dt>Status</dt><dd>' + esc(requirement.status) + '</dd><dt>Route</dt><dd>' + esc(requirement.investorRoute) + '</dd></dl></div>';
    wirePick();
  }
  function requirement(match) {
    const requirement = match.requirement;
    chrome('');
    app.innerHTML = pickBar() + '<div class="card"><h2>' + esc(requirement.name) + '</h2><p class="lead">Where the framework applies, and the property it asks for. A range is not turned into one number.</p><dl class="kv">' +
      '<dt>Geography</dt><dd>' + esc(requirement.geography) + '</dd>' +
      '<dt>Towns used</dt><dd>' + esc(requirement.towns.length ? requirement.towns.join(', ') : 'None named. Region matching is off on the default shortlist.') + '</dd>' +
      '<dt>Regions</dt><dd>' + esc(requirement.regions.length ? requirement.regions.join(', ') : M.NOT) + '</dd>' +
      '<dt>Form</dt><dd>' + esc(requirement.spec.forms.length ? requirement.spec.forms.join(', ') : M.NOT) + '</dd>' +
      '<dt>Beds</dt><dd>' + esc(requirement.spec.bedsMin == null ? M.NOT : requirement.spec.bedsMin + '–' + requirement.spec.bedsMax) + '</dd>' +
      '<dt>Term</dt><dd>' + esc(requirement.termText) + (requirement.termFrom ? ' (' + esc(requirement.termFrom) + ')' : '') + '</dd>' +
      '<dt>Rent basis</dt><dd>' + esc(requirement.rentBasis) + (requirement.rentFrom ? ' (' + esc(requirement.rentFrom) + ')' : '') + '</dd>' +
      '<dt>Rent used</dt><dd>' + esc(requirement.annualRent ? M.money(requirement.annualRent) + ' a year. ' + requirement.rentNote : requirement.rentNote) + '</dd>' +
      '<dt>Repairs / voids</dt><dd>' + esc(requirement.repairs) + '</dd></dl><p class="foot">' + esc(requirement.spec.text || M.NOT) + '</p></div>';
    wirePick();
  }
  function supply(match) {
    const supply = match.supply;
    chrome('');
    app.innerHTML = pickBar() + '<div class="card"><h2>' + esc(supply.address) + '</h2><p class="lead">The property on this match. Live means the auction date has not passed.</p><dl class="kv">' +
      '<dt>Channel</dt><dd>' + (supply.live ? 'Live auction' : 'Watchlist') + '</dd>' +
      '<dt>Postcode</dt><dd>' + esc(supply.postcode || M.NOT) + '</dd>' +
      '<dt>Town</dt><dd>' + esc(supply.town || M.NOT) + (supply.region ? ' · region ' + esc(supply.region) : '') + '</dd>' +
      '<dt>Form</dt><dd>' + esc(supply.form) + (supply.beds ? ', ' + supply.beds + '-bed' : ', bedrooms ' + M.NOT) + '</dd>' +
      '<dt>Guide</dt><dd>' + esc(supply.guide ? M.money(supply.guide) : M.NOT) + '</dd>' +
      '<dt>Auction</dt><dd>' + esc(supply.date || M.NOT) + (supply.source ? ' · ' + esc(supply.source) : '') + '</dd>' +
      '<dt>Distress</dt><dd>' + bandMark(supply.band) + ' ' + esc(supply.band ? supply.bandWhy : part(match, 'distress').reason) + '</dd></dl>' +
      (companyNote(supply) ? '<p class="foot">' + esc(companyNote(supply)) + '</p>' : '') +
      (supply.url ? '<p><a class="btn" href="' + esc(supply.url) + '" target="_blank" rel="noopener">Listing</a></p>' : '<p class="foot">No listing URL is recorded.</p>') +
      '</div>';
    wirePick();
  }
  function yieldTable(supply) {
    if (!window.lcAreaYield) return '<p class="lead">Area yields: not recorded. The yield file did not load.</p>';
    const sets = window.lcAreaYield.setsForCity(state.yieldRows, supply.town || supply.city);
    const rows = [];
    sets.forEach(function (set) { (set.members || []).forEach(function (row) { rows.push(row); }); });
    if (!rows.length) return '<p class="lead">Area yields: not recorded for ' + esc(supply.town || supply.city || 'this place') + '. The file has no published row here. Retrieved ' + esc((state.yieldRows.length && 'see comps/area-yields.json') || M.NOT) + '.</p>';
    return '<h2>Area yields</h2><p class="foot">Published rows for this town, from comps/area-yields.json. A row is a house comp only when the asset says so. An asking quote is not a completed sale.</p><div class="scroll"><table><thead><tr><th class="l">Place</th><th class="l">Asset</th><th>Yield</th><th class="l">Kind</th><th>Date</th><th class="l">Source</th></tr></thead><tbody>' +
      rows.map(function (row) {
        const link = row.url ? '<a href="' + esc(row.url) + '" target="_blank" rel="noopener">' + esc(row.source || 'source') + '</a>' : esc(row.source || M.NOT);
        return '<tr><td class="l">' + esc(row.location || M.NOT) + '</td><td class="l">' + esc(row.asset_type || M.NOT) + '</td><td>' + (row.yield_pct == null ? M.NOT : Number(row.yield_pct).toFixed(1) + '%') + '</td><td class="l">' + esc(row.yield_kind || M.NOT) + ' · ' + esc(row.quote_status || M.NOT) + '</td><td>' + esc(row.date || M.NOT) + '</td><td class="l">' + link + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function niyTable(supply) {
    const city = /bristol/i.test(supply.town) || /bristol/i.test(supply.city) ? 'Bristol' : (supply.town || '');
    const rows = state.niy.filter(function (item) { return item.city === city && item.rows && item.rows.length; });
    if (!rows.length) return '<h2>Laurito NIY comps</h2><p class="lead">Not recorded for ' + esc(city || 'this town') + '. The NIY book has no residential comp in the average for this place.</p>';
    const body = rows.map(function (group) {
      return group.rows.map(function (row) {
        return '<tr><td class="l">' + esc(row.address || row.location || M.NOT) + '</td><td class="l">' + esc(group.asset) + '</td><td>' + (row.pct == null ? M.NOT : Number(row.pct).toFixed(2) + '%') + '</td><td class="l">' + esc(row.basis || M.NOT) + '</td><td>' + esc(row.date || M.NOT) + '</td></tr>';
      }).join('');
    }).join('');
    return '<h2>Laurito NIY comps</h2><p class="foot">Comps kept in the residential average. ' + esc(niyLine(supply)) + '.</p><div class="scroll"><table><thead><tr><th class="l">Address</th><th class="l">Asset</th><th>NIY</th><th class="l">Basis</th><th>Date</th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }
  function evidence(match) {
    const supply = match.supply;
    const fact = facts(match);
    const sold = M.soldLine(state.prices, supply);
    const book = state.rentBook || {};
    const lhaDates = book.lha ? 'Allowance in force ' + book.lha.valid_from + ' to ' + book.lha.valid_to + ', checked ' + book.lha.checked + '.' : 'Allowance dates: not recorded.';
    const omrDates = book.omr ? book.omr.source + '. Month ' + book.omr.month + '.' : 'Market rent dates: not recorded.';
    const wn = fact.rent && fact.rent.area === 'Manchester' && supply.town && supply.town !== 'Manchester' ? ' The shared lookup uses the Central Greater Manchester allowance. An allowance for ' + supply.town + ' alone is not recorded.' : '';
    const rentLine = fact.lha == null
      ? M.NOT + (supply.beds == null ? ' Bedrooms are not on the lot.' : ' No single allowance for this town and bed count.')
      : 'Open-market rent ' + M.money(fact.omr) + ' a month. Local Housing Allowance ' + M.money(fact.lha) + ' a month' + (fact.rent.row.brma ? ' (' + fact.rent.row.brma + ')' : '') + '. Gap ' + M.money(fact.gap) + ' a month.';
    chrome('');
    app.innerHTML = pickBar() + '<div class="card"><h2>Sold prices</h2><p>' + esc(sold.value) + '</p><p class="foot">' + esc(sold.source) + ' File date ' + esc((state.prices && state.prices.updated) || M.NOT) + '.</p>' +
      '<h2>£ per sq ft</h2><p>' + esc(fact.pps.value) + '</p><p class="foot">' + esc(fact.pps.source) + '</p>' +
      '<h2>Guide per bedroom</h2><p>' + esc(fact.perBed ? M.money(fact.perBed) : M.NOT) + '</p><p class="foot">' + (fact.perBed ? 'Guide divided by the bedrooms on the listing. Not a valuation.' : 'Not recorded. Guide or bedrooms are missing.') + '</p>' +
      '<h2>LHA and market rent</h2><p>' + esc(rentLine + wn) + '</p><p class="foot">' + esc(lhaDates) + ' ' + esc(omrDates) + ' Gross yield if the rent were the allowance: ' + esc(pct1(fact.lhaYield)) + '. That is not the lease rent.</p>' +
      yieldTable(supply) + niyTable(supply) +
      '<p class="foot">Street-level rows in valuation_audit.json are not joined: the lot has no shared transaction id.</p></div>';
    wirePick();
  }
  function field(key, label, value) {
    return '<label class="dlf"><small>' + esc(label) + '</small><input data-k="' + key + '" value="' + esc(value == null ? '' : value) + '" inputmode="decimal" autocomplete="off"></label>';
  }
  function metricTiles(result) {
    const pct = function (value) { return value == null || !isFinite(value) ? M.NOT : (value * 100).toFixed(1) + '%'; };
    const times = function (value) { return value == null || !isFinite(value) ? M.NOT : value.toFixed(2) + 'x'; };
    return '<div class="kpis"><div class="kpi"><small>Yield on cost</small><b>' + pct(result.yieldOnCost) + '</b></div><div class="kpi"><small>Levered IRR</small><b>' + pct(result.leveredIrr) + '</b></div><div class="kpi"><small>Interest cover</small><b>' + times(result.interestCover) + '</b></div><div class="kpi"><small>Unlevered IRR</small><b>' + pct(result.unleveredIrr) + '</b></div></div>';
  }
  function gateBars(scored) {
    return '<div id="gates_root">' + scored.gates.map(function (gate) {
      return '<div class="bd-bar ' + esc(gate.status) + '"><span>' + gate.n + ' ' + esc(gate.name) + '</span><em>' + esc(gate.status) + '</em></div>';
    }).join('') + '<p class="foot">' + esc(window.GatesModel.takeaway(scored)) + '</p></div>';
  }
  function underwrite(match) {
    const input = inputsFor(match);
    const under = match.underwrite;
    const metrics = under && under.ok ? under.result : null;
    chrome('');
    app.innerHTML = pickBar() + '<div class="card"><h2>Price, rent, debt and exit</h2><p class="lead">Price is the guide where one is recorded. Rent is filled only when the framework states a figure paid to the owner. Purchase costs 6.8%, loan 50%, rate 6.5% and exit yield 6% are the deal sheet starting figures, not facts from this lot. ' +
      (input.termAssumed ? 'The hold is five years because the framework does not record a single term.' : 'The hold follows the recorded term of ' + input.termYearsUsed + ' years.') + '</p>' +
      '<div class="dlgrid">' +
      field('price', 'Guide price, £', input.price) +
      field('rent1', 'Year one rent, £', input.rent1) +
      field('opexPct', 'Operating costs, % of rent', input.opexPct) +
      field('entryMonth', 'Entry month', input.entryMonth) +
      field('exitMonth', 'Exit month', input.exitMonth) +
      '</div><div id="uw_out"></div><p><button type="button" class="btn" id="open_sheet">Open the deal sheet</button></p>' +
      '<p class="foot">The deal sheet is the existing monthly model. This button stores these inputs in this browser and opens it. Qualitative gates stay on needs evidence until someone ticks them there. Screening research, not an investment recommendation.</p></div>';
    paintUnderwrite(match);
    app.querySelectorAll('[data-k]').forEach(function (el) {
      el.oninput = function () {
        input[el.dataset.k] = el.value;
        const next = M.withGates(match, M.runUnderwrite(input, state.config));
        const at = state.matches.findIndex(function (row) { return row.id === match.id; });
        if (at >= 0) state.matches[at] = next;
        paintUnderwrite(next);
      };
    });
    document.getElementById('open_sheet').onclick = function () { openSheet(input); };
    wirePick();
  }
  function namedGates() {
    if (!window.GatesModel || !state.config) return [];
    try { return window.GatesModel.score({debt: 1}, {attribution: false, bridge: false, fees: false, term: false, cashOut: false}, state.config).gates; }
    catch (error) { return []; }
  }
  function paintUnderwrite(match) {
    const box = document.getElementById('uw_out');
    if (!box) return;
    const under = match.underwrite;
    if (!under || !under.ok) {
      const names = namedGates();
      const missing = (under && under.missing) || ['year one rent', 'operating costs'];
      const need = missing.length === 1 ? missing[0] + ' is' : missing.slice(0, -1).join(', ') + ' and ' + missing[missing.length - 1] + ' are';
      box.innerHTML = '<p class="lead">Needs evidence. ' + esc(need) + ' not recorded, so none of the 14 gates has been tested. A pass is not assumed.</p>' +
        (names.length ? '<div id="gates_root">' + names.map(function (gate) {
          return '<div class="bd-bar amber"><span>' + gate.n + ' ' + esc(gate.name) + '. ' + esc(gate.thresholdText) + '</span><em>needs evidence</em></div>';
        }).join('') + '</div>' : '<p class="foot">Gate hurdles did not load.</p>');
      fillPrint(match);
      return;
    }
    const fail = under.gates.gates.filter(function (gate) { return gate.status === 'fail'; }).length;
    const amber = under.gates.gates.filter(function (gate) { return gate.status === 'amber'; }).length;
    box.innerHTML = '<p class="lead">' + under.gates.cleared + ' pass, ' + fail + ' fail, ' + amber + ' need evidence. Verdict ' + esc(under.gates.verdict) + '.</p>' + metricTiles(under.result) + gateBars(under.gates);
    fillPrint(match);
  }
  function openSheet(input) {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('ed_quick_model') || '{}'); } catch (error) { saved = {}; }
    const next = Object.assign({}, saved, {
      name: input.name, route: input.route, basis: 'price', price: input.price, rent1: input.rent1, opexPct: input.opexPct,
      entryMonth: input.entryMonth, exitMonth: input.exitMonth, costsPct: input.costsPct, ltvPct: input.ltvPct,
      ratePct: input.ratePct, exitYieldPct: input.exitYieldPct, saleCostsPct: input.saleCostsPct, loanType: input.loanType, termYears: input.termYears
    });
    try { localStorage.setItem('ed_quick_model', JSON.stringify(next)); } catch (error) { /* private mode */ }
    location.href = '../index.html#deal';
  }
  function openMatch(id) {
    if (!state.matches.some(function (row) { return row.id === id; })) { state.view = 'shortlist'; render(); return; }
    state.openId = id;
    state.view = 'demand';
    render();
  }
  function render() {
    const match = currentMatch();
    if (state.view !== 'shortlist' && !match) { needMatch(); return; }
    if (state.view === 'shortlist') shortlist();
    else if (state.view === 'demand') demand(match);
    else if (state.view === 'requirement') requirement(match);
    else if (state.view === 'supply') supply(match);
    else if (state.view === 'evidence') evidence(match);
    else underwrite(match);
    fillPrint(match);
    if (state.view !== 'shortlist') history.replaceState(null, '', '#' + state.view);
  }
  function loading() {
    setStatus('loading…');
    chrome('');
    document.getElementById('screen').innerHTML = '<p class="lc-kicker">Underwrite</p><h1>Shortlist</h1><p class="lc-purpose">Loading recorded frameworks and lots.</p>';
    app.innerHTML = '<div class="card"><p class="lead">Loading the Partners frameworks and the auction file.</p></div>';
  }
  function failedLoad() {
    setStatus('files missing');
    chrome('');
    app.innerHTML = '<div class="card"><h2>The source files did not load</h2>' + sourceLine() + '</div>';
    const retry = document.getElementById('retry');
    if (retry) retry.onclick = function () { start(); };
  }

  async function start() {
    state.sources = [];
    state.failed = false;
    loading();
    const current = window.lcCurrentLot ? window.lcCurrentLot.currentLot : function () { return true; };
    const repoNote = 'Not published on the Partners site. Loaded from this repository.';
    const [frameworks, partners, offers, presence, lotsFile, watch, prices, pps, gates, areaYields, auctionYields, rentFile] = await Promise.all([
      getJson('Frameworks', SRC.frameworks),
      getJson('Partners', SRC.partners),
      getJson('Provider offers', SRC.offers, repoNote),
      getJson('Provider evidence', SRC.evidence, repoNote),
      getJson('Auction lots', SRC.lots),
      getJson('Watchlist', SRC.watch),
      getJson('Sold prices', SRC.prices),
      getJson('£ per sq ft', SRC.pps),
      getJson('Gate hurdles', SRC.gates),
      getJson('Area yields', SRC.areaYields),
      getJson('Auction yields', SRC.auctionYields),
      getJson('LHA and market rent', SRC.rent)
    ]);
    state.prices = prices;
    state.pps = pps;
    state.config = gates;
    state.yieldRows = (areaYields && areaYields.rows) || [];
    state.rentBook = rentFile;
    state.rentTable = window.lcRentGap && rentFile ? window.lcRentGap.build(rentFile) : null;
    state.niy = [];
    if (window.lcNiy) {
      try { state.niy = window.lcNiy.averages(window.lcNiy.book(areaYields || {rows: []}, auctionYields || {rows: []})); }
      catch (error) { state.niy = []; }
    }
    if (!frameworks || !lotsFile) { failedLoad(); return; }
    const requirements = M.buildRequirements(frameworks, partners || {partners: []}, presence || {providers: []}, offers || []);
    const auctions = M.auctionSupply((lotsFile && lotsFile.lots) || [], current);
    const watchlist = M.watchSupply(watch || {sites: []});
    state.matches = M.rank(requirements, auctions, 20).concat(M.rank(requirements, watchlist, 8));
    setStatus(requirements.length + ' frameworks · ' + auctions.length + ' live lots');
    const hash = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (VIEWS[hash]) state.view = hash;
    else if (hash && state.matches.some(function (row) { return row.id === hash; })) { state.openId = hash; state.view = 'demand'; }
    render();
    state.distress = await distressRegister();
    if (state.view === 'supply' && state.openId) supply(currentMatch());
  }

  document.querySelectorAll('#nav2 .mainb').forEach(function (button) {
    button.onclick = function () { state.view = button.getAttribute('data-v'); render(); };
  });
  start();
})();
