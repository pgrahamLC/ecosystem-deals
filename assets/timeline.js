/* Framework timeline. Public wording only. Dates come from the row or from frameworks.json. */
(function (root) {
  'use strict';
  const AREAS = ['Manchester', 'Glasgow', 'Edinburgh', 'Bristol', 'Cheltenham', 'Liverpool', 'Cheshire', 'Birmingham'];
  const REGION = {GM: ['Manchester'], BRS: ['Bristol'], GLOS: ['Cheltenham'], National: AREAS.slice()};
  let book = null;
  let frameworks = [];

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  }
  function clean(value) {
    const text = String(value == null ? '' : value).replace(/\u2014|\u2013/g, ',').replace(/;/g, ',');
    if (/£|@/.test(text)) return '';
    return text.trim();
  }
  function use(requirements, items) {
    book = requirements || null;
    frameworks = Array.isArray(items) ? items : ((items && items.items) || []);
    return book;
  }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function iso(year, month, day) { return year + '-' + pad(month) + '-' + pad(day); }
  function lastDay(year, month) { return iso(year, month, new Date(year, month, 0).getDate()); }
  function parseDate(value, role) {
    const text = String(value || '').trim();
    if (!text) return null;
    if (/ongoing|confirm|unpublish|approx|~|vanguard|\//i.test(text) && !/^\d{4}-\d{2}(?:-\d{2})?\b/.test(text)) return null;
    const full = text.match(/^(\d{4})-(\d{2})-(\d{2})\b/);
    if (full) return iso(+full[1], +full[2], +full[3]);
    const month = text.match(/^(\d{4})-(\d{2})\b/);
    if (month) return role === 'end' ? lastDay(+month[1], +month[2]) : iso(+month[1], +month[2], 1);
    if (/^\d{4}$/.test(text)) return role === 'end' ? text + '-12-31' : text + '-01-01';
    return null;
  }
  function addMonths(day, months) {
    const parts = String(day).split('-').map(Number);
    const date = new Date(parts[0], parts[1] - 1 + months, parts[2]);
    return iso(date.getFullYear(), date.getMonth() + 1, date.getDate());
  }
  function toneOf(status) {
    const text = String(status || '').toLowerCase();
    if (text === 'live' || text === 'open to join' || text.indexOf('live') === 0) return 'live';
    if (text === 'bidding') return 'bidding';
    if (text === 'planned' || text === 'forthcoming') return 'planned';
    if (text === 'closed') return 'ended';
    return 'unknown';
  }
  function areasFor(item) {
    const found = [];
    (item.regions || []).forEach((code) => (REGION[code] || []).forEach((area) => { if (found.indexOf(area) < 0) found.push(area); }));
    return found;
  }
  function rowFromRequirement(row) {
    const match = row.frameworkMatch ? frameworks.find((item) => String(item.name || '').indexOf(row.frameworkMatch) >= 0) : null;
    const start = row.start || (match ? parseDate(match.start, 'start') : null);
    const end = row.end || (match ? parseDate(match.end, 'end') : null);
    return {
      id: row.id,
      name: clean(row.name),
      areas: row.areas || [],
      tone: toneOf(row.status),
      status: row.status,
      start: start,
      end: end,
      award: row.award || null,
      awardLabel: clean(row.awardLabel || ''),
      breaks: Array.isArray(row.breaks) ? row.breaks.filter(Boolean) : [],
      primary: row.primary === true,
      accepting: row.status === 'live',
      source: 'requirements',
      leaseLength: clean(row.leaseLength || 'Needs evidence') || 'Needs evidence',
      leaseFlag: row.leaseFlag || 'unknown',
      leaseFlagText: clean(row.leaseFlagText || ''),
      rentBasis: clean(row.rentBasis || 'Needs evidence') || 'Needs evidence',
      manager: clean(row.manager || 'Needs evidence') || 'Needs evidence',
      programme: clean(row.programme || 'Needs evidence') || 'Needs evidence',
      propertyType: clean(row.propertyType || 'Needs evidence') || 'Needs evidence',
      unitsLabel: clean(row.unitsLabel || 'Not stated') || 'Not stated',
      block: clean(row.block || 'Not stated') || 'Not stated',
      note: clean(row.note || ''),
      startLabel: clean(row.startLabel || '')
    };
  }
  function rowFromFramework(item, index) {
    const name = clean(item.name);
    if (!name) return null;
    const claimed = (book && book.rows || []).some((row) => row.frameworkMatch && name.indexOf(row.frameworkMatch) >= 0);
    if (claimed) return null;
    return {
      id: 'fw-' + index,
      name: name,
      areas: areasFor(item),
      tone: toneOf(item.status_n || item.status),
      status: clean(item.status_n || item.status || 'Unknown') || 'Unknown',
      start: parseDate(item.start, 'start'),
      end: parseDate(item.end, 'end'),
      award: null,
      awardLabel: '',
      breaks: [],
      primary: false,
      accepting: String(item.status_n || '').toLowerCase() === 'open to join',
      source: 'frameworks',
      leaseLength: 'Needs evidence',
      leaseFlag: 'unknown',
      leaseFlagText: 'Lease length is not repeated here. The 7 year rule still applies.',
      rentBasis: 'Needs evidence',
      manager: 'Needs evidence',
      programme: 'See the frameworks file. Figures are not shown here.',
      propertyType: clean(item.accom_type || '') || 'Needs evidence',
      unitsLabel: 'Not stated',
      block: 'Not stated',
      note: 'Dates come from the frameworks file. Prices and contacts are not shown.',
      startLabel: ''
    };
  }
  function covers(row, area) {
    if (!area) return true;
    return (row.areas || []).indexOf(area) >= 0;
  }
  function build(options) {
    const today = (options && options.today) || '2026-11-18';
    const area = options && options.area || '';
    const horizon = addMonths(today, 12);
    const rows = []
      .concat((book && book.rows || []).map(rowFromRequirement))
      .concat(frameworks.map(rowFromFramework).filter(Boolean))
      .filter((row) => covers(row, area) && (row.tone === 'live' || row.tone === 'bidding' || row.tone === 'planned'));
    const openNow = rows.filter((row) => row.accepting && (!row.start || row.start <= today) && (!row.end || row.end >= today)).length;
    const opening = rows.filter((row) => {
      const when = [row.start, row.award].filter(Boolean);
      return when.some((day) => day > today && day <= horizon) && !(row.tone === 'live' && row.start && row.start <= today);
    }).length;
    return {today: today, area: area, rows: rows, openNow: openNow, opening: opening, rule: (book && book.leaseRule) || ''};
  }
  function scale(rows, today) {
    let min = addMonths(today, -24);
    let max = addMonths(today, 96);
    rows.forEach((row) => [row.start, row.end, row.award].concat(row.breaks).forEach((day) => {
      if (!day) return;
      if (day < min) min = day;
      if (day > max) max = day;
    }));
    min = addMonths(min, -3);
    max = addMonths(max, 3);
    const a = new Date(min + 'T00:00:00Z').getTime();
    const b = new Date(max + 'T00:00:00Z').getTime();
    const span = Math.max(1, b - a);
    const pct = (day) => {
      const t = new Date(day + 'T00:00:00Z').getTime();
      return Math.max(0, Math.min(100, (t - a) / span * 100));
    };
    return {pct: pct};
  }
  function barHtml(row, axis) {
    const undated = !row.start && !row.end;
    const paint = row.tone + (row.tone === 'live' && !row.accepting ? ' closed' : '');
    let bar = '';
    if (undated) bar = '<span class="tl-bar dashed ' + paint + '" style="left:0;width:100%"></span>';
    else if (row.start && !row.end) {
      const left = axis.pct(row.start);
      const now = axis.pct(axis.today);
      if (row.start <= axis.today) bar = '<span class="tl-bar ' + paint + '" style="left:' + left + '%;width:' + Math.max(1.5, now - left) + '%"></span><span class="tl-bar dashed ' + paint + '" style="left:' + now + '%;width:' + Math.max(2, 100 - now) + '%"></span>';
      else bar = '<span class="tl-bar dashed ' + paint + '" style="left:' + left + '%;width:4%"></span>';
    } else if (!row.start && row.end) {
      bar = '<span class="tl-bar dashed ' + paint + '" style="left:0;width:' + axis.pct(row.end) + '%"></span>';
    } else {
      const left = axis.pct(row.start);
      const width = Math.max(1.5, axis.pct(row.end) - left);
      bar = '<span class="tl-bar ' + paint + '" style="left:' + left + '%;width:' + width + '%"></span>';
    }
    const award = row.award ? '<i class="tl-award" style="left:' + axis.pct(row.award) + '%" title="' + esc(row.awardLabel || 'Award') + '"></i>' : '';
    const breaks = (row.breaks || []).map((day) => '<i class="tl-break" style="left:' + axis.pct(day) + '%" title="Break"></i>').join('');
    const hint = undated ? 'Date not yet recorded' : ((row.start || 'Start not recorded') + ' to ' + (row.end || 'end not yet recorded'));
    return '<button type="button" class="tl-row" data-kind="framework" data-id="' + esc(row.id) + '" data-act="framework" title="' + esc(hint) + '"><span>' + esc(row.name) + '</span><b class="tl-track">' + bar + award + breaks + '<i class="tl-today" style="left:' + axis.pct(axis.today) + '%"></i></b></button>';
  }
  function html(options) {
    const view = build(options);
    const axis = scale(view.rows, view.today);
    axis.today = view.today;
    const bars = view.rows.map((row) => barHtml(row, axis)).join('');
    const empty = view.rows.length ? '' : '<p>No contract is recorded for this filter.</p>';
    return '<article class="bd-chart tl"><h2>Contracts you could use</h2><p class="deal-next">' + view.openNow + ' contracts open for assets now, ' + view.opening + ' opening in the next 12 months.</p><p class="deal-help">' + esc(view.rule) + ' Solid green can take homes now. A hatched green bar is live but closed to new joiners, so it is not counted. Amber is bidding. Red is planned. A diamond is an award. A dashed bar means the date is not yet recorded.</p><div class="tl-list">' + bars + '</div>' + empty + '</article>';
  }
  function find(id) {
    return build({today: '2026-11-18'}).rows.find((row) => row.id === id) || null;
  }
  function detail(id, today) {
    const row = build({today: today || '2026-11-18'}).rows.find((item) => item.id === id);
    if (!row) return '';
    const line = (label, value) => '<li><b>' + label + ':</b> ' + esc(value || 'Needs evidence') + '</li>';
    return '<div class="tl-detail"><p class="bd-kicker">The lease</p><h2>' + esc(row.name) + '</h2><ul class="bd-take">'
      + line('Length', row.leaseLength)
      + line('7 year rule', row.leaseFlagText)
      + line('Rent basis', row.rentBasis)
      + line('Who manages', row.manager)
      + line('Programme', row.programme)
      + line('Homes', row.propertyType)
      + line('Dates', row.startLabel || ((row.start || 'Date not yet recorded') + ' to ' + (row.end || 'end not yet recorded')))
      + '</ul>' + (row.note ? '<p>' + esc(row.note) + '</p>' : '') + '</div>';
  }

  root.Timeline = Object.freeze({use, build, html, detail, find, parseDate, clean, AREAS});
})(typeof globalThis !== 'undefined' ? globalThis : this);
