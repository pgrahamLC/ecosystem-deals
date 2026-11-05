/* Rank published open-market rent against Local Housing Allowance. No estimated rents. */
(function () {
  'use strict';

  const AREAS = ['Manchester', 'Bristol', 'Cheltenham', 'Edinburgh', 'Glasgow'];
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

  function areaOf(lead) {
    const city = String((lead && (lead.city || (lead.auction && lead.auction.city))) || '');
    const pc = String((lead && (lead.pcShow || lead.pc || lead.postcode)) || '').toUpperCase();
    const where = [city, lead && lead.addr, lead && lead.address].filter(Boolean).join(' ');
    if (OTHER_AUTHORITY.test(where)) return 'other';
    if (/\bedinburgh\b/i.test(where) || /^EH/.test(pc)) return 'Edinburgh';
    if (/\bbristol\b/i.test(where) || /bristol/i.test(city) || /^BS/.test(pc)) return 'Bristol';
    if (/\bcheltenham\b/i.test(where) || /cheltenham/i.test(city)) return 'Cheltenham';
    if (/\bglasgow\b/i.test(where) || /glasgow/i.test(city) || /^G\d/.test(pc)) return 'Glasgow';
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
          row.reason = !(market > 0) ? 'No open-market rent in the ONS series' : 'No Local Housing Allowance rate';
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
    if (!area) return null;
    const beds = (lead && lead.beds) || (lead && lead.auction && lead.auction.beds) || bedsFrom([
      lead && lead.addr, lead && lead.address, lead && lead.why,
      lead && lead.l && lead.l.type, lead && lead.l && lead.l.address,
      lead && lead.auction && lead.auction.type
    ].filter(Boolean).join(' '));
    if (!beds) return { gap: null, label: 'Rent gap: bedrooms not stated' };
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

  function section(title, rows) {
    return '<h2 class="ios-h">' + esc(title) + '</h2><div class="ios-gaps">' + rows.map(rowCard).join('') + '</div>';
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
    host.innerHTML = '<p class="lc-kicker">More</p><h1>LHA vs market rent</h1><p class="lc-purpose">Open-market rent minus the Local Housing Allowance. ' + table.ranked.length + ' published comparisons, shown largest first and smallest first. Nothing here is estimated.</p>' +
      (top && low ? '<p>Biggest is ' + esc(top.area) + ' ' + esc(top.bedLabel.toLowerCase()) + ', ' + money(top.gap) + ' a month. Smallest is ' + esc(low.area) + ' ' + esc(low.bedLabel.toLowerCase()) + ', ' + money(low.gap) + ' a month.</p>' : '') +
      section('Biggest gaps', biggest) +
      section('Smallest gaps', smallest) +
      '<details class="ios-disc"><summary>Sizes with no market rent (' + table.missing.length + ')</summary><p>These are every other area and bedroom size. They are not given a gap.</p><ul>' + absent + '</ul><p>Open-market rent in this series is not published for a postcode district, a shared room, or a 4-bedroom home. Glasgow has no series here. A Manchester, Bristol or Cheltenham figure is the local authority, not the whole allowance area, except Lothian, where both figures are the same rental area.</p></details>' +
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
