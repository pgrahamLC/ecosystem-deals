/* Rank published open-market rent against Local Housing Allowance. No estimated rents. */
(function () {
  'use strict';

  const AREAS = ['Manchester', 'Bristol', 'Cheltenham', 'Edinburgh', 'Glasgow', 'Liverpool', 'Wirral', 'Knowsley', 'Sefton', 'St. Helens', 'West Lancashire', 'Halton', 'Warrington', 'Cheshire East', 'Cheshire West and Chester', 'Birmingham', 'Solihull', 'Sandwell', 'Dudley', 'Walsall', 'Bromsgrove', 'Redditch', 'Tamworth', 'Lichfield', 'North Warwickshire', 'Stratford-on-Avon'];
  const BEDS = [
    ['shared', 'Shared room'],
    ['1', '1 bedroom'],
    ['2', '2 bedrooms'],
    ['3', '3 bedrooms'],
    ['4', '4 bedrooms']
  ];
  let book = null;
  let table = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function money(n) {
    if (n == null || !isFinite(+n)) return '—';
    const text = Math.abs(n - Math.round(n)) < 0.001 ? Math.round(n) : Number(n);
    return '£' + text.toLocaleString('en-GB', { minimumFractionDigits: text === Math.round(text) ? 0 : 2, maximumFractionDigits: 2 });
  }
  function pct(n) {
    if (n == null || !isFinite(+n)) return '—';
    return (n * 100).toFixed(1) + '%';
  }
  function bedsFrom(text) {
    const match = String(text || '').match(/\b([1-4])\s*[-\s]?bed(?:room)?s?\b/i);
    return match ? match[1] : '';
  }
  const OTHER_AUTHORITY = /\b(?:oldham|rochdale|stockport|bolton|wigan|salford|bury|trafford|altrincham|stretford|ashton-under-lyne|glossop|atherton|swinton|eccles|prestwich|whitefield|radcliffe|farnworth|horwich|chadderton|middleton|heywood|littleborough|milnrow|failsworth|droylsden|denton|audenshaw|marple|bramhall|cheadle|gatley|gloucester|stroud|dursley|cirencester|tewkesbury|east lothian|midlothian|west lothian|musselburgh|livingston)\b/i;

  function councilFromPostcode(pc) {
    const outward = (String(pc || '').toUpperCase().match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)/) || [])[1] || '';
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
  function areaOf(lead) {
    const city = String((lead && (lead.city || (lead.auction && lead.auction.city))) || '');
    const pc = String((lead && (lead.pcShow || lead.pc || lead.postcode)) || '').toUpperCase();
    const where = [city, lead && lead.addr, lead && lead.address].filter(Boolean).join(' ');
    const fromPc = councilFromPostcode(pc);
    if (fromPc) return fromPc;
    if (OTHER_AUTHORITY.test(where)) return 'other';
    if (/\bedinburgh\b/i.test(where)) return 'Edinburgh';
    if (/\bbristol\b/i.test(where) || /bristol/i.test(city)) return 'Bristol';
    if (/\bcheltenham\b/i.test(where) || /cheltenham/i.test(city)) return 'Cheltenham';
    if (/\bglasgow\b/i.test(where) || /glasgow/i.test(city)) return 'Glasgow';
    if (/^cheshire$/i.test(city)) return 'Cheshire';
    if (/\bwirral\b|birkenhead/i.test(where)) return 'Wirral';
    if (/\bliverpool\b/i.test(where) || /liverpool/i.test(city)) return 'Liverpool';
    if (/\bwarrington\b/i.test(where)) return 'Warrington';
    if (/\bcheshire west\b/i.test(where)) return 'Cheshire West and Chester';
    if (/\bcheshire east\b|crewe|macclesfield/i.test(where)) return 'Cheshire East';
    if (/\bbirmingham\b/i.test(where) || /birmingham/i.test(city)) return 'Birmingham';
    if (/\bmanchester\b/i.test(where) || /manchester/i.test(city)) return 'Manchester';
    return '';
  }

  function build(data) {
    const ranked = [];
    const missing = [];
    AREAS.forEach(function (area) {
      const omr = data.omr && data.omr.areas ? data.omr.areas[area] : null;
      const lha = data.lha && data.lha.areas ? data.lha.areas[area] : null;
      BEDS.forEach(function (pair) {
        const key = pair[0];
        const market = omr && omr.monthly ? omr.monthly[key] : null;
        const allowance = lha && lha.monthly ? lha.monthly[key] : null;
        const row = {
          area: area,
          beds: key,
          bedLabel: pair[1],
          omrName: omr && omr.name,
          omrCode: omr && omr.code,
          brma: lha && lha.brma,
          country: lha && lha.country
        };
        if (!(market > 0) || !(allowance > 0)) {
          row.reason = lha && lha.note ? lha.note : (!(market > 0) ? 'No open-market rent in the ONS series' : 'No single Local Housing Allowance is applied');
          row.choices = lha && lha.choices || [];
          missing.push(row);
          return;
        }
        row.omr = market;
        row.lha = allowance;
        row.gap = market - allowance;
        row.pct = (market - allowance) / market;
        ranked.push(row);
      });
    });
    ranked.sort(function (a, b) { return b.gap - a.gap || b.pct - a.pct || a.area.localeCompare(b.area); });
    return { ranked: ranked, missing: missing };
  }

  function placeLine(row) {
    if (row.area === 'Edinburgh') return 'Lothian Broad Rental Market Area for both figures';
    return (row.omrName || row.area) + (row.omrCode ? ' (' + row.omrCode + ')' : '') + ' market rent, against the ' + (row.brma || row.area) + ' allowance';
  }

  function forLead(lead) {
    if (!table) return null;
    const area = areaOf(lead);
    if (area === 'other') return { gap: null, label: 'Rent gap: no market rent for this local authority' };
    if (area === 'Cheshire') return { gap: null, label: 'Rent gap: Cheshire is more than one council. Use the postcode. East and West Cheshire are not given one allowance. Warrington and Halton use the North Cheshire allowance.' };
    if (!area) return null;
    const beds = (lead && lead.beds) || (lead && lead.auction && lead.auction.beds) || bedsFrom([
      lead && lead.addr, lead && lead.address, lead && lead.why,
      lead && lead.l && lead.l.type, lead && lead.l && lead.l.address,
      lead && lead.auction && lead.auction.type
    ].filter(Boolean).join(' '));
    if (!beds) return { gap: null, label: 'Rent gap: bedrooms not stated' };
    if (AREAS.indexOf(area) < 0) return { gap: null, label: '' };
    const row = table.ranked.find(function (item) { return item.area === area && item.beds === beds; });
    if (!row) return { gap: null, label: 'Rent gap: no market rent for ' + area + ' ' + beds + '-bed' };
    return {
      gap: row.gap,
      pct: row.pct,
      beds: beds,
      label: 'Rent gap ' + money(row.gap) + '/mo · ' + pct(row.pct) + ' · ' + row.bedLabel.toLowerCase() + ' · ' + placeLine(row)
    };
  }

  function spanLabel(iso) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const parts = String(iso || '').split('-');
    const month = months[(+parts[1] || 1) - 1] || '';
    return month && parts[0] ? month + ' ' + parts[0] : String(iso || '');
  }

  function rowCard(row, i) {
    const lhaSpan = spanLabel(book.lha.valid_from) + '–' + spanLabel(book.lha.valid_to);
    return '<article class="ios-gap"><p class="lc-kicker">' + (i + 1) + ' · ' + esc(row.area) + '</p><h2>' + esc(row.bedLabel) + '</h2><p class="ios-figure">' + money(row.gap) + '</p><p>' + pct(row.pct) + ' of market rent</p><p>Open-market rent ' + money(row.omr) + ' · ONS PIPR ' + esc(book.omr.month) + '</p><p>Local Housing Allowance ' + money(row.lha) + ' · DWP ' + esc(lhaSpan) + '</p><p>' + esc(placeLine(row)) + '</p><p>Sources: <a href="' + esc(book.omr.url) + '" target="_blank" rel="noopener">ONS private rent series</a> · <a href="' + esc(book.lha.publication) + '" target="_blank" rel="noopener">DWP LHA rates 2026/27</a></p></article>';
  }

  function section(title, note, rows) {
    return '<h2 class="ios-h">' + esc(title) + '</h2><p>' + esc(note) + '</p><div class="ios-gaps">' + rows.map(rowCard).join('') + '</div>';
  }

  function paint(host) {
    if (!host) return;
    if (!book) {
      host.innerHTML = '<p class="lc-kicker">More</p><h1>LHA vs market rent</h1><p>Loading the published rents.</p>';
      return;
    }
    const biggest = table.ranked;
    const smallest = table.ranked.slice().reverse();
    const absent = table.missing.map(function (row) {
      return '<li>' + esc(row.area) + ', ' + esc(row.bedLabel.toLowerCase()) + ': ' + esc(row.reason) + '.</li>';
    }).join('');
    const top = biggest[0];
    const low = smallest[0];
    host.innerHTML = '<p class="lc-kicker">More</p><h1>LHA vs market rent</h1><p class="lc-purpose">Open-market rent minus the Local Housing Allowance. September 2026 ONS rents and 2026/27 allowances. ' + table.ranked.length + ' comparisons where one allowance covers the council. Nothing here is estimated.</p>' +
      (top && low ? '<p>Biggest is ' + esc(top.area) + ' ' + esc(top.bedLabel.toLowerCase()) + ', ' + money(top.gap) + ' a month. Smallest is ' + esc(low.area) + ' ' + esc(low.bedLabel.toLowerCase()) + ', ' + money(low.gap) + ' a month.</p>' : '') +
      section('Biggest gaps', 'Largest gap first. A wide gap is the downside if the tenant relies on the allowance.', biggest) +
      section('Smallest gaps', 'Smallest gap first. This is where the allowance is closest to the open-market rent.', smallest) +
      '<details class="ios-disc"><summary>Sizes with no single gap (' + table.missing.length + ')</summary><p>A shared room has no ONS rent. The ONS 4-or-more figure is not compared with the 4-bedroom allowance. Cheshire East, Cheshire West and Chester, and Sefton are not given one allowance.</p><ul>' + absent + '</ul></details>' +
      '<details class="ios-disc"><summary>Sources and dates</summary><p>' + esc(book.omr.source) + '. Month: ' + esc(book.omr.month) + '.</p><p><a href="' + esc(book.omr.url) + '" target="_blank" rel="noopener">ONS private rent series</a></p><p>' + esc(book.lha.note) + ' In force ' + esc(book.lha.valid_from) + ' to ' + esc(book.lha.valid_to) + '. Checked ' + esc(book.lha.checked) + '.</p><p><a href="' + esc(book.lha.publication) + '" target="_blank" rel="noopener">DWP LHA rates 2026/27</a></p><p><a href="' + esc(book.lha.sources.England) + '" target="_blank" rel="noopener">England rate table</a> · <a href="' + esc(book.lha.sources.Scotland) + '" target="_blank" rel="noopener">Scotland rate table</a></p><p>The percentage is the monthly gap divided by the open-market rent.</p></details>';
  }

  function load() {
    return fetch('data/rent-scenarios.json').then(function (response) { return response.json(); }).then(function (data) {
      book = data;
      table = build(data);
      const host = document.getElementById('lc_screen');
      if (host && host.querySelector('h1') && host.querySelector('h1').textContent === 'LHA vs market rent') paint(host);
      if (typeof dmDraw === 'function' && window.DM && DM.sites && DM.sites.length) dmDraw(false);
      return table;
    }).catch(function () { book = null; table = null; });
  }

  window.lcRentGap = { build: build, bedsFrom: bedsFrom, areaOf: areaOf, forLead: forLead, paint: paint, load: load, areas: AREAS, beds: BEDS };
  load();
})();
