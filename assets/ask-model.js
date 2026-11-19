/* Ask Deals: answers from the files already on this site. No estimates, no invented figures. */
(function (root) {
  'use strict';

  const DISCLAIMER = 'Screening research, not an investment recommendation or credit approval.';
  const AREAS = [
    ['Manchester', /\bmanchester\b|\bgm\b/],
    ['Liverpool', /\bliverpool\b|\bmerseyside\b/],
    ['Cheshire', /\bcheshire\b/],
    ['Birmingham', /\bbirmingham\b|\bbrum\b/],
    ['Bristol', /\bbristol\b/],
    ['Cheltenham', /\bcheltenham\b|\bgloucester/],
    ['Edinburgh', /\bedinburgh\b|\blothian\b/],
    ['Glasgow', /\bglasgow\b/]
  ];
  const TABS = [
    ['board', 'Board', 'One area at a time: lots, rent gap, contracts, pipeline and agents.'],
    ['assets', 'Find', 'Where to look, area by area.'],
    ['distress', 'Leads', 'Who has to sell, in A, B and C bands.'],
    ['deal', 'Deal', 'Test one deal against the 14 hurdles.'],
    ['entry', 'Go / No-Go', 'The market entry checklist for an area.'],
    ['comps', 'Comps', 'Sold prices and rent evidence.'],
    ['map', 'Map', 'One town at a time.'],
    ['valuation', 'Local OMV / LHA', 'Local sold evidence against the allowance.'],
    ['accom', 'Demand', 'Published temporary accommodation and asylum figures.'],
    ['auctions', 'Auctions', 'The live residential auction list.']
  ];
  const HURDLES = [
    'Return attribution', 'Unlevered IRR', 'Yield on cost and profit on cost', 'Levered IRR, equity multiple and post tax',
    'Net returns', 'Peak equity, payback and cash on cash', 'Leverage spread', 'LTV and LTC', 'Interest cover',
    'Refinance sensitivity', 'Break even exit yield', 'Base, downside and upside', 'Operator rent cover', 'Unexpired term at exit'
  ];
  const PRICE_CITY = {Manchester: 'Manchester', Bristol: 'City Of Bristol', Cheltenham: 'Cheltenham'};
  const DEMAND_CITY = {Manchester: 'Manchester', Bristol: 'City Of Bristol', Cheltenham: 'Cheltenham', Edinburgh: 'Edinburgh'};

  function money(value) {
    if (value == null || !Number.isFinite(Number(value))) return 'not recorded';
    return '£' + Math.round(Number(value)).toLocaleString('en-GB');
  }
  function count(value) {
    return Number(value).toLocaleString('en-GB');
  }
  function pack(text, citations, actions, trace) {
    return {text: String(text).replace(/[—–]/g, ', '), citations: citations || [], actions: actions || [], trace: trace || [], disclaimer: DISCLAIMER};
  }
  function areaFrom(question) {
    const low = String(question || '').toLowerCase();
    const hit = AREAS.find((pair) => pair[1].test(low));
    return hit ? hit[0] : '';
  }
  function bedsFrom(text) {
    const match = String(text || '').match(/\b([1-9])\s*[-\s]?bed(?:room)?s?\b/i);
    return match ? Number(match[1]) : null;
  }
  function priceCap(question) {
    const match = String(question || '').toLowerCase().match(/(?:under|below|less than|up to|max(?:imum)?(?: of)?)\s*£?\s*([\d,.]+)\s*(k|m|million|thousand)?/);
    if (!match) return null;
    let value = Number(match[1].replace(/,/g, ''));
    if (!Number.isFinite(value)) return null;
    if (/^k|thousand/.test(match[2] || '')) value *= 1000;
    if (/^m/.test(match[2] || '')) value *= 1000000;
    return value;
  }
  // Same rule as the Board: only a numeric guide on the lot counts. Guide text is not parsed.
  function guideOf(lot) {
    return lot && Number(lot.guide_price) > 0 ? Number(lot.guide_price) : null;
  }
  function typeFrom(question) {
    const low = String(question || '').toLowerCase();
    if (/\bhmos?\b/.test(low)) return 'HMO';
    if (/\bflats?\b|\bapartments?\b/.test(low)) return 'Flats';
    if (/\bhouses?\b/.test(low)) return 'Houses';
    if (/\bportfolios?\b/.test(low)) return 'Portfolios';
    if (/\bcommercial\b/.test(low)) return 'Commercial';
    return '';
  }
  function median(values) {
    const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    if (!sorted.length) return null;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }
  function lotLine(lot) {
    const guide = guideOf(lot);
    const day = /^\d{4}-\d{2}-\d{2}/.test(String(lot.auction_date || '')) ? ', auction ' + String(lot.auction_date).slice(0, 10) : '';
    return String(lot.address || lot.title || 'Unnamed lot').trim() + ' (' + (lot.city || 'area not stated') + '): guide ' + (guide ? money(guide) : 'not published') + day + '. Source: ' + (lot.source || 'not stated') + '.';
  }
  function citeLot(lot) {
    return {label: String(lot.address || lot.title || 'Lot').trim().slice(0, 42), href: lot.source_url || ''};
  }

  function answerLots(question, ctx, trace) {
    const lots = ctx.lots || [];
    const area = areaFrom(question);
    const beds = bedsFrom(question);
    const cap = priceCap(question);
    const type = typeFrom(question);
    let rows = lots.slice();
    const used = [];
    if (area) { rows = rows.filter((lot) => lot.city === area); used.push(area); }
    if (type) { rows = rows.filter((lot) => lot.residential_subtype === type); used.push(type.toLowerCase()); }
    if (beds) { rows = rows.filter((lot) => bedsFrom(lot.title || lot.address) === beds); used.push(beds + ' bed, where the listing states it'); }
    if (cap) { rows = rows.filter((lot) => { const guide = guideOf(lot); return guide != null && guide <= cap; }); used.push('guide at or under ' + money(cap)); }
    trace.push('search_current_lots');
    const guides = rows.map(guideOf).filter((value) => value != null);
    const mid = median(guides);
    const head = count(rows.length) + (rows.length === 1 ? ' current lot' : ' current lots') + (used.length ? ' for ' + used.join(', ') : ' across all areas') + '. ' +
      (guides.length ? 'Median guide ' + money(mid) + ' from the ' + count(guides.length) + ' that publish one.' : 'None publish a guide price.');
    const wantList = /\b(cheap|lowest|list|show|which|what)\b/.test(question.toLowerCase()) || rows.length <= 5;
    const shown = wantList ? rows.filter((lot) => guideOf(lot) != null).sort((a, b) => guideOf(a) - guideOf(b)).slice(0, 5) : [];
    const stamp = ctx.lotsUpdated ? '\nLots file last updated ' + String(ctx.lotsUpdated).slice(0, 10) + '.' : '';
    const note = '\nA guide price is not a sale price. Sold, unsold, withdrawn and past lots are left out.';
    return pack(head + (shown.length ? '\nLowest guides:\n' + shown.map((lot, index) => (index + 1) + '. ' + lotLine(lot)).join('\n') : '') + stamp + note,
      shown.map(citeLot).filter((cite) => cite.href), [{type: 'navigate', view: 'auctions', label: 'Auctions'}], trace);
  }

  function answerRentGap(question, ctx, trace) {
    const table = ctx.rentGap;
    trace.push('rent_gap');
    if (!table || !table.ranked) return pack('The rent comparison has not loaded, so no gap is shown.', [], [], trace);
    const area = areaFrom(question);
    const beds = bedsFrom(question);
    const shared = /\bshared\b|\broom\b/.test(question.toLowerCase());
    let rows = table.ranked.slice();
    if (area) rows = rows.filter((row) => row.area === area || (area === 'Cheshire' && /^Cheshire/.test(row.area)));
    if (beds) rows = rows.filter((row) => row.beds === String(beds));
    else if (shared) rows = rows.filter((row) => row.beds === 'shared');
    const basis = 'Gap is the ONS open market rent minus the Local Housing Allowance, per month. The allowance is a benefit cap, not an offered rent.';
    if (!rows.length) {
      const miss = (table.missing || []).find((row) => (!area || row.area === area) && (!beds || row.beds === String(beds)));
      return pack((area || 'That area') + (beds ? ', ' + beds + ' bed' : '') + ': no gap is calculated. ' + (miss && miss.reason ? miss.reason + '.' : 'One side of the comparison is not recorded.'), [], [], trace);
    }
    const lines = rows.slice(0, area && !beds ? 5 : (area ? 1 : 5)).map((row) => row.area + ', ' + row.bedLabel + ': market ' + money(row.omr) + ', allowance ' + money(row.lha) + ', gap ' + money(row.gap) + ' (' + (row.pct * 100).toFixed(1) + '%).');
    return pack((area ? '' : 'Widest gaps on file' + (beds ? ' for ' + beds + ' bed' : '') + ':\n') + lines.join('\n') + '\n' + basis, [], [{type: 'navigate', view: 'board', label: 'Board'}], trace);
  }

  function answerPrices(question, ctx, trace) {
    trace.push('sold_prices');
    const area = areaFrom(question);
    const book = ctx.prices;
    if (!book || !book.cities) return pack('The sold price file has not loaded.', [], [], trace);
    if (!area) return pack('Name an area. District sold medians on file cover Manchester, Bristol and Cheltenham. The Comps tab holds the full Land Registry cut.', [], [{type: 'navigate', view: 'comps', label: 'Comps'}], trace);
    const row = book.cities[PRICE_CITY[area]];
    if (!row) return pack('No city sold median is on file for ' + area + ' in this summary. Open Comps for the Land Registry cut by place and year.', [], [{type: 'navigate', view: 'comps', label: 'Comps'}], trace);
    return pack(area + ', sales from ' + row.from + ' to ' + row.to + ': median ' + money(row.all) + ' across ' + count(row.sales) + ' sales. Flats ' + money(row.flat) + ' (' + count(row.flat_n) + ' sales). Terraced ' + money(row.terr) + ' (' + count(row.terr_n) + ' sales).\nSource: HM Land Registry Price Paid Data, file dated ' + book.updated + '. A median is not a valuation.',
      [], [{type: 'navigate', view: 'comps', label: 'Comps'}], trace);
  }

  function answerContracts(question, ctx, trace) {
    trace.push('list_contracts');
    const area = areaFrom(question);
    let rows = (ctx.contracts || []).slice();
    if (area) rows = rows.filter((row) => row.city === area);
    if (!rows.length) return pack('No contract route is on file' + (area ? ' for ' + area : '') + '. A blank is unknown, not a no.', [], [{type: 'navigate', view: 'board', label: 'Board'}], trace);
    const lines = rows.slice(0, 6).map((row) => row.city + ': ' + row.title + '. Buyer: ' + row.buyer + '. Status: ' + row.status + '.');
    return pack(count(rows.length) + ' contract routes on file' + (area ? ' for ' + area : '') + '.\n' + lines.join('\n') + '\nA published route is not an offer of rent or a lease.',
      rows.slice(0, 6).map((row) => ({label: String(row.title).slice(0, 42), href: row.url || row.notice_url || ''})).filter((cite) => cite.href), [{type: 'navigate', view: 'board', label: 'Board'}], trace);
  }

  function answerDemand(question, ctx, trace) {
    trace.push('published_demand');
    const area = areaFrom(question);
    const book = ctx.demand;
    if (!book || !book.cities) return pack('The demand file has not loaded.', [], [], trace);
    if (!area) return pack('Name an area. Published demand figures on file cover Manchester, Bristol, Cheltenham and Edinburgh.', [], [{type: 'navigate', view: 'accom', label: 'Demand'}], trace);
    const city = book.cities[DEMAND_CITY[area]];
    if (!city || !city.stats) return pack('No published demand figures are on file for ' + area + '.', [], [{type: 'navigate', view: 'accom', label: 'Demand'}], trace);
    const stat = (key, label) => city.stats[key] && city.stats[key].value != null ? label + ': ' + count(city.stats[key].value) + ' (' + city.stats[key].period + ')' : label + ': not recorded';
    const lines = [stat('ta_total', 'Households in temporary accommodation'), stat('ta_with_children', 'With children'), stat('ta_bnb', 'In bed and breakfast'), stat('ta_out_of_area', 'Placed in another authority'), stat('asylum_total', 'Asylum seekers supported')];
    const cites = ['ta_total', 'asylum_total'].map((key) => city.stats[key] && city.stats[key].url ? {label: key === 'ta_total' ? 'Homelessness tables' : 'Asylum support tables', href: city.stats[key].url} : null).filter(Boolean);
    return pack(area + ', published figures.\n' + lines.join('\n') + '\nThese are official counts. They are not a lease, a contract or a promise of demand.', cites, [{type: 'navigate', view: 'accom', label: 'Demand'}], trace);
  }

  function answer(question, context) {
    const q = String(question || '').trim();
    const ctx = context || {};
    const trace = [];
    if (!q) return pack('Ask about current auction lots, the rent gap, sold prices, contracts, demand or the 14 hurdles.', [], [], ['none']);
    const low = q.toLowerCase();
    if (/\b(which tab|what tab|where (do|can|should)|what is on|tabs?\b.*\bfor)\b/.test(low) || /^(help|what can you do)\b/.test(low)) {
      trace.push('list_tabs');
      return pack(TABS.map((tab) => tab[1] + ': ' + tab[2]).join('\n'), [], TABS.slice(0, 6).map((tab) => ({type: 'navigate', view: tab[0], label: tab[1]})), trace);
    }
    if (/\bhurdles?\b|\bgates?\b|\b14\b/.test(low)) {
      trace.push('list_hurdles');
      return pack('A deal is tested against 14 hurdles. One fail stops the deal.\n' + HURDLES.map((name, index) => (index + 1) + '. ' + name).join('\n') + '\nEnter your own rent and costs on the Deal tab. I do not run a deal here and I do not waive a hurdle.', [], [{type: 'navigate', view: 'deal', label: 'Deal'}], trace);
    }
    if (/\b(rent gap|lha|local housing allowance|allowance|market rent|ons rent)\b/.test(low)) return answerRentGap(q, ctx, trace);
    if (/\b(temporary accommodation|\bta\b|asylum|homeless|demand)\b/.test(low)) return answerDemand(q, ctx, trace);
    if (/\b(contracts?|frameworks?|tenders?|dps|leasing scheme|council route)\b/.test(low)) return answerContracts(q, ctx, trace);
    if (/\b(sold|sold prices?|median price|land registry|house prices?|comps?)\b/.test(low) && !/\blots?\b|\bauction/.test(low)) return answerPrices(q, ctx, trace);
    if (/\b(lots?|auctions?|guides?|guide price|cheap|for sale|listings?)\b/.test(low) || priceCap(q) != null || (bedsFrom(q) && areaFrom(q))) return answerLots(q, ctx, trace);
    if (/\b(yield|niy|irr|return|rent i|what rent|valuation|worth|should i (buy|bid))\b/.test(low)) {
      trace.push('decline_estimate');
      return pack('I do not estimate a rent, a yield, a value or a bid. Type the rent and costs you hold into the Deal tab and it tests the 14 hurdles. Comps shows sold prices and stated yields only.', [], [{type: 'navigate', view: 'deal', label: 'Deal'}, {type: 'navigate', view: 'comps', label: 'Comps'}], trace);
    }
    trace.push('no_match');
    return pack('I could not match that to a file on this site, so I will not guess. I can answer from: current auction lots (by area, beds, type or guide), the rent gap against the allowance, sold price medians, contract routes, published demand and the 14 hurdles.', [], [], trace);
  }

  root.AskDealsModel = Object.freeze({answer, areaFrom, bedsFrom, priceCap, guideOf, median, HURDLES, TABS, DISCLAIMER});
})(typeof globalThis !== 'undefined' ? globalThis : this);
