/* Per-area buy box. Two halves: the lease on offer, and the home a tenant would occupy. */
(function (root) {
  'use strict';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const TAGS = {match: 'Matches buy box', partial: 'Partial', no: 'No'};
  const BLANK_LEASE = {length: 'Needs evidence', sevenNote: 'Lease length is not on file, so the 7 year rule is Needs evidence.', rentBasis: 'Needs evidence', manager: 'Needs evidence', programme: 'Needs evidence', start: 'Needs evidence', whoCanLet: '', councilRole: ''};
  const BLANK_HOME = {type: 'Needs evidence', beds: 'Needs evidence', boundary: 'Needs evidence', shops: 'Needs evidence', condition: 'Needs evidence', clustering: 'Needs evidence'};
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
    const lease = Object.assign({}, BLANK_LEASE, row.lease || {});
    const home = Object.assign({}, BLANK_HOME, row.accommodation || {});
    if (!row.accommodation && !row.lease) home.beds = (Number.isInteger(row.bedsMin) ? row.bedsMin : base.bedsMin || 3) + ' to ' + (Number.isInteger(row.bedsMax) ? row.bedsMax : base.bedsMax || 4) + ' on the Laurito base screen';
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
      openFields: row.openFields || [],
      districts: row.districts || [],
      partDistricts: row.partDistricts || [],
      zones: row.zones || null,
      qualifyingLease: row.qualifyingLease === true,
      requireAccessible: row.requireAccessible === true,
      priority: row.priority === true,
      pipelineTarget: row.pipelineTarget || 0,
      programmeHomes: row.programmeHomes || 0,
      accessibleNeed: row.accessibleNeed || 0,
      lease: lease,
      accommodation: home
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
  function accessibleHome(text) {
    return /\b(accessib\w*|adapted|wheelchair|step[- ]free)\b/i.test(String(text || ''));
  }
  function districtOf(lot) {
    const blob = [lot && lot.postcode, lot && lot.address, lot && lot.title].filter(Boolean).join(' ');
    const match = String(blob).toUpperCase().match(/\bM90\b|\bM\d{1,2}\b/);
    return match ? match[0] : '';
  }
  function zoneOf(rule, district) {
    if (!rule.zones) return '';
    if (!district) return 'Not stated';
    const hits = [];
    Object.keys(rule.zones).forEach((name) => {
      const spec = rule.zones[name] || {};
      if ((spec.whole || []).indexOf(district) >= 0) hits.push({name: name, part: false});
      else if ((spec.part || []).indexOf(district) >= 0) hits.push({name: name, part: true});
    });
    if (!hits.length) return 'Outside';
    if (hits.length > 1 || hits.some((hit) => hit.part)) return 'Part of a zone';
    return hits[0].name;
  }
  function pack(tag, reason, extra) {
    const row = {tag: tag, label: TAGS[tag] || 'No', reason: reason};
    row.zone = extra && extra.zone || '';
    row.accessible = !!(extra && extra.accessible);
    row.pipeline = tag !== 'no';
    return row;
  }
  function leaseGate(rule, tag, reason, extra) {
    if (tag === 'no' || rule.qualifyingLease) return pack(tag, reason, extra);
    if (tag === 'match') return pack('partial', reason + ' Lease length is not on file, so this is not a full match.', extra);
    if (reason.indexOf('Lease length is not on file') < 0) return pack(tag, reason + ' Lease length is not on file, so this is not a full match.', extra);
    return pack(tag, reason, extra);
  }
  function classify(area, lot, source) {
    const rule = ruleFor(area, source);
    const text = textOf(lot);
    const beds = bedCounts(text);
    const adapted = accessibleHome(text);
    const address = String((lot && (lot.postcode || lot.address)) || '');
    const outside = rule.excludePlaces.find((place) => new RegExp('\\b' + place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(address));
    if (outside) return pack('no', 'Outside the buy box boundary (' + outside + ').', {accessible: adapted});
    if (!homeType(text)) return pack('no', 'Not a home in the buy box.', {accessible: adapted, zone: zoneOf(rule, districtOf(lot))});
    if (rule.requireAccessible && !adapted) return pack('no', 'Standard homes are outside this buy box. Only accessible or adapted homes are wanted.', {zone: zoneOf(rule, districtOf(lot))});
    const supported = rule.supportedMax > 0 && beds.some((n) => n >= rule.supportedMin && n <= rule.supportedMax);
    if (rule.excludeShared && sharedHome(text)) {
      if (supported) return leaseGate(rule, 'partial', '12 to 16 bed supported accommodation is considered case by case.', {accessible: adapted});
      return pack('no', 'Shared houses and HMOs are not in this buy box.', {accessible: adapted});
    }
    if (rule.districts.length) {
      const district = districtOf(lot);
      const zone = zoneOf(rule, district);
      const hasPostcode = /\b[A-Z]{1,2}\d/i.test([lot && lot.postcode, lot && lot.address].filter(Boolean).join(' '));
      const whole = rule.districts.indexOf(district) >= 0;
      const part = rule.partDistricts.indexOf(district) >= 0;
      const extra = {zone: zone, accessible: adapted};
      if (hasPostcode && !whole && !part) return pack('no', 'Outside the City of Manchester districts in the buy box.', extra);
      if (/\bhmo\b/i.test(text)) return pack('no', 'Not a house or flat in the City of Manchester buy box.', extra);
      if (beds.some((n) => n < rule.bedsMin || n > rule.bedsMax)) return pack('no', 'Bed count is outside 1 to 5.', extra);
      if (!beds.length) return leaseGate(rule, 'partial', district ? 'Bed count is not stated.' : 'Postcode district and bed count are not stated.', extra);
      if (!district) return leaseGate(rule, 'partial', 'Postcode district is not stated.', extra);
      if (part) return leaseGate(rule, 'partial', 'Only part of ' + district + ' is in the buy box.', extra);
      if (whole) return leaseGate(rule, 'match', district + ' is in the ' + (zone || 'buy box') + ' zone and the bed count is 1 to 5.', extra);
    }
    if (rule.priority || rule.requireAccessible) {
      const extra = {accessible: adapted, pipeline: true};
      if (rule.requireAccessible) return leaseGate(rule, 'match', 'The listing says the home is accessible or adapted.', extra);
      return leaseGate(rule, 'match', 'The home can sit in the pipeline. This is not a completed purchase.', extra);
    }
    if (!beds.length) return leaseGate(rule, 'partial', 'Bed count is not stated.', {accessible: adapted});
    const priority = beds.filter((n) => rule.priorityBeds.indexOf(n) >= 0);
    const lower = beds.filter((n) => rule.lowerBeds.indexOf(n) >= 0);
    const outsideBeds = beds.filter((n) => n < rule.bedsMin || n > rule.bedsMax);
    const extra = {accessible: adapted};
    if (priority.length && !outsideBeds.length) {
      if (rule.requireReserved && !reserved(text)) return leaseGate(rule, 'partial', 'Bed count fits. Reserved matters are not stated.', extra);
      if (rule.requireReserved) return leaseGate(rule, 'match', 'Bed count fits and the listing says reserved matters have been discharged.', extra);
      return leaseGate(rule, 'match', 'The home fits the accommodation brief.', extra);
    }
    if (lower.length && !outsideBeds.length) return leaseGate(rule, 'partial', 'Bed count is in range but is lower priority.', extra);
    if (supported) return leaseGate(rule, 'partial', '12 to 16 bed supported accommodation is considered case by case.', extra);
    if (priority.length && outsideBeds.length) return leaseGate(rule, 'partial', 'Mixed bed count. Part of it is outside the buy box.', extra);
    return pack('no', 'Bed count is outside the buy box.', extra);
  }
  function counts(area, lots, source) {
    const tally = {match: 0, partial: 0, no: 0, pipeline: 0, accessible: 0};
    (lots || []).forEach((lot) => {
      const row = classify(area, lot, source);
      tally[row.tag] += 1;
      if (row.pipeline) tally.pipeline += 1;
      if (row.accessible) tally.accessible += 1;
    });
    return tally;
  }
  function half(title, help, pairs) {
    return '<div><h3>' + title + '</h3><p class="deal-help">' + help + '</p><ul class="bd-take">' + pairs.map((pair) => '<li><b>' + esc(pair[0]) + ':</b> ' + esc(pair[1]) + '</li>').join('') + '</ul></div>';
  }
  function cardHtml(area, tally, source) {
    const rule = ruleFor(area, source);
    const dateBits = [];
    if (rule.evidenceDate) dateBits.push('Evidence ' + ukDate(rule.evidenceDate));
    if (rule.issued) dateBits.push('Issued ' + ukDate(rule.issued));
    if (rule.due) dateBits.push('Responses due ' + ukDate(rule.due));
    const badge = rule.status === 'Evidenced' || rule.status === 'Live' ? 'evidenced' : (rule.status === 'Partially evidenced' || rule.status === 'Bidding' ? 'partial' : (rule.status === 'Awaiting response' ? 'waiting' : 'none'));
    const countsHtml = ['match', 'partial', 'no'].map((id) => '<button type="button" class="bd-tile" data-kind="buy" data-id="' + id + '"><span>' + TAGS[id] + '</span><b>' + ((tally && tally[id]) || 0) + '</b></button>').join('');
    const lease = rule.lease;
    const home = rule.accommodation;
    const leasePairs = [['Length', lease.length], ['7 year rule', lease.sevenNote], ['Rent basis', lease.rentBasis], ['Who manages', lease.manager], ['Programme', lease.programme], ['Start', lease.start]];
    if (lease.whoCanLet) leasePairs.push(['Who can grant it', lease.whoCanLet]);
    if (lease.councilRole) leasePairs.push(['Council role', lease.councilRole]);
    const homePairs = [['Type', home.type], ['Beds', home.beds], ['Boundary', home.boundary], ['Shops and transport', home.shops], ['Condition', home.condition], ['Clustering', home.clustering]];
    const pipeline = rule.pipelineTarget ? '<p class="deal-next">Pipeline target is indicative, about ' + rule.pipelineTarget + ' homes, not fixed. Accessible need is about ' + rule.accessibleNeed + ', which is 5% of ' + rule.programmeHomes + '.</p>' : '';
    const wants = rule.wants.length ? '<details class="bd-fold"><summary>Show the full brief</summary><ul class="bd-take">' + rule.wants.map((line) => '<li>' + esc(line) + '</li>').join('') + '</ul></details>' : '';
    const missing = rule.notSpecified.length ? '<p class="bd-src">Not specified: ' + esc(rule.notSpecified.join(', ')) + '.</p>' : '';
    const open = rule.openFields.length ? '<p class="bd-src">Still to answer: ' + esc(rule.openFields.join(', ')) + '.</p>' : '';
    return '<article class="bd-chart bd-buy"><div class="bd-buy-h"><h2>What we want in ' + esc(area) + '</h2><span class="bd-badges">' + (rule.priority ? '<span class="bd-badge partial">Priority area</span>' : '') + '<span class="bd-badge ' + badge + '">' + esc(rule.status) + '</span></span></div>'
      + '<p class="bd-src">' + esc(rule.source) + (dateBits.length ? '. ' + esc(dateBits.join('. ')) + '.' : '') + '</p>'
      + (rule.note ? '<p>' + esc(rule.note) + '</p>' : '')
      + pipeline
      + '<div class="deal-groups">'
      + half('The lease', 'What the council or operator will offer.', leasePairs)
      + half('The homes', 'What tenants will occupy.', homePairs)
      + '</div>'
      + wants + missing + open
      + '<div class="bd-buy-counts">' + countsHtml + '</div></article>';
  }

  root.BuyBox = Object.freeze({use, ukDate, ruleFor, classify, counts, cardHtml, TAGS, bedCounts, accessibleHome});
})(typeof globalThis !== 'undefined' ? globalThis : this);
