/* Ecosystem Underwrite. Data in, MatchModel scores, QuickModel and GatesModel do the numbers. */
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
    q: '',
    openId: '',
    inputs: {}
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[ch];
    });
  }
  function noteSource(name, url, ok, detail) {
    state.sources.push({name: name, url: url, ok: ok, detail: detail || ''});
  }
  async function getJson(name, url, note) {
    try {
      const response = await fetch(url, {cache: 'no-store'});
      if (!response.ok) {
        noteSource(name, url, false, 'HTTP ' + response.status);
        return null;
      }
      const data = await response.json();
      noteSource(name, url, true, note || '');
      return data;
    } catch (error) {
      noteSource(name, url, false, 'Could not load');
      return null;
    }
  }
  async function distressRegister() {
    const headers = {apikey: SRC.supabaseKey, Authorization: 'Bearer ' + SRC.supabaseKey};
    const out = {};
    let from = 0;
    try {
      while (from < 8000) {
        const response = await fetch(SRC.supabase, {headers: Object.assign({Range: from + '-' + (from + 999)}, headers)});
        if (!response.ok) {
          noteSource('Distress register', SRC.supabase, false, 'HTTP ' + response.status);
          return out;
        }
        const rows = await response.json();
        rows.forEach(function (row) {
          if (row.company_no) out[String(row.company_no)] = row;
        });
        if (rows.length < 1000) break;
        from += 1000;
      }
      noteSource('Distress register', SRC.supabase, true, Object.keys(out).length + ' classified owners');
    } catch (error) {
      noteSource('Distress register', SRC.supabase, false, 'Could not load');
    }
    return out;
  }
  function thisMonth() {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/London', year: 'numeric', month: '2-digit'}).format(new Date()).split('-');
    return parts[0] + '-' + parts[1];
  }
  function inputsFor(match) {
    if (!state.inputs[match.id]) {
      const base = M.sheetInput(match, thisMonth());
      state.inputs[match.id] = base;
    }
    return state.inputs[match.id];
  }
  function part(match, key) {
    return (match.parts || []).filter(function (row) { return row.key === key; })[0] || {points: null, max: 0, reason: M.NOT};
  }
  function pointsText(row) {
    if (!row || row.points == null) return M.NOT;
    return row.points + ' / ' + row.max;
  }
  function visible() {
    const query = state.q.trim().toLowerCase();
    return state.matches.filter(function (match) {
      if (state.townOnly && !match.townLevel) return false;
      if (state.channel === 'auction' && match.supply.channel !== 'auction') return false;
      if (state.channel === 'watchlist' && match.supply.channel !== 'watchlist') return false;
      if (!query) return true;
      const blob = [match.requirement.name, match.requirement.buyer, match.supply.address, match.supply.town, match.supply.postcode].join(' ').toLowerCase();
      return blob.indexOf(query) >= 0;
    });
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
    const city = M.placeOf ? supply.town : supply.city;
    const sets = window.lcAreaYield.setsForCity(state.yieldRows, city || supply.city);
    return sets.filter(function (set) { return set.average; }).map(function (set) {
      return set.asset + ' ' + set.average.mean + '% ' + (set.kind || '') + ' (n=' + set.average.n + (set.average.thin ? ', thin' : '') + ')';
    });
  }
  function niyLine(supply) {
    const city = supply.town === 'Bristol' || /bristol/i.test(supply.city) ? 'Bristol' : (supply.town || '');
    const asset = supply.form === 'flat' ? 'Flats' : supply.form === 'house' ? 'Houses' : supply.form === 'hmo' ? 'HMO' : '';
    const row = state.niy.filter(function (item) { return item.city === city && item.asset === asset && item.stat; })[0];
    if (!row) return M.NOT;
    return row.stat.mean + '% mean NIY, n=' + row.stat.n + ', ' + city + ' ' + asset;
  }
  function companyNote(supply) {
    const row = supply.company && state.distress[String(supply.company).padStart(8, '0')] || state.distress[supply.company];
    if (!row) return '';
    return 'Companies House classification on file for ' + (row.name || supply.company) + ': ' + (row.distress_class || M.NOT) + '. That word is not re-graded as A, B or C here.';
  }

  function sourceHtml() {
    return '<p class="sources">' + state.sources.map(function (row) {
      return '<span class="' + (row.ok ? 'ok' : 'bad') + '">' + esc(row.name) + ': ' + (row.ok ? 'loaded' : 'not loaded') + (row.detail ? ' (' + esc(row.detail) + ')' : '') + '</span>';
    }).join('') + '</p>';
  }
  function card(match, featured) {
    const supply = match.supply;
    const band = supply.band ? '<span class="tag ' + esc(supply.band.toLowerCase()) + '">' + esc(supply.band) + '</span>' : '';
    return '<article class="card">' +
      (featured ? '<p class="kicker">Worked example</p>' : '') +
      '<h2>' + esc(match.requirement.name) + '</h2>' +
      '<p>' + esc(supply.address) + '</p>' +
      '<div class="tags"><span class="tag' + (supply.live ? ' live' : '') + '">' + (supply.live ? 'Live auction' : 'Watchlist') + '</span>' + band +
      '<span class="tag">' + esc(supply.town || M.NOT) + '</span><span class="tag">' + esc(supply.form) + (supply.beds ? ' · ' + supply.beds + '-bed' : '') + '</span>' +
      (supply.guide ? '<span class="tag">Guide ' + esc(M.money(supply.guide)) + '</span>' : '') + '</div>' +
      '<p class="score"><b>' + match.points + '</b><span> / ' + match.counted + ' scored' + (match.missed ? ' · ' + match.missed + ' not recorded' : '') + '</span></p>' +
      '<div class="actions"><button type="button" data-open="' + esc(match.id) + '">Open the five steps</button></div></article>';
  }
  function shortlist() {
    const rows = visible();
    const examples = M.featured(state.matches).filter(function (item) { return item.match; });
    app.innerHTML = '<h1>Shortlist</h1><p class="lead">Each row is one recorded framework and one recorded property. The score adds only the parts that have evidence. ' + M.NOT.charAt(0).toUpperCase() + M.NOT.slice(1) + ' means the file does not say.</p>' +
      sourceHtml() +
      '<div class="bar"><label><input id="town_only" type="checkbox"' + (state.townOnly ? ' checked' : '') + '> Town named on the framework</label>' +
      '<select id="channel"><option value="auction">Live auction lots</option><option value="watchlist">Watchlist titles</option><option value="both">Lots and watchlist</option></select>' +
      '<input id="q" type="search" placeholder="Framework, town or address" value="' + esc(state.q) + '"></div>' +
      '<section class="examples"><h2>Three recorded matches</h2>' + examples.map(function (item) { return card(item.match, true); }).join('') + '</section>' +
      '<p class="note">' + rows.length + ' matches on this filter. Eight live lots and five watchlist titles are kept for each framework.</p>' +
      '<section class="list">' + rows.slice(0, 40).map(function (match) { return card(match, false); }).join('') + '</section>';
    const channel = document.getElementById('channel');
    channel.value = state.channel;
    document.getElementById('town_only').onchange = function (event) { state.townOnly = event.target.checked; shortlist(); };
    channel.onchange = function (event) { state.channel = event.target.value; shortlist(); };
    document.getElementById('q').oninput = function (event) {
      state.q = event.target.value;
      const pos = event.target.selectionStart;
      shortlist();
      const box = document.getElementById('q');
      if (!box) return;
      box.focus();
      box.setSelectionRange(pos, pos);
    };
    app.querySelectorAll('[data-open]').forEach(function (button) {
      button.onclick = function () { openMatch(button.getAttribute('data-open')); };
    });
  }
  function holders(requirement) {
    if (!requirement.holders.length && !requirement.evidence.length) return '<p>No partner in the partner file is recorded against this framework. Buyer: ' + esc(requirement.buyer) + '.</p>';
    const people = requirement.holders.map(function (holder) {
      return '<li><b>' + esc(holder.name) + '</b> ' + esc(holder.how) + (holder.kind ? ' · ' + esc(holder.kind) : '') + (holder.calledOff ? ' · homes called off on the partner record' : '') + (holder.cities.length ? ' · cities ' + esc(holder.cities.join(', ')) : '') + '</li>';
    }).join('');
    const proof = requirement.evidence.map(function (row) {
      const link = row.url ? ' <a href="' + esc(row.url) + '" target="_blank" rel="noopener">source</a>' : '';
      return '<li><b>' + esc(row.provider) + '</b> · ' + esc(row.label) + ' · ' + esc(row.city) + ' · ' + esc(row.detail) + (row.date ? ' · ' + esc(row.date) : '') + link + '</li>';
    }).join('');
    return (people ? '<ul class="parts">' + people + '</ul>' : '') + (proof ? '<ul class="parts">' + proof + '</ul>' : '<p class="note">No presence.json row names this framework.</p>');
  }
  function detail(match) {
    const requirement = match.requirement;
    const supply = match.supply;
    const input = inputsFor(match);
    const rent = rentRow(supply);
    const sold = M.soldLine(state.prices, supply);
    const pps = M.ppsLine(state.pps, supply);
    const yields = yieldLines(supply);
    const allowance = rent && rent.row
      ? 'Open-market rent ' + M.money(rent.row.omr) + ' a month. Local Housing Allowance ' + M.money(rent.row.lha) + ' a month (' + rent.row.brma + '). Gap ' + M.money(rent.row.gap) + '.'
      : M.NOT + (supply.beds == null ? ' Bedrooms are not on the lot.' : (rent && rent.area === 'Cheshire' ? ' Cheshire is more than one allowance.' : ' No single allowance row for this town and bed count.'));
    const wn = rent && rent.area === 'Manchester' && supply.town && supply.town !== 'Manchester' ? ' The shared rent-gap lookup uses the Central Greater Manchester allowance for this postcode. An allowance for ' + supply.town + ' alone is not in that file.' : '';
    const under = match.underwrite;
    const metrics = under && under.ok ? under.result : null;
    const gateRows = under && under.ok ? under.gates.gates : [];
    app.innerHTML = '<p class="steps"><button type="button" id="back">Shortlist</button><a href="#demand">1 Demand</a><a href="#requirement">2 Requirement</a><a href="#supply">3 Supply</a><a href="#evidence">4 Evidence</a><a href="#underwrite">5 Underwrite</a></p>' +
      '<h1>' + esc(requirement.name) + '</h1><p class="lead">' + esc(supply.address) + '</p>' +
      '<p class="score"><b>' + match.points + '</b><span> / ' + match.counted + ' scored' + (match.missed ? ' · ' + match.missed + ' not recorded' : '') + '</span></p>' +
      '<ul class="parts">' + match.parts.map(function (row) {
        return '<li><b>' + esc(row.key) + ' ' + esc(pointsText(row)) + '</b> ' + esc(row.reason) + '</li>';
      }).join('') + '</ul>' +
      '<section class="card" id="demand"><p class="kicker">1 · Demand</p><h2>Who holds it</h2>' + holders(requirement) +
      '<dl class="kv"><dt>Buyer</dt><dd>' + esc(requirement.buyer) + '</dd><dt>Status</dt><dd>' + esc(requirement.status) + '</dd><dt>Route</dt><dd>' + esc(requirement.investorRoute) + '</dd></dl></section>' +
      '<section class="card" id="requirement"><p class="kicker">2 · Requirement</p><h2>Where and what</h2><dl class="kv">' +
      '<dt>Geography</dt><dd>' + esc(requirement.geography) + '</dd>' +
      '<dt>Towns used</dt><dd>' + esc(requirement.towns.length ? requirement.towns.join(', ') : 'None named. Region matching is off on the default shortlist.') + '</dd>' +
      '<dt>Regions</dt><dd>' + esc(requirement.regions.length ? requirement.regions.join(', ') : M.NOT) + '</dd>' +
      '<dt>Form</dt><dd>' + esc(requirement.spec.forms.length ? requirement.spec.forms.join(', ') : M.NOT) + '</dd>' +
      '<dt>Beds</dt><dd>' + esc(requirement.spec.bedsMin == null ? M.NOT : requirement.spec.bedsMin + '–' + requirement.spec.bedsMax) + '</dd>' +
      '<dt>Term</dt><dd>' + esc(requirement.termText) + (requirement.termFrom ? ' (' + esc(requirement.termFrom) + ')' : '') + '</dd>' +
      '<dt>Rent basis</dt><dd>' + esc(requirement.rentBasis) + (requirement.rentFrom ? ' (' + esc(requirement.rentFrom) + ')' : '') + '</dd>' +
      '<dt>Rent used</dt><dd>' + esc(requirement.annualRent ? M.money(requirement.annualRent) + ' a year. ' + requirement.rentNote : requirement.rentNote) + '</dd>' +
      '<dt>Repairs / voids</dt><dd>' + esc(requirement.repairs) + '</dd></dl>' +
      '<p class="note">Spec text: ' + esc(requirement.spec.text || M.NOT) + '</p></section>' +
      '<section class="card" id="supply"><p class="kicker">3 · Supply</p><h2>' + (supply.live ? 'Live auction lot' : 'Watchlist title') + '</h2><dl class="kv">' +
      '<dt>Address</dt><dd>' + esc(supply.address) + '</dd>' +
      '<dt>Postcode</dt><dd>' + esc(supply.postcode || M.NOT) + '</dd>' +
      '<dt>Town used</dt><dd>' + esc(supply.town || M.NOT) + (supply.region ? ' · region ' + esc(supply.region) : '') + '</dd>' +
      '<dt>Form</dt><dd>' + esc(supply.form) + (supply.beds ? ', ' + supply.beds + '-bed' : ', bedrooms ' + M.NOT) + '</dd>' +
      '<dt>Guide</dt><dd>' + esc(supply.guide ? M.money(supply.guide) : M.NOT) + '</dd>' +
      '<dt>Auction</dt><dd>' + esc(supply.date || M.NOT) + (supply.source ? ' · ' + esc(supply.source) : '') + '</dd>' +
      '<dt>Distress</dt><dd>' + esc(supply.band ? supply.band + ' · ' + supply.bandWhy : part(match, 'distress').reason) + '</dd></dl>' +
      (companyNote(supply) ? '<p class="note">' + esc(companyNote(supply)) + '</p>' : '') +
      (supply.url ? '<p><a href="' + esc(supply.url) + '" target="_blank" rel="noopener">Listing</a></p>' : '') +
      '</section>' +
      '<section class="card" id="evidence"><p class="kicker">4 · Evidence</p><h2>Price and rent context</h2><dl class="kv">' +
      '<dt>' + esc(sold.label) + '</dt><dd>' + esc(sold.value) + '<div class="note">' + esc(sold.source) + '</div></dd>' +
      '<dt>' + esc(pps.label) + '</dt><dd>' + esc(pps.value) + '<div class="note">' + esc(pps.source) + '</div></dd>' +
      '<dt>LHA and market rent</dt><dd>' + esc(allowance + wn) + '</dd>' +
      '<dt>Area yield</dt><dd>' + esc(yields.length ? yields.join('; ') : M.NOT) + '</dd>' +
      '<dt>Laurito NIY book</dt><dd>' + esc(niyLine(supply)) + '</dd></dl>' +
      '<p class="note">These are published area figures. They are not a valuation of this building. Street-level rows in valuation_audit.json are not joined: the lot has no shared transaction id.</p></section>' +
      '<section class="card" id="underwrite"><p class="kicker">5 · Underwrite</p><h2>Monthly model and 14 gates</h2>' +
      '<p class="note">Price is the guide where one is recorded. Rent is filled only when the framework states a figure paid to the owner. Purchase costs 6.8%, loan 50%, rate 6.5% and exit yield 6% are the deal sheet starting figures, not facts from this lot. ' +
      (input.termAssumed ? 'The hold is five years because the framework does not record a single term.' : 'The hold follows the recorded term of ' + input.termYearsUsed + ' years.') + '</p>' +
      '<div class="fields">' +
      field('price', 'Guide price, £', input.price) +
      field('rent1', 'Year one rent, £', input.rent1) +
      field('opexPct', 'Operating costs, % of rent', input.opexPct) +
      field('entryMonth', 'Entry month', input.entryMonth) +
      field('exitMonth', 'Exit month', input.exitMonth) +
      '</div>' +
      (metrics ? metricTiles(metrics) : '<p class="note">Not testable yet. ' + esc((under && under.missing || ['year one rent', 'opex']).join(', ')) + '.</p>') +
      (gateRows.length ? gateTable(under.gates) : '') +
      '<div class="actions"><button type="button" class="primary" id="open_sheet">Open the deal sheet</button></div>' +
      '<p class="note">The deal sheet is the existing monthly model. This button stores these inputs in this browser and opens it. Qualitative gates stay on “needs evidence” until someone ticks them there. Screening research, not an investment recommendation.</p></section>';
    document.getElementById('back').onclick = function () { state.openId = ''; history.replaceState(null, '', location.pathname); shortlist(); };
    app.querySelectorAll('[data-k]').forEach(function (el) {
      el.oninput = function () {
        input[el.dataset.k] = el.value;
        const next = M.withGates(match, M.runUnderwrite(input, state.config));
        const at = state.matches.findIndex(function (row) { return row.id === match.id; });
        if (at >= 0) state.matches[at] = next;
        detail(next);
        const again = app.querySelector('[data-k="' + el.dataset.k + '"]');
        if (again) { again.focus(); const pos = again.value.length; again.setSelectionRange(pos, pos); }
      };
    });
    document.getElementById('open_sheet').onclick = function () {
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem('ed_quick_model') || '{}'); } catch (error) { saved = {}; }
      const next = Object.assign({}, saved, {
        name: input.name,
        route: input.route,
        basis: 'price',
        price: input.price,
        rent1: input.rent1,
        opexPct: input.opexPct,
        entryMonth: input.entryMonth,
        exitMonth: input.exitMonth,
        costsPct: input.costsPct,
        ltvPct: input.ltvPct,
        ratePct: input.ratePct,
        exitYieldPct: input.exitYieldPct,
        saleCostsPct: input.saleCostsPct,
        loanType: input.loanType,
        termYears: input.termYears
      });
      try { localStorage.setItem('ed_quick_model', JSON.stringify(next)); } catch (error) { /* private mode */ }
      location.href = '../index.html#deal';
    };
  }
  function field(key, label, value) {
    return '<label class="field">' + esc(label) + '<input data-k="' + key + '" value="' + esc(value == null ? '' : value) + '" inputmode="decimal" autocomplete="off"></label>';
  }
  function metricTiles(result) {
    const pct = function (value) { return value == null || !isFinite(value) ? M.NOT : (value * 100).toFixed(1) + '%'; };
    const times = function (value) { return value == null || !isFinite(value) ? M.NOT : value.toFixed(2) + 'x'; };
    return '<div class="metrics">' +
      '<div><span>Yield on cost</span><b>' + pct(result.yieldOnCost) + '</b></div>' +
      '<div><span>Levered IRR</span><b>' + pct(result.leveredIrr) + '</b></div>' +
      '<div><span>Interest cover</span><b>' + times(result.interestCover) + '</b></div>' +
      '<div><span>Unlevered IRR</span><b>' + pct(result.unleveredIrr) + '</b></div></div>';
  }
  function gateTable(scored) {
    return '<div class="table-wrap"><table><thead><tr><th>Gate</th><th>Result</th><th>This deal</th><th>Test</th></tr></thead><tbody>' +
      scored.gates.map(function (gate) {
        return '<tr><td>' + gate.n + ' ' + esc(gate.name) + '</td><td class="' + esc(gate.status) + '">' + esc(gate.status) + '</td><td>' + esc(gate.valueText) + '</td><td>' + esc(gate.thresholdText) + '</td></tr>';
      }).join('') + '</tbody></table></div><p class="note">' + esc(window.GatesModel.takeaway(scored)) + '</p>';
  }
  function openMatch(id) {
    const match = state.matches.filter(function (row) { return row.id === id; })[0];
    if (!match) { shortlist(); return; }
    state.openId = id;
    history.replaceState(null, '', '#' + encodeURIComponent(id));
    detail(match);
  }

  async function start() {
    const current = window.lcCurrentLot ? window.lcCurrentLot.currentLot : function () { return true; };
    const repoNote = 'Not published on the Partners site. Loaded from this repository.';
    const [frameworks, partners, offers, presence, lotsFile, watch, prices, pps, gates, areaYields, auctionYields] = await Promise.all([
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
      getJson('Auction yields', SRC.auctionYields)
    ]);
    state.prices = prices;
    state.pps = pps;
    state.config = gates;
    state.yieldRows = (areaYields && areaYields.rows) || [];
    if (window.lcRentGap) {
      try { state.rentTable = window.lcRentGap.build(await (await fetch(SRC.rent, {cache: 'no-store'})).json()); noteSource('LHA and market rent', SRC.rent, true, ''); }
      catch (error) { noteSource('LHA and market rent', SRC.rent, false, 'Could not load'); }
    }
    if (window.lcNiy) {
      try { state.niy = window.lcNiy.averages(window.lcNiy.book(areaYields || {rows: []}, auctionYields || {rows: []})); }
      catch (error) { state.niy = []; }
    }
    if (!frameworks || !lotsFile) {
      app.innerHTML = '<div class="error"><h1>The source files did not load</h1>' + sourceHtml() + '<p>Nothing has been estimated in their place.</p></div>';
      return;
    }
    const requirements = M.buildRequirements(frameworks, partners || {partners: []}, presence || {providers: []}, offers || []);
    const auctions = M.auctionSupply(lotsFile.lots || [], current);
    const watchlist = M.watchSupply(watch || {sites: []});
    state.matches = M.rank(requirements, auctions, 8).concat(M.rank(requirements, watchlist, 5));
    const hash = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (hash && state.matches.some(function (match) { return match.id === hash; })) openMatch(hash);
    else shortlist();
    state.distress = await distressRegister();
    if (state.openId) openMatch(state.openId);
  }
  start();
})();
