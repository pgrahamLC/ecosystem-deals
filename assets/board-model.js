/* Figures for the one-screen board. Blank stays blank. No DOM. */
(function (root) {
  'use strict';

  const AREAS = Object.freeze(['Manchester', 'Glasgow', 'Edinburgh', 'Bristol', 'Cheltenham', 'Liverpool', 'Cheshire', 'Birmingham']);
  const BEDS = Object.freeze([
    ['1', '1 bed'],
    ['2', '2 bed'],
    ['3', '3 bed'],
    ['4', '4 bed'],
    ['5+', '5 bed or more'],
    ['Mixed', 'Mixed'],
    ['Not stated', 'Not stated']
  ]);
  const BANDS = Object.freeze([
    ['under-100', 'Under £100k', 0, 100000],
    ['100-200', '£100k to £200k', 100000, 200000],
    ['200-350', '£200k to £350k', 200000, 350000],
    ['350-500', '£350k to £500k', 350000, 500000],
    ['over-500', '£500k and over', 500000, Infinity]
  ]);
  const CHESHIRE = Object.freeze(['Cheshire East', 'Cheshire West and Chester']);

  function londonDay(date) {
    return new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit'}).format(date || new Date());
  }
  function currentLot(lot, today) {
    if (root.lcCurrentLot && root.lcCurrentLot.currentLot) return root.lcCurrentLot.currentLot(lot, today);
    if (!lot || lot.stale === true) return false;
    const status = String(lot.status || '').toLowerCase();
    const words = String(lot.sale_status || lot.status || '').toLowerCase();
    if (/\b(sold|unsold|withdrawn|passed)\b/.test(words) || /past auction/.test(words)) return false;
    const day = String(lot.auction_date || '').slice(0, 10);
    const now = today || londonDay();
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day < now) return false;
    if (status) return status === 'upcoming' || status === 'available';
    return true;
  }
  function townOf(value) {
    const raw = String(value || '').trim();
    if (/^(city of bristol|bristol, city of)$/i.test(raw)) return 'Bristol';
    if (/^(city of edinburgh|edinburgh, city of)$/i.test(raw)) return 'Edinburgh';
    return AREAS.find((area) => area.toLowerCase() === raw.toLowerCase()) || '';
  }
  function money(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'Not yet recorded';
    return new Intl.NumberFormat('en-GB', {style: 'currency', currency: 'GBP', maximumFractionDigits: 0}).format(Math.round(value));
  }
  function median(values) {
    const nums = values.filter((value) => typeof value === 'number' && Number.isFinite(value)).slice().sort((a, b) => a - b);
    if (!nums.length) return null;
    const mid = Math.floor(nums.length / 2);
    return nums.length % 2 ? nums[mid] : Math.round((nums[mid - 1] + nums[mid]) / 2);
  }
  function bedCounts(text) {
    const found = new Set();
    const re = /\b(10|[1-9])\s*-?\s*bed(?:room)?s?\b/gi;
    let match;
    while ((match = re.exec(String(text || '')))) found.add(Number(match[1]));
    return Array.from(found).sort((a, b) => a - b);
  }
  function bedsOf(lot) {
    const text = ['title', 'address', 'lot_type', 'property_type', 'residential_subtype', 'grade_evidence'].map((key) => lot && lot[key] ? String(lot[key]) : '').join(' ');
    const found = bedCounts(text);
    if (!found.length) return 'Not stated';
    if (found.length > 1) return 'Mixed';
    return found[0] >= 5 ? '5+' : String(found[0]);
  }
  function typeOf(lot) {
    const source = String((lot && (lot.residential_subtype || lot.property_type || lot.lot_type)) || '').toLowerCase();
    if (!source) return 'Not stated';
    if (/commercial|office|retail|industrial|land/.test(source)) return 'Commercial';
    if (/hmo/.test(source)) return 'HMO';
    if (/block|portfolio/.test(source)) return 'Block';
    if (/flat|maisonette|apartment/.test(source)) return 'Flat';
    if (/house|bungalow|cottage|terrace|detached|semi/.test(source)) return 'House';
    if (/mixed/.test(source)) return 'Mixed-use';
    if (/develop/.test(source)) return 'Development';
    return 'Not stated';
  }
  function bandOf(price) {
    if (!(price > 0)) return 'unpublished';
    const band = BANDS.find((row) => price >= row[2] && price < row[3]);
    return band ? band[0] : 'over-500';
  }
  function monthOf(iso) {
    const day = String(iso || '').slice(0, 7);
    return /^\d{4}-\d{2}$/.test(day) ? day : '';
  }
  function monthLabel(id) {
    if (id === 'unpublished') return 'Date not published';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const parts = id.split('-');
    return months[Number(parts[1]) - 1] + ' ' + parts[0];
  }
  function countBy(rows, key) {
    const map = new Map();
    rows.forEach((row) => map.set(row[key], (map.get(row[key]) || 0) + 1));
    return map;
  }
  function gap(ons, lha) {
    if (!(ons > 0) || !(lha > 0)) return null;
    return Math.round((ons - lha) * 100) / 100;
  }
  function rentRows(book, area) {
    const omr = book && book.omr && book.omr.areas;
    const lha = book && book.lha && book.lha.areas;
    if (area === 'Cheshire') {
      return CHESHIRE.map((name) => {
        const market = omr && omr[name] && omr[name].monthly;
        return {
          id: name,
          label: name,
          ons3: market && market['3'] > 0 ? market['3'] : null,
          lha3: null,
          gap3: null,
          note: 'No single Local Housing Allowance is applied.'
        };
      });
    }
    const market = omr && omr[area] && omr[area].monthly;
    const allowance = lha && lha[area] && lha[area].monthly;
    return ['1', '2', '3'].map((bed) => {
      const ons = market && market[bed] > 0 ? market[bed] : null;
      const rate = allowance && allowance[bed] > 0 ? allowance[bed] : null;
      return {id: bed, label: bed + ' bed', ons, lha: rate, gap: gap(ons, rate), note: ''};
    }).concat([{
      id: '4',
      label: '4 bed',
      ons: market && market['4plus'] > 0 ? market['4plus'] : null,
      lha: allowance && allowance['4'] > 0 ? allowance['4'] : null,
      gap: null,
      note: 'ONS is 4 or more bedrooms. It is not compared with the 4 bed allowance.'
    }]);
  }
  function compsFor(summary, area, today) {
    const place = summary && summary.places && summary.places[area];
    if (!place || !place.postcode_districts) return {year: '', rows: []};
    const yearNow = String(today || londonDay()).slice(0, 4);
    const tally = {};
    Object.entries(place.postcode_districts).forEach(([district, years]) => {
      Object.keys(years || {}).forEach((year) => {
        const stat = years[year] && years[year].all;
        if (stat && stat.n >= 5 && typeof stat.median === 'number') tally[year] = (tally[year] || 0) + 1;
      });
    });
    const years = Object.keys(tally).sort();
    if (!years.length) return {year: '', rows: []};
    let year = years[years.length - 1];
    if (year === yearNow && years.length > 1 && tally[years[years.length - 2]] > tally[year]) year = years[years.length - 2];
    const rows = Object.entries(place.postcode_districts).map(([district, yearsNode]) => {
      const stat = yearsNode && yearsNode[year] && yearsNode[year].all;
      if (!stat || stat.n < 5 || typeof stat.median !== 'number') return null;
      return {id: district, label: district, median: stat.median, n: stat.n};
    }).filter(Boolean).sort((a, b) => a.median - b.median);
    return {year, rows};
  }
  function shapeLot(lot) {
    const guide = lot.guide_price > 0 ? lot.guide_price : null;
    return {
      id: String(lot.id || lot.source_url || lot.address || ''),
      address: lot.address || lot.title || 'Address not recorded',
      town: townOf(lot.town || lot.city),
      type: typeOf(lot),
      beds: bedsOf(lot),
      guide,
      band: bandOf(guide),
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(lot.auction_date || '').slice(0, 10)) ? String(lot.auction_date).slice(0, 10) : '',
      month: monthOf(lot.auction_date) || 'unpublished',
      url: /^https?:\/\//.test(String(lot.source_url || '')) ? lot.source_url : ''
    };
  }
  function build(input) {
    const today = input && input.today || londonDay();
    const area = AREAS.includes(input && input.area) ? input.area : 'Manchester';
    const lots = ((input && input.lots) || []).filter((lot) => currentLot(lot, today) && townOf(lot.town || lot.city) === area).map(shapeLot);
    const guides = lots.map((lot) => lot.guide).filter((value) => value != null);
    const typeCounts = countBy(lots, 'type');
    const bedCountsMap = countBy(lots, 'beds');
    const bandCounts = countBy(lots, 'band');
    const monthCounts = countBy(lots, 'month');
    const types = [...typeCounts.entries()].map(([id, count]) => ({id, label: id, count})).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    const beds = BEDS.map(([id, label]) => ({id, label, count: bedCountsMap.get(id) || 0})).filter((row) => row.count);
    const prices = BANDS.map(([id, label]) => ({id, label, count: bandCounts.get(id) || 0})).filter((row) => row.count);
    if (bandCounts.get('unpublished')) prices.push({id: 'unpublished', label: 'Guide not published', count: bandCounts.get('unpublished')});
    const calendar = [...monthCounts.entries()].map(([id, count]) => ({id, label: monthLabel(id), count})).sort((a, b) => a.id === 'unpublished' ? 1 : b.id === 'unpublished' ? -1 : a.id < b.id ? -1 : 1);
    const rents = rentRows(input && input.rents, area);
    const comps = compsFor(input && input.comps, area, today);
    const three = rents.find((row) => row.id === '3') || null;
    const stated = lots.filter((lot) => lot.beds === '3' || lot.beds === '4').length;
    const unstated = lots.filter((lot) => lot.beds === 'Not stated').length;
    const takeaways = [];
    takeaways.push(lots.length
      ? lots.length + ' current lot' + (lots.length === 1 ? '' : 's') + ' in ' + area + '. ' + (guides.length ? 'Median published guide ' + money(median(guides)) + ' across ' + guides.length + ' lot' + (guides.length === 1 ? '' : 's') + '.' : 'No guide price is published.')
      : 'No current lots are loaded for ' + area + '.');
    if (area === 'Cheshire') takeaways.push('Cheshire has more than one allowance area, so no single rent gap is shown.');
    else if (three && three.gap != null) takeaways.push('ONS 3 bed rent is ' + money(three.ons) + ' a month. The allowance is ' + money(three.lha) + '. The gap is ' + money(three.gap) + ' a month.');
    else takeaways.push('The 3 bed rent gap is not yet recorded.');
    if (!comps.rows.length) takeaways.push('Land Registry sold prices are not in the file for ' + area + '.');
    else takeaways.push(stated
      ? stated + ' current lot' + (stated === 1 ? '' : 's') + ' state 3 or 4 bed. ' + unstated + ' do not state a bed count.'
      : 'No current lot states a 3 or 4 bed count.');
    return {
      today,
      area,
      areas: AREAS.slice(),
      lots,
      medianGuide: median(guides),
      guideCount: guides.length,
      types,
      beds,
      prices,
      calendar,
      rents,
      comps,
      onsMonth: (input && input.rents && input.rents.omr && input.rents.omr.month) || '',
      takeaways: takeaways.slice(0, 3)
    };
  }
  function matches(screen, drill) {
    if (!drill || !drill.kind || drill.kind === 'all' || !drill.id) return screen.lots;
    return screen.lots.filter((lot) => {
      if (drill.kind === 'type') return lot.type === drill.id;
      if (drill.kind === 'beds') return lot.beds === drill.id;
      if (drill.kind === 'price') return lot.band === drill.id;
      if (drill.kind === 'month') return lot.month === drill.id;
      return true;
    });
  }

  root.BoardModel = Object.freeze({
    AREAS, BEDS, BANDS, londonDay, currentLot, townOf, money, median, bedCounts, bedsOf, typeOf, bandOf, build, matches, compsFor, rentRows
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
