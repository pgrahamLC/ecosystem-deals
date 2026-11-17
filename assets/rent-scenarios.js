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

  function councilFromPostcode(pc) {
    const outward = (String(pc || '').toUpperCase().match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)/) || [])[1] || '';
    const prefix = outward.replace(/\d.*/, '');
    const num = +(outward.match(/\d+/) || [])[0];
    if (!prefix) return '';
    if (prefix === 'L') {
      if ([20, 21, 22, 23, 29, 30, 31, 37, 38].indexOf(num) >= 0) return 'Sefton';
      if (num >= 32 && num <= 36) return 'Knowsley';
      if (num === 39 || num === 40) return 'West Lancashire';
      return 'Liverpool';
    }
    if (prefix === 'CH') {
      if ((num >= 41 && num <= 49) || (num >= 60 && num <= 63)) return 'Wirral';
      if ((num >= 1 && num <= 4) || (num >= 64 && num <= 66)) return 'Cheshire West and Chester';
    }
    if (prefix === 'WA') {
      if (num >= 9 && num <= 12) return 'St. Helens';
      if (num === 7 || num === 8) return 'Halton';
      if ([1, 2, 4, 5, 13].indexOf(num) >= 0) return 'Warrington';
      if (num === 6) return 'Cheshire West and Chester';
      if (num === 16) return 'Cheshire East';
    }
    if (prefix === 'CW') return (num >= 6 && num <= 10) ? 'Cheshire West and Chester' : 'Cheshire East';
    if (prefix === 'SK' && num >= 9 && num <= 12) return 'Cheshire East';
    if (prefix === 'B') {
      if ([36, 37, 40].indexOf(num) >= 0 || (num >= 90 && num <= 94)) return 'Solihull';
      if (num === 60 || num === 61) return 'Bromsgrove';
      if (num === 62 || num === 63) return 'Dudley';
      if (num >= 64 && num <= 71) return 'Sandwell';
      if (num >= 77 && num <= 79) return 'Tamworth';
      if (num === 46) return 'North Warwickshire';
      if ([49, 50, 80, 95].indexOf(num) >= 0) return 'Stratford-on-Avon';
      if (num === 97 || num === 98) return 'Redditch';
      return 'Birmingham';
    }
    if (prefix === 'EH') return 'Edinburgh';
    if (prefix === 'BS') return 'Bristol';
    if (prefix === 'GL') return 'Cheltenham';
    if (prefix === 'G') return 'Glasgow';
    if (prefix === 'M' || prefix === 'OL' || prefix === 'BL' || prefix === 'WN') return 'Manchester';
    if (prefix === 'SK' || prefix === 'WA') return 'Manchester';
    return '';
  }

  function areaOf(state) {
    const city = String((state && state.city) || '');
    const fromPc = councilFromPostcode(state && state.pc);
    if (fromPc) return fromPc;
    if (/edinburgh/i.test(city)) return 'Edinburgh';
    if (/bristol/i.test(city)) return 'Bristol';
    if (/cheltenham/i.test(city)) return 'Cheltenham';
    if (/glasgow/i.test(city)) return 'Glasgow';
    if (/wirral|birkenhead/i.test(city)) return 'Wirral';
    if (/liverpool/i.test(city)) return 'Liverpool';
    if (/warrington/i.test(city)) return 'Warrington';
    if (/^cheshire$/i.test(city)) return 'Cheshire';
    if (/cheshire east|crewe|macclesfield/i.test(city)) return 'Cheshire East';
    if (/cheshire west/i.test(city)) return 'Cheshire West and Chester';
    if (/birmingham/i.test(city)) return 'Birmingham';
    if (/manchester|salford|stockport|oldham|bolton|wigan|trafford/i.test(city)) return 'Manchester';
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

  function councilTable(names, beds) {
    const head = beds ? beds + '-bed' : 'rent';
    let html = '<p>Cheshire is not one council and not one allowance. September 2026 open-market rents are shown for each council. No county average is applied.</p><table><thead><tr><th>Council</th><th>ONS ' + esc(head) + '</th><th>Allowance</th></tr></thead><tbody>';
    names.forEach(function (name) {
      const omr = omrMonthly(book, name, beds);
      const row = book.lha && book.lha.areas && book.lha.areas[name];
      let allowance = 'No single allowance';
      if (row && row.monthly && beds && isFinite(+row.monthly[beds])) allowance = row.brma + ' ' + moneyExact(row.monthly[beds]);
      else if (row && row.choices && beds) {
        allowance = row.choices.map(function (choice) {
          const rate = choice.monthly && choice.monthly[beds];
          return choice.brma + (rate ? ' ' + moneyExact(rate) : '');
        }).join(' and ');
      }
      html += '<tr><td>' + esc(name) + '</td><td>' + (omr ? money(omr.monthly) : 'not in this series') + '</td><td>' + esc(allowance) + '</td></tr>';
    });
    return html + '</tbody></table>';
  }

  function siblingNote(area, beds) {
    const groups = {
      Liverpool: ['Liverpool', 'Wirral', 'Knowsley', 'Sefton', 'St. Helens', 'West Lancashire'],
      Wirral: ['Liverpool', 'Wirral', 'Knowsley', 'Sefton', 'St. Helens', 'West Lancashire'],
      Knowsley: ['Liverpool', 'Wirral', 'Knowsley', 'Sefton', 'St. Helens', 'West Lancashire'],
      Sefton: ['Liverpool', 'Wirral', 'Knowsley', 'Sefton', 'St. Helens', 'West Lancashire'],
      'St. Helens': ['Liverpool', 'Wirral', 'Knowsley', 'Sefton', 'St. Helens', 'West Lancashire'],
      'West Lancashire': ['Liverpool', 'Wirral', 'Knowsley', 'Sefton', 'St. Helens', 'West Lancashire'],
      Birmingham: ['Birmingham', 'Solihull', 'Sandwell', 'Dudley', 'Walsall'],
      Solihull: ['Birmingham', 'Solihull', 'Sandwell', 'Dudley', 'Walsall'],
      Sandwell: ['Birmingham', 'Solihull', 'Sandwell', 'Dudley', 'Walsall'],
      Dudley: ['Birmingham', 'Solihull', 'Sandwell', 'Dudley', 'Walsall'],
      Walsall: ['Birmingham', 'Solihull', 'Sandwell', 'Dudley', 'Walsall']
    };
    const names = groups[area];
    if (!names || !book || !beds || beds === 'shared' || beds === '4') return '';
    const bits = names.filter(function (name) { return name !== area; }).map(function (name) {
      const omr = omrMonthly(book, name, beds);
      return omr ? name + ' ' + money(omr.monthly) : '';
    }).filter(Boolean);
    if (!bits.length) return '';
    return '<p class="ios-source">Other councils in this postcode market, same bedroom count: ' + esc(bits.join(', ')) + '. Manchester is not used.</p>';
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
      body += '<p>Choose a postcode, or Edinburgh, Bristol, Manchester, Cheltenham, Glasgow, Liverpool, Cheshire or Birmingham, to see the rents that are loaded.</p>';
    } else if (area === 'Cheshire' && book && beds) {
      body += councilTable(['Cheshire East', 'Cheshire West and Chester', 'Warrington', 'Halton'], beds);
      if (book.omr && book.omr.url) body += '<p class="ios-source"><a href="' + esc(book.omr.url) + '" target="_blank" rel="noopener">ONS private rent series</a></p>';
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
      if (!omr && beds === '4' && omrArea && omrArea.monthly && omrArea.monthly['4plus']) body += ' The ONS 4-or-more average is ' + money(omrArea.monthly['4plus']) + ' a month. It is not used as a 4-bedroom rent, and it is not compared with the 4-bedroom allowance.';
      else if (!omr) body += ' ' + area + ' has no open-market rent in the loaded ONS series for this bedroom count.';
      const choiceRow = book.lha && book.lha.areas && book.lha.areas[area];
      if (!lha && choiceRow && choiceRow.note) body += ' ' + choiceRow.note;
      if (!lha && choiceRow && choiceRow.choices) {
        body += ' Published rates for this size: ' + choiceRow.choices.map(function (choice) {
          const rate = choice.monthly && choice.monthly[beds];
          return choice.brma + (rate ? ' ' + moneyExact(rate) : '');
        }).join(' and ') + '.';
      }
      body += '</p>';
      body += siblingNote(area, beds);
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
    if (window.lcRentRollBench) window.lcRentRollBench();
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

  window.lcRentScenarios = { bedsFrom: bedsFrom, areaOf: areaOf, chosenBeds: chosenBeds, figures: figures, mount: mount, paint: paint, load: load, current: function () { return book; } };
  load();
})();
