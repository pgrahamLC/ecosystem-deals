/* Per-area buy box. Public rules only. No rates, names, or contract terms. */
(function (root) {
  'use strict';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const TAGS = {match: 'Matches buy box', partial: 'Partial', no: 'No'};
  let book = null;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  }
  function use(next) {
    book = next || null;
    return book;
  }
  function ukDate(iso) {
    const parts = String(iso || '').split('-').map(Number);
    if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return '';
    return parts[2] + ' ' + MONTHS[parts[1] - 1] + ' ' + parts[0];
  }
  function ruleFor(area, source) {
    const data = source || book;
    const base = (data && data.base) || {};
    const row = (data && data.areas && data.areas[area]) || {};
    return {
      status: row.status || 'No RFI yet',
      source: row.source || 'Laurito base criteria',
      evidenceDate: row.evidenceDate || '',
      issued: row.issued || '',
      due: row.due || '',
      note: row.note || (row.status === 'No RFI yet' || !row.status ? 'No RFI yet.' : ''),
      summary: base.summary || '',
      bedsMin: Number.isInteger(row.bedsMin) ? row.bedsMin : (Number.isInteger(base.bedsMin) ? base.bedsMin : 3),
      bedsMax: Number.isInteger(row.bedsMax) ? row.bedsMax : (Number.isInteger(base.bedsMax) ? base.bedsMax : 4),
      priorityBeds: row.priorityBeds || base.priorityBeds || [3, 4],
      lowerBeds: row.lowerBeds || base.lowerBeds || [],
      requireReserved: row.requireReserved != null ? row.requireReserved === true : base.requireReserved !== false,
      excludeShared: row.excludeShared === true,
      supportedMin: Number.isInteger(row.supportedMin) ? row.supportedMin : 0,
      supportedMax: Number.isInteger(row.supportedMax) ? row.supportedMax : 0,
      excludePlaces: row.excludePlaces || [],
      wants: row.wants || [],
      notSpecified: row.notSpecified || [],
      openFields: row.openFields || []
    };
  }
  function textOf(lot) {
    if (!lot) return '';
    if (lot._text) return String(lot._text);
    return ['title', 'address', 'lot_type', 'property_type', 'residential_subtype', 'grade_evidence'].map((key) => lot[key] ? String(lot[key]) : '').join(' ');
  }
  function bedCounts(text) {
    const found = new Set();
    const re = /\b(1[0-6]|[1-9])\s*-?\s*bed(?:room)?s?\b/gi;
    let match;
    while ((match = re.exec(String(text || '')))) found.add(Number(match[1]));
    return Array.from(found).sort((a, b) => a - b);
  }
  function reserved(text) {
    return /reserved matters[\s\S]{0,80}discharg|discharg[\s\S]{0,80}reserved matters/i.test(String(text || ''));
  }
  function sharedHome(text) {
    return /\bhmo\b|shared house|house share|home share|bedsit/i.test(String(text || ''));
  }
  function homeType(text) {
    return !/\b(commercial|office|retail|industrial|garage|land|development plot)\b/i.test(String(text || ''));
  }
  function result(tag, reason) {
    return {tag, label: TAGS[tag] || 'No', reason};
  }
  function classify(area, lot, source) {
    const rule = ruleFor(area, source);
    const text = textOf(lot);
    const beds = bedCounts(text);
    const address = String((lot && lot.address) || '');
    const outside = rule.excludePlaces.find((place) => new RegExp('\\b' + place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(address));
    if (outside) return result('no', 'Outside the buy box boundary (' + outside + ').');
    const supported = rule.supportedMax > 0 && beds.some((n) => n >= rule.supportedMin && n <= rule.supportedMax);
    if (rule.excludeShared && sharedHome(text)) {
      if (supported) return result('partial', '12 to 16 bed supported accommodation is considered case by case.');
      return result('no', 'Shared houses and HMOs are not in this buy box.');
    }
    if (!beds.length) {
      if (!homeType(text)) return result('no', 'Not a home in the buy box.');
      return result('partial', 'Bed count is not stated.');
    }
    const priority = beds.filter((n) => rule.priorityBeds.indexOf(n) >= 0);
    const lower = beds.filter((n) => rule.lowerBeds.indexOf(n) >= 0);
    const outsideBeds = beds.filter((n) => n < rule.bedsMin || n > rule.bedsMax);
    if (priority.length && !outsideBeds.length) {
      if (rule.requireReserved && !reserved(text)) return result('partial', 'Bed count fits. Reserved matters are not stated.');
      if (rule.requireReserved) return result('match', 'Bed count fits and the listing says reserved matters have been discharged.');
      return result('match', 'Fits the buy box. ' + (reserved(text) ? 'The listing says reserved matters have been discharged.' : 'Reserved matters are not stated on the listing.'));
    }
    if (lower.length && !outsideBeds.length) return result('partial', 'Bed count is in range but is lower priority.');
    if (supported) return result('partial', '12 to 16 bed supported accommodation is considered case by case.');
    if (priority.length && outsideBeds.length) return result('partial', 'Mixed bed count. Part of it is outside the buy box.');
    return result('no', 'Bed count is outside the buy box.');
  }
  function counts(area, lots, source) {
    const tally = {match: 0, partial: 0, no: 0};
    (lots || []).forEach((lot) => { tally[classify(area, lot, source).tag] += 1; });
    return tally;
  }
  function cardHtml(area, tally, source) {
    const rule = ruleFor(area, source);
    const dateBits = [];
    if (rule.evidenceDate) dateBits.push('Evidence ' + ukDate(rule.evidenceDate));
    if (rule.issued) dateBits.push('Issued ' + ukDate(rule.issued));
    if (rule.due) dateBits.push('Responses due ' + ukDate(rule.due));
    const badge = rule.status === 'Evidenced' ? 'evidenced' : (rule.status === 'Awaiting response' ? 'waiting' : 'none');
    const countsHtml = ['match', 'partial', 'no'].map((id) => '<button type="button" class="bd-tile" data-kind="buy" data-id="' + id + '"><span>' + TAGS[id] + '</span><b>' + ((tally && tally[id]) || 0) + '</b></button>').join('');
    const wants = rule.wants.length ? '<ul class="bd-take">' + rule.wants.map((line) => '<li>' + esc(line) + '</li>').join('') + '</ul>' : '';
    const missing = rule.notSpecified.length ? '<p class="bd-src">Not specified: ' + esc(rule.notSpecified.join(', ')) + '.</p>' : '';
    const open = rule.openFields.length ? '<p class="bd-src">Still to answer: ' + esc(rule.openFields.join(', ')) + '.</p>' : '';
    return '<article class="bd-chart bd-buy"><div class="bd-buy-h"><h2>What we want in ' + esc(area) + '</h2><span class="bd-badge ' + badge + '">' + esc(rule.status) + '</span></div>'
      + '<p class="bd-src">' + esc(rule.source) + (dateBits.length ? '. ' + esc(dateBits.join('. ')) + '.' : '') + '</p>'
      + (rule.note ? '<p>' + esc(rule.note) + '</p>' : '')
      + '<p>' + esc(rule.summary) + '</p>'
      + wants + missing + open
      + '<div class="bd-buy-counts">' + countsHtml + '</div></article>';
  }

  root.BuyBox = Object.freeze({use, ukDate, ruleFor, classify, counts, cardHtml, TAGS, bedCounts});
})(typeof globalThis !== 'undefined' ? globalThis : this);
