/* Mack Living and Laurito Capital. Market Screen, Analysis Dashboard, Monday shortcuts. */
(function (root) {
  'use strict';

  const FILES = {
    mack: 'data/mack-living.json',
    weights: 'data/score-weights.json',
    contracts: 'data/contract-opportunities.json',
    benchmarks: 'data/market-benchmarks.json',
    vip: 'data/vip-tracker.json',
    partners: 'partners.json',
    rents: 'data/rent-scenarios.json',
    lha: 'underwriting_lha.json',
    demand: 'demand.json'
  };
  const WEIGHT_KEY = 'lcMackWeights';
  const NOTE_KEY = 'lcMackNotes';
  const REG = new Set(['PLC', 'Charity', 'Registered provider (RSH)', 'Registered provider + charity', 'Registered society']);
  const FACTOR = { P: 1, C: 0.5, F: 0 };
  const cache = {};

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function money(n) {
    if (n == null || !isFinite(+n)) return 'Not disclosed';
    const sign = n < 0 ? '-' : '';
    const v = Math.abs(n);
    const body = v >= 1e6 ? (v / 1e6).toFixed(1) + 'm' : v >= 1e3 ? Math.round(v / 1e3) + 'k' : String(Math.round(v));
    return sign + '£' + body;
  }
  function month(n) {
    if (n == null || !isFinite(+n)) return 'Not loaded';
    return '£' + Number(n).toLocaleString('en-GB', { maximumFractionDigits: 2 });
  }

  function load(url) {
    if (cache[url]) return cache[url];
    cache[url] = fetch(url + '?v=' + Date.now()).then(function (r) {
      if (!r.ok) throw new Error(url + ' did not load');
      return r.json();
    });
    return cache[url];
  }

  function thresholds() {
    return { yrs: 10, rev: 1000000, emp: 10, na: 250000 };
  }

  function evaluatePartner(x, t, now) {
    t = t || thresholds();
    const clock = now ? new Date(now) : new Date();
    const r = {};
    const why = {};
    const b = x.board || 0;
    if (REG.has(x.form)) {
      r.gov = 'P';
      why.gov = x.form + (b ? ', board of ' + b : '');
    } else if (x.parent_gov) {
      r.gov = 'P';
      why.gov = 'Governed by parent ' + x.parent_gov;
    } else if (x.form === 'CIO' && b >= 3) {
      r.gov = 'P';
      why.gov = 'Charitable incorporated organisation, ' + b + ' trustees';
    } else if (b >= 3 && !x.owner_managed) {
      r.gov = 'P';
      why.gov = b + ' directors, no individual controls over 50 percent';
    } else if (b >= 3 || x.parent) {
      r.gov = 'C';
      why.gov = (b ? b + ' directors' : 'Board unknown') + (x.owner_managed ? ', owner-managed' : '') + (x.parent ? ', parent ' + x.parent : '');
    } else {
      r.gov = 'F';
      why.gov = (b ? b + ' directors' : 'No board data') + (x.owner_managed ? ', owner-managed' : '');
    }
    r.fw = x.n_frameworks >= 1 ? 'P' : 'F';
    why.fw = x.n_frameworks ? x.n_frameworks + ' contract' + (x.n_frameworks > 1 ? 's' : '') + (x.called_off ? ', homes called off' : '') : 'None found';
    const yrs = x.started ? (clock - new Date(x.started)) / 3.15576e10 : null;
    if (yrs == null) {
      r.age = (x.rp_units || 0) >= 1000 ? 'P' : 'C';
      why.age = r.age === 'P' ? 'Start date not loaded. Regulated landlord with ' + x.rp_units + ' homes.' : 'Start date unknown';
    } else {
      r.age = yrs >= t.yrs ? 'P' : 'F';
      why.age = Math.floor(yrs) + ' years, since ' + String(x.started).slice(0, 4);
    }
    if (x.turnover != null) {
      r.rev = x.turnover >= t.rev ? 'P' : 'F';
      why.rev = money(x.turnover);
    } else if (x.acc_type === 'micro-entity') {
      r.rev = 'F';
      why.rev = 'Micro-entity accounts, turnover under £1m';
    } else {
      r.rev = 'C';
      why.rev = 'Not disclosed in the filed accounts';
    }
    if (x.profit != null) {
      r.pro = x.profit > 0 ? 'P' : 'F';
      why.pro = money(x.profit);
    } else {
      r.pro = 'C';
      why.pro = 'Not disclosed';
    }
    if (x.employees != null) {
      r.emp = x.employees >= t.emp ? 'P' : 'F';
      why.emp = x.employees + ' staff';
    } else if ((x.turnover || 0) >= 2e7 || (x.rp_units || 0) >= 1000) {
      r.emp = 'P';
      why.emp = 'Not stated. Large organisation on revenue or homes.';
    } else {
      r.emp = 'C';
      why.emp = 'Not stated';
    }
    if (x.net_assets == null) {
      r.bs = 'C';
      why.bs = 'Not available';
    } else if (x.net_assets < t.na || x.insolvency || x.overdue) {
      r.bs = 'F';
      why.bs = x.insolvency ? 'Insolvency history' : x.overdue ? 'Accounts overdue' : 'Net assets ' + money(x.net_assets);
    } else if ((x.net_current != null && x.net_current < 0) || x.going_concern || x.audit_qualified) {
      r.bs = 'C';
      why.bs = 'Net assets ' + money(x.net_assets) + '. Review current liabilities or the audit note.';
    } else {
      r.bs = 'P';
      why.bs = 'Net assets ' + money(x.net_assets);
    }
    const values = Object.keys(r).map(function (k) { return r[k]; });
    const res = values.every(function (s) { return s === 'P'; }) ? 'Stable partner' : values.indexOf('F') >= 0 ? 'Weak' : 'Candidate';
    return { r: r, why: why, res: res };
  }

  function componentFactor(ev, key) {
    const g = ev.r;
    if (key === 'financial_health') return (FACTOR[g.pro] + FACTOR[g.bs]) / 2;
    if (key === 'ownership') return FACTOR[g.gov];
    if (key === 'company_size') return (FACTOR[g.rev] + FACTOR[g.emp]) / 2;
    if (key === 'contracts') return FACTOR[g.fw];
    if (key === 'trading_history') return FACTOR[g.age];
    return 0;
  }

  function scorePartner(ev, weights) {
    const keys = Object.keys(weights || {});
    let raw = 0;
    let sum = 0;
    const lines = {};
    keys.forEach(function (key) {
      const w = Number(weights[key]) || 0;
      const f = componentFactor(ev, key);
      sum += w;
      raw += w * f;
      lines[key] = { weight: w, factor: f, points: Math.round(w * f * 10) / 10 };
    });
    const score = sum > 0 ? Math.round((100 * raw) / sum) : 0;
    return { score: score, sum: sum, lines: lines };
  }

  function activeWeights(file) {
    const base = (file && file.proposed && file.proposed.weights) || {};
    try {
      const saved = JSON.parse(localStorage.getItem(WEIGHT_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        const out = {};
        Object.keys(base).forEach(function (k) {
          const n = Number(saved[k]);
          out[k] = isFinite(n) && n >= 0 ? n : base[k];
        });
        return out;
      }
    } catch (e) { /* keep the file */ }
    return Object.assign({}, base);
  }

  function band(score) {
    if (score >= 70) return 'Higher on the shortlist';
    if (score >= 40) return 'Needs a check';
    return 'Weak on this weighting';
  }

  function fresh(label, when) {
    return '<p class="gr-fresh"><b>' + esc(label) + '</b> Last updated ' + esc(when || 'not recorded') + '</p>';
  }

  function goto(mode, extra) {
    if (mode === 'leads' && extra && typeof viewMode === 'function') {
      viewMode('distress');
      setTimeout(function () {
        const sel = document.getElementById('dm_scope');
        if (!sel) return;
        sel.value = extra;
        sel.dispatchEvent(new Event('change'));
      }, 400);
      return;
    }
    if (typeof viewMode === 'function') viewMode(mode);
  }

  function paint(mode, host) {
    if (!host) return;
    host.innerHTML = '<p class="lc-kicker">Mack Living and Laurito Capital</p><h1>Loading</h1>';
    const run = mode === 'mack' ? paintMack : mode === 'market' ? paintMarket : paintAnalysis;
    run(host).catch(function (e) {
      host.innerHTML = '<p class="lc-kicker">Mack Living and Laurito Capital</p><h1>Could not load</h1><p>' + esc(e.message) + '</p>';
    });
  }

  function paintMack(host) {
    return Promise.all([load(FILES.mack), load(FILES.contracts), load(FILES.weights), load(FILES.partners)]).then(function (pack) {
      const mack = pack[0];
      const contracts = pack[1];
      const weights = activeWeights(pack[2]);
      const partners = (pack[3].partners || []).filter(function (x) { return !x.superseded_by; });
      const ranked = partners.map(function (x) {
        const ev = evaluatePartner(x);
        return { x: x, ev: ev, score: scorePartner(ev, weights).score };
      }).sort(function (a, b) { return b.score - a.score; }).slice(0, 5);
      const notes = localStorage.getItem(NOTE_KEY) || '';
      host.innerHTML = '<p class="lc-kicker">Mack Living and Laurito Capital</p><h1>Mack Living</h1>' +
        '<p class="lc-purpose">Monday morning shortcuts for the joint discussion. Regions and contracts are seeded from this site and marked where Patrick has not confirmed them.</p>' +
        fresh('Mack Living list', mack.updated) +
        '<p class="gr-flag">' + esc(mack.note) + '</p>' +
        '<section class="gr-card"><p class="lc-kicker">Meeting</p><h2>' + esc(mack.meeting.name) + '</h2><p>' + esc(mack.meeting.when) + '. ' + esc(mack.meeting.status) + '.</p><p>' + esc(mack.meeting.note) + '</p></section>' +
        '<section class="gr-card"><h2>Agenda</h2><ol class="gr-agenda">' + mack.agenda.map(function (item) {
          return '<li><b>' + esc(item.title) + '</b><span>' + esc(item.note) + '</span></li>';
        }).join('') + '</ol></section>' +
        '<section class="gr-card"><h2>Priority regions</h2><div class="gr-regions">' + mack.regions.map(function (region) {
          return '<button type="button" class="gr-region" data-scope="' + esc(region.scope) + '"><b>' + esc(region.name) + '</b><span>' + esc(region.status) + '</span><span>' + esc(region.why) + '</span></button>';
        }).join('') + '</div><p class="foot">Edit data/mack-living.json to change this list.</p></section>' +
        '<section class="gr-card"><h2>Market Screen shortlist</h2><p class="foot">Top five on the proposed score. Not a credit decision.</p><ol class="gr-agenda">' + ranked.map(function (row) {
          return '<li><b>' + esc(row.x.name) + '</b><span>' + row.score + ' · ' + esc(row.ev.res) + '</span></li>';
        }).join('') + '</ol><button type="button" class="btn" data-go="market">Open Market Screen</button></section>' +
        '<section class="gr-card" id="mack_contracts"><h2>Contract opportunities</h2>' + fresh('Contract list', contracts.updated) +
        contracts.items.map(function (item) {
          return '<article class="gr-slot"><b>' + esc(item.title) + '</b><span class="gr-flag">' + esc(item.status) + '</span><p>' + esc(item.summary) + '</p><p class="foot">' + esc(item.region) + (item.placeholder ? ' · Placeholder' : '') + '</p></article>';
        }).join('') + '</section>' +
        '<section class="gr-card"><h2>Notes for Monday</h2><p class="foot">' + esc(mack.agenda.filter(function (a) { return a.id === 'notes'; })[0].note) + '</p><textarea id="mack_notes" aria-label="Monday notes">' + esc(notes) + '</textarea></section>';
      host.querySelectorAll('.gr-region').forEach(function (btn) {
        btn.onclick = function () { goto('leads', btn.getAttribute('data-scope')); };
      });
      host.querySelector('[data-go="market"]').onclick = function () { goto('market'); };
      const box = host.querySelector('#mack_notes');
      box.addEventListener('input', function () { localStorage.setItem(NOTE_KEY, box.value); });
    });
  }

  function paintMarket(host) {
    return Promise.all([load(FILES.weights), load(FILES.partners)]).then(function (pack) {
      const file = pack[0];
      const weights = activeWeights(file);
      const partners = (pack[1].partners || []).filter(function (x) { return !x.superseded_by; });
      const rows = partners.map(function (x) {
        const ev = evaluatePartner(x);
        const scored = scorePartner(ev, weights);
        return { x: x, ev: ev, scored: scored };
      }).sort(function (a, b) { return b.scored.score - a.scored.score || a.x.name.localeCompare(b.x.name); });
      const labels = {
        financial_health: 'Financial health',
        ownership: 'Ownership structure',
        company_size: 'Company size',
        contracts: 'Contracts',
        trading_history: 'Trading history'
      };
      const cities = [];
      rows.forEach(function (row) {
        (row.x.cities || []).forEach(function (c) { if (cities.indexOf(c) < 0) cities.push(c); });
      });
      cities.sort();
      host.innerHTML = '<p class="lc-kicker">Mack Living and Laurito Capital</p><h1>Market Screen</h1>' +
        '<p class="lc-purpose">Partner screening for the joint resource. The score uses proposed weights. Luke and Liza have not agreed them.</p>' +
        fresh('Partner file', pack[1].updated || 'not recorded') +
        fresh('Weight file', file.updated) +
        '<p class="gr-flag">' + esc(file.proposed.not_final) + '</p>' +
        '<details class="ios-disc" open><summary>Scoring weights</summary>' +
        '<p>' + esc(file.current.partner_screen.rule) + '</p>' +
        '<p>Covenant points already used elsewhere: Stable partner ' + file.current.covenant_points_in_operator_scoring['Stable partner'] + ', Candidate ' + file.current.covenant_points_in_operator_scoring.Candidate + ', Weak ' + file.current.covenant_points_in_operator_scoring.Weak + '.</p>' +
        '<p>Operator screen, unchanged: fit ' + file.current.operator_market_score.fit + ', financial strength ' + file.current.operator_market_score.financial_strength + ', homes nearby ' + file.current.operator_market_score.homes_nearby + ', published offer ' + file.current.operator_market_score.published_landlord_offer + '. ' + esc(file.current.operator_market_score.note) + '</p>' +
        '<p>' + esc(file.proposed.scoring) + '</p>' +
        '<div class="gr-weights">' + Object.keys(weights).map(function (key) {
          return '<label>' + esc(labels[key] || key) + '<input type="number" min="0" step="1" data-w="' + esc(key) + '" value="' + esc(weights[key]) + '" aria-label="' + esc(labels[key] || key) + '"></label><p class="foot">' + esc(file.proposed.rationale[key] || '') + '</p>';
        }).join('') + '</div>' +
        '<p class="foot" id="gr_sum"></p><button type="button" class="btn" id="gr_apply">Apply weights</button> <button type="button" class="btn sec" id="gr_reset">Reset to the file</button></details>' +
        '<div class="ctl"><label>Region <select id="gr_city"><option value="">All seeded towns</option>' + cities.map(function (c) {
          return '<option value="' + esc(c) + '">' + esc(c === 'City Of Bristol' ? 'Bristol' : c) + '</option>';
        }).join('') + '</select></label><label>Search <input id="gr_q" type="search" aria-label="Search partners"></label></div>' +
        '<div class="scroll"><table class="gr-table"><thead><tr><th class="l">Partner</th><th>Score</th><th class="l">Gate result</th><th class="l">Where</th></tr></thead><tbody id="gr_rows"></tbody></table></div>' +
        '<div id="gr_detail" class="gr-card"><p class="foot">Select a partner to see the score breakdown.</p></div>';
      const sumEl = host.querySelector('#gr_sum');
      function draw() {
        const city = host.querySelector('#gr_city').value;
        const q = host.querySelector('#gr_q').value.trim().toLowerCase();
        const live = {};
        host.querySelectorAll('[data-w]').forEach(function (input) { live[input.getAttribute('data-w')] = Number(input.value) || 0; });
        const sum = Object.keys(live).reduce(function (n, k) { return n + live[k]; }, 0);
        sumEl.textContent = 'Weights sum to ' + sum + (sum === 100 ? '.' : '. The score is scaled to 100.');
        const shown = rows.filter(function (row) {
          if (city && (row.x.cities || []).indexOf(city) < 0) return false;
          if (q && (row.x.name + ' ' + (row.x.legal || '')).toLowerCase().indexOf(q) < 0) return false;
          return true;
        }).map(function (row) {
          return { x: row.x, ev: row.ev, scored: scorePartner(row.ev, live) };
        }).sort(function (a, b) { return b.scored.score - a.scored.score; });
        host.querySelector('#gr_rows').innerHTML = shown.map(function (row, i) {
          return '<tr data-i="' + i + '"><td class="l"><b>' + esc(row.x.name) + '</b><div class="foot">' + esc(row.x.form || '') + '</div></td><td>' + row.scored.score + '</td><td class="l">' + esc(row.ev.res) + '</td><td class="l">' + esc((row.x.cities || []).map(function (c) { return c === 'City Of Bristol' ? 'Bristol' : c; }).join(', ')) + '</td></tr>';
        }).join('');
        host.querySelectorAll('#gr_rows tr').forEach(function (tr) {
          tr.onclick = function () {
            const row = shown[+tr.getAttribute('data-i')];
            host.querySelector('#gr_detail').innerHTML = '<h2>' + esc(row.x.name) + '</h2><p><b>' + row.scored.score + '</b> · ' + esc(band(row.scored.score)) + ' · ' + esc(row.ev.res) + '</p><ul>' +
              Object.keys(row.scored.lines).map(function (key) {
                const line = row.scored.lines[key];
                return '<li><b>' + esc(labels[key] || key) + '</b> weight ' + line.weight + ', contribution ' + line.points + '</li>';
              }).join('') + '</ul><p class="foot">Accounts to ' + esc(row.x.period_end || 'an unknown date') + '. ' + esc(row.ev.why.pro) + ' profit. ' + esc(row.ev.why.bs) + '.</p>';
          };
        });
      }
      host.querySelector('#gr_apply').onclick = function () {
        const live = {};
        host.querySelectorAll('[data-w]').forEach(function (input) { live[input.getAttribute('data-w')] = Number(input.value) || 0; });
        localStorage.setItem(WEIGHT_KEY, JSON.stringify(live));
        draw();
      };
      host.querySelector('#gr_reset').onclick = function () {
        localStorage.removeItem(WEIGHT_KEY);
        const again = activeWeights(file);
        host.querySelectorAll('[data-w]').forEach(function (input) {
          input.value = again[input.getAttribute('data-w')];
        });
        draw();
      };
      host.querySelector('#gr_city').onchange = draw;
      host.querySelector('#gr_q').oninput = draw;
      draw();
    });
  }

  function lhaRows(book, table) {
    const areas = book.lha.areas;
    const out = [];
    Object.keys(areas).forEach(function (name) {
      const area = areas[name];
      out.push({ place: name, brma: area.brma, monthly: area.monthly, country: area.country });
    });
    const south = (table.rates || []).filter(function (row) { return row.name === 'Southern Greater Manchester'; })[0];
    if (south) {
      out.push({
        place: 'Greater Manchester, south',
        brma: 'Southern Greater Manchester',
        country: 'England',
        monthly: { shared: south.SAR, '1': south['1'], '2': south['2'], '3': south['3'], '4': south['4'] }
      });
    }
    return out;
  }

  function paintAnalysis(host) {
    return Promise.all([load(FILES.rents), load(FILES.lha), load(FILES.demand), load(FILES.benchmarks), load(FILES.vip), load(FILES.contracts)]).then(function (pack) {
      const rents = pack[0];
      const rates = lhaRows(rents, pack[1]);
      const demand = pack[2];
      const benchmarks = pack[3];
      const vip = pack[4];
      const contracts = pack[5];
      const demandKey = { Manchester: 'Manchester', Bristol: 'City Of Bristol', Cheltenham: 'Cheltenham', Edinburgh: 'Edinburgh', Glasgow: 'Glasgow' };
      host.innerHTML = '<p class="lc-kicker">Mack Living and Laurito Capital</p><h1>Analysis Dashboard</h1>' +
        '<p class="lc-purpose">Regional evidence for the five seeded towns. Local Housing Allowance is the official rate. It is a benefit cap, not a rent you can underwrite.</p>' +
        fresh('LHA file', (rents.lha.checked || rents.lha.valid_from) + ', rates ' + rents.lha.period) +
        fresh('Demand file', demand.updated) +
        fresh('Benchmarks', benchmarks.updated) +
        fresh('VIP note', vip.updated) +
        '<section class="gr-card"><h2>Local Housing Allowance ' + esc(rents.lha.period) + '</h2><p class="foot">' + esc(rents.lha.note) + ' In force ' + esc(rents.lha.valid_from) + ' to ' + esc(rents.lha.valid_to) + '.</p>' +
        '<div class="scroll"><table class="gr-table"><thead><tr><th class="l">Area</th><th class="l">Broad rental market area</th><th>Shared</th><th>1 bed</th><th>2 bed</th><th>3 bed</th><th>4 bed</th></tr></thead><tbody>' +
        rates.map(function (row) {
          const m = row.monthly;
          return '<tr><td class="l">' + esc(row.place) + '</td><td class="l">' + esc(row.brma) + '</td><td>' + month(m.shared) + '</td><td>' + month(m['1']) + '</td><td>' + month(m['2']) + '</td><td>' + month(m['3']) + '</td><td>' + month(m['4']) + '</td></tr>';
        }).join('') + '</tbody></table></div><p class="foot"><a href="' + esc(rents.lha.publication) + '" target="_blank" rel="noopener">DWP Universal Credit LHA rates 2026 to 2027</a>. England table and Scotland table on GOV.UK. Checked ' + esc(rents.lha.checked) + '.</p></section>' +
        '<section class="gr-card"><h2>Open-market rent beside the allowance</h2><p class="foot">' + esc(rents.omr.note) + ' Month ' + esc(rents.omr.month) + '.</p><div class="scroll"><table class="gr-table"><thead><tr><th class="l">Area</th><th>1 bed</th><th>2 bed</th><th>3 bed</th></tr></thead><tbody>' +
        Object.keys(rents.omr.areas).map(function (name) {
          const area = rents.omr.areas[name];
          if (!area) return '<tr><td class="l">' + esc(name) + '</td><td colspan="3" class="l">Not in the loaded series</td></tr>';
          return '<tr><td class="l">' + esc(area.name) + '</td><td>' + month(area.monthly['1']) + '</td><td>' + month(area.monthly['2']) + '</td><td>' + month(area.monthly['3']) + '</td></tr>';
        }).join('') + '</tbody></table></div><p class="foot"><a href="' + esc(rents.omr.url) + '" target="_blank" rel="noopener">' + esc(rents.omr.source) + '</a></p></section>' +
        '<section class="gr-card"><h2>Published demand, not a lease</h2>' + Object.keys(demandKey).map(function (name) {
          const city = demand.cities[demandKey[name]];
          if (!city || !city.stats || !city.stats.ta_total) return '<p><b>' + esc(name) + '.</b> Not in the loaded demand file.</p>';
          const ta = city.stats.ta_total;
          return '<p><b>' + esc(name) + '.</b> ' + esc(ta.value) + ' households in temporary accommodation at ' + esc(ta.period) + '. <a href="' + esc(ta.url) + '" target="_blank" rel="noopener">' + esc(ta.table) + '</a></p>';
        }).join('') + '</section>' +
        '<section class="gr-card"><h2>Competitor and supplier benchmarks</h2><p>' + esc(benchmarks.note) + '</p>' + benchmarks.slots.map(function (slot) {
          return '<article class="gr-slot"><b>' + esc(slot.measure) + '</b><span class="gr-flag">' + esc(slot.status) + '</span><p class="foot">' + esc(slot.region) + ' · ' + esc(slot.unit) + (slot.amount == null ? ' · No figure' : '') + '</p></article>';
        }).join('') + '</section>' +
        '<section class="gr-card"><h2>Contract check</h2>' + fresh('Contract list', contracts.freshness) + contracts.items.map(function (item) {
          return '<article class="gr-slot"><b>' + esc(item.title) + '</b><span class="gr-flag">' + esc(item.status) + '</span><p>' + esc(item.summary) + '</p></article>';
        }).join('') + '</section>' +
        '<details class="ios-disc"><summary>' + esc(vip.title) + '</summary>' + fresh('VIP note', vip.updated) + '<p>' + esc(vip.note) + '</p><ul>' + vip.consider.map(function (line) {
          return '<li>' + esc(line) + '</li>';
        }).join('') + '</ul></details>';
    });
  }

  root.lcGroup = {
    evaluatePartner: evaluatePartner,
    scorePartner: scorePartner,
    componentFactor: componentFactor,
    paint: paint,
    thresholds: thresholds
  };

  setTimeout(function () {
    const hash = root.location && root.location.hash;
    if (hash === '#mack' || hash === '#market' || hash === '#analysis') {
      if (typeof viewMode === 'function') viewMode(hash.slice(1));
    }
  }, 0);
})(typeof window !== 'undefined' ? window : globalThis);
