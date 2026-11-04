/* Base open-market rent and downside Local Housing Allowance for a deal. */
(function () {
  'use strict';

  const FILE = 'data/rent-scenarios.json';
  let book = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function money(n) {
    if (n == null || !isFinite(+n)) return '—';
    return '£' + Math.round(+n).toLocaleString('en-GB');
  }
  function moneyExact(n) {
    if (n == null || !isFinite(+n)) return '—';
    return '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function pct(n) {
    if (n == null || !isFinite(+n)) return '—';
    return (n * 100).toFixed(2) + '%';
  }

  function bedsFrom(text) {
    const match = String(text || '').match(/\b([1-4])\s*[-\s]?bed(?:room)?s?\b/i);
    return match ? match[1] : '';
  }

  function areaOf(state) {
    const city = String((state && state.city) || '');
    const pc = String((state && state.pc) || '').toUpperCase();
    if (/edinburgh/i.test(city) || /^EH/.test(pc)) return 'Edinburgh';
    if (/bristol/i.test(city) || /^BS/.test(pc)) return 'Bristol';
    if (/cheltenham|gloucester/i.test(city) || /^GL/.test(pc)) return 'Cheltenham';
    if (/glasgow/i.test(city) || /^G\d/.test(pc)) return 'Glasgow';
    if (/manchester|salford|stockport|oldham|bolton|wigan|trafford/i.test(city) || /^(?:M|SK|OL|BL|WN|WA)\d/.test(pc)) return 'Manchester';
    return '';
  }

  function chosenBeds(state) {
    if (!state) return '';
    if (/^(?:shared|[1-4])$/.test(String(state.scenarioBeds || ''))) return String(state.scenarioBeds);
    const rows = (state.rows || []).filter(function (row) { return Number(row.units) > 0 && /^(?:SAR|[1-4])$/.test(String(row.beds || '')); });
    const distinct = rows.map(function (row) { return String(row.beds) === 'SAR' ? 'shared' : String(row.beds); }).filter(function (bed, i, all) { return all.indexOf(bed) === i; });
    if (distinct.length === 1) return distinct[0];
    return bedsFrom(state.name);
  }

  function figures(monthly, units, state, helpers) {
    const count = Number(units) > 0 ? Number(units) : 1;
    const annual = monthly * 12 * count;
    const margin = Number(state && state.opexMargin);
    if (!(monthly > 0) || !helpers || !isFinite(margin)) return { annual: annual, monthly: monthly, homes: count, noi: null, niy: null, bid: null };
    const noi = annual * (1 - margin / 100);
    const yieldRate = Number(state.entryYield) / 100;
    const feeRate = Number(state.acqCostsPct) / 100;
    const mode = state.taxMode || 'auto';
    const bid = yieldRate > 0 ? helpers.bid(noi, yieldRate, count, feeRate, mode) : null;
    const price = Number(state.price) > 0 ? Number(state.price) : null;
    const base = price || bid;
    let niy = null;
    if (base > 0) {
      const tax = helpers.tax(base, count, mode);
      const fees = base * (isFinite(feeRate) ? feeRate : 0);
      const denom = base + tax + fees;
      if (denom > 0) niy = noi / denom;
    }
    return { annual: annual, monthly: monthly, homes: count, noi: noi, niy: niy, bid: bid, onPrice: !!price };
  }

  function lhaMonthly(book, area, beds, state) {
    const ref = (typeof UW !== 'undefined' && UW.refs || []).find(function (row) { return state && row.name === state.brma; });
    const key = beds === 'shared' ? 'SAR' : beds;
    if (ref && isFinite(+ref[key])) return { monthly: +ref[key], brma: ref.name, from: 'selected' };
    const row = book && book.lha && book.lha.areas && book.lha.areas[area];
    if (!row || !row.monthly || !isFinite(+row.monthly[beds])) return null;
    return { monthly: +row.monthly[beds], brma: row.brma, from: 'area' };
  }

  function omrMonthly(book, area, beds) {
    const row = book && book.omr && book.omr.areas ? book.omr.areas[area] : null;
    if (!row || !row.monthly || !isFinite(+row.monthly[beds])) return null;
    return { monthly: +row.monthly[beds], name: row.name, code: row.code };
  }

  function column(title, kicker, downside, body) {
    return '<section class="ios-scenario' + (downside ? ' is-downside' : '') + '"><p class="lc-kicker">' + kicker + '</p><h2>' + title + '</h2>' + body + '</section>';
  }

  function columnBody(pack, kind) {
    if (!pack) return '<p>No ' + kind + ' figure is loaded for this bedroom.</p>';
    const f = pack.figures;
    const homes = f.homes === 1 ? '1 home' : f.homes + ' homes';
    let html = '<p class="ios-figure">' + moneyExact(f.monthly) + '</p><p>a month · ' + money(f.annual) + ' a year · ' + homes + '</p>';
    if (f.noi == null) html += '<p>Enter the running-cost percentage to see the NIY and the maximum bid.</p>';
    else {
      html += '<p>NIY ' + (f.onPrice ? 'on the price entered' : 'at the maximum bid') + ' <b>' + pct(f.niy) + '</b></p>';
      html += '<p>Maximum bid <b>' + money(f.bid) + '</b></p>';
    }
    return html;
  }

  function paintHost(host) {
    if (!host) return;
    const state = (typeof UW !== 'undefined' && UW.state) || {};
    const area = areaOf(state);
    const beds = chosenBeds(state);
    const units = (state.rows || []).reduce(function (sum, row) { return sum + (Number(row.units) || 0); }, 0);
    const options = [['', 'Choose bedrooms'], ['shared', 'Shared room'], ['1', '1 bedroom'], ['2', '2 bedrooms'], ['3', '3 bedrooms'], ['4', '4 bedrooms']];
    let body = '<label class="dlf"><small>Bedrooms</small><select class="js-scenario-beds">' + options.map(function (pair) {
      return '<option value="' + pair[0] + '"' + (pair[0] === beds ? ' selected' : '') + '>' + pair[1] + '</option>';
    }).join('') + '</select></label>';
    if (!area) {
      body += '<p>Choose Edinburgh, Bristol, Manchester, Cheltenham or Glasgow to see the two rents.</p>';
    } else if (!beds) {
      body += '<p>The lot does not state the bedrooms. Choose a size. No rent is assumed until you do.</p>';
    } else if (!book) {
      body += '<p>Rent figures are still loading.</p>';
    } else {
      const helpers = (typeof UW !== 'undefined' && UW.bid && UW.tax) ? { bid: UW.bid, tax: UW.tax } : null;
      const omr = omrMonthly(book, area, beds);
      const lha = lhaMonthly(book, area, beds, state);
      const omrFigures = omr && helpers ? figures(omr.monthly, units, state, helpers) : (omr ? figures(omr.monthly, units, state, null) : null);
      const lhaFigures = lha && helpers ? figures(lha.monthly, units, state, helpers) : (lha ? figures(lha.monthly, units, state, null) : null);
      body += '<div class="ios-scenarios">' +
        column('Open market rent', 'Base', false, columnBody(omr ? { figures: omrFigures } : null, 'open-market')) +
        column('Local Housing Allowance', 'Downside', true, columnBody(lha ? { figures: lhaFigures } : null, 'Local Housing Allowance')) +
        '</div>';
      const omrMeta = book.omr || {};
      const lhaMeta = book.lha || {};
      const omrArea = omrMeta.areas && omrMeta.areas[area];
      body += '<p class="ios-source">Base is ' + (omr ? esc(omr.name) + ' (' + esc(omr.code) + '), ' + esc(omrMeta.month) : 'not in the loaded ONS series for ' + esc(area)) + '. ' + esc(omrMeta.source || '') + '. ';
      body += 'Downside is ' + (lha ? esc(lha.brma) + ' BRMA, ' + moneyExact(lha.monthly) + ' a month' : 'not loaded') + '. ' + esc(lhaMeta.period || '') + ', ' + esc(lhaMeta.valid_from || '') + ' to ' + esc(lhaMeta.valid_to || '') + '.';
      if (!(Number(units) > 0)) body += ' Shown for one home until the number of homes is entered.';
      if (omrArea === null) body += ' Glasgow has no open-market rent in the loaded ONS series.';
      body += '</p>';
      if (omrMeta.url) body += '<p class="ios-source"><a href="' + esc(omrMeta.url) + '" target="_blank" rel="noopener">ONS private rent series</a>';
      if (lhaMeta.publication) body += ' · <a href="' + esc(lhaMeta.publication) + '" target="_blank" rel="noopener">DWP LHA rates 2026/27</a>';
      const csv = lhaMeta.sources && lhaMeta.sources[(book.lha.areas[area] || {}).country];
      if (csv) body += ' · <a href="' + esc(csv) + '" target="_blank" rel="noopener">' + esc((book.lha.areas[area] || {}).country) + ' rate table</a>';
      body += '</p>';
    }
    host.innerHTML = body;
    host.querySelectorAll('.js-scenario-beds').forEach(function (select) {
      select.onchange = function () {
        if (typeof UW === 'undefined' || !UW.state) return;
        UW.state.scenarioBeds = select.value;
        if (typeof uwStore === 'function') uwStore();
        document.querySelectorAll('.js-scenario-beds').forEach(function (other) { if (other !== select) other.value = select.value; });
        paint();
      };
    });
  }

  function paint() {
    document.querySelectorAll('[data-rent-scenarios]').forEach(paintHost);
  }

  function mount() {
    ['1', '3'].forEach(function (step) {
      const parent = document.querySelector('.ios-step[data-step="' + step + '"] .ios-step-body');
      if (!parent) return;
      let host = parent.querySelector('[data-rent-scenarios="' + step + '"]');
      if (!host) {
        host = document.createElement('section');
        host.className = 'ios-scenario-wrap';
        host.setAttribute('data-rent-scenarios', step);
        parent.insertBefore(host, parent.firstChild);
      }
    });
    paint();
  }

  function load() {
    if (book) return Promise.resolve(book);
    return fetch(FILE).then(function (response) { return response.json(); }).then(function (data) {
      book = data;
      paint();
      return book;
    }).catch(function () { book = null; });
  }

  window.lcRentScenarios = { bedsFrom: bedsFrom, areaOf: areaOf, chosenBeds: chosenBeds, figures: figures, mount: mount, paint: paint, load: load };
  load();
})();
