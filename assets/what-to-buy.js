/* What to buy: one recommendation per town, from figures already on the site. */
(function () {
  'use strict';

  const SCOPE = {
    Manchester: 'Manchester',
    'City Of Bristol': 'Bristol',
    Cheltenham: 'Cheltenham',
    Edinburgh: 'Edinburgh',
    Glasgow: 'Glasgow'
  };
  const LABEL = {
    Manchester: 'Manchester',
    Bristol: 'Bristol',
    Cheltenham: 'Cheltenham',
    Edinburgh: 'Edinburgh',
    Glasgow: 'Glasgow'
  };
  let prices = null;
  let book = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function money(n) {
    if (n == null || !isFinite(+n)) return '—';
    const whole = Math.abs(n - Math.round(n)) < 0.001;
    return '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
  }
  function sqftMoney(n) {
    if (n == null || !isFinite(+n)) return '—';
    return '£' + Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function pct(n) {
    if (n == null || !isFinite(+n)) return '—';
    return (n * 100).toFixed(1) + '%';
  }
  function count(n) {
    return Number(n).toLocaleString('en-GB');
  }
  function textOf(site) {
    return [
      site && site.addr, site && site.address,
      site && site.l && site.l.title, site && site.l && site.l.lot_type, site && site.l && site.l.address,
      site && site.auction && site.auction.type, site && site.auction && site.auction.guide,
      site && site.b && site.b.notes, site && site.why
    ].filter(Boolean).join(' ');
  }
  function bedsOf(site) {
    if (!window.lcRentGap) return '';
    return lcRentGap.bedsFrom(textOf(site));
  }
  function leadPrice(site) {
    const lot = (site && site.l) || {};
    const listing = (site && site.b) || {};
    const nums = [lot.guide_price, lot.sold_price, listing.price_gbp];
    for (let i = 0; i < nums.length; i++) {
      if (typeof nums[i] === 'number' && nums[i] > 0) return nums[i];
    }
    return null;
  }
  function floorSqft(site) {
    const text = textOf(site);
    const sqft = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:sq\.?\s*ft|sqft)\b/i);
    if (sqft) {
      const n = Number(sqft[1].replace(/,/g, ''));
      if (n >= 80 && n <= 20000) return n;
    }
    const sqm = text.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:sq\.?\s*m|sqm|m²)\b/i);
    if (sqm) {
      const n = Number(sqm[1].replace(/,/g, ''));
      if (n >= 8 && n <= 2000) return n * 10.7639;
    }
    return null;
  }
  function addressOf(site) {
    return (site && (site.addr || site.address || (site.l && site.l.address))) || 'Address not recorded';
  }
  function leadsFor(scope) {
    const sites = (window.DM && DM.sites) || [];
    return sites.filter(function (site) { return site && site.city === scope; });
  }

  function advise(scope) {
    const area = SCOPE[scope];
    const median = prices && prices.areas ? prices.areas[area] : null;
    const table = window.lcRentGap && book ? lcRentGap.build(book) : { ranked: [], missing: [] };
    const rows = table.ranked.filter(function (row) { return row.area === area; }).slice().sort(function (a, b) { return a.gap - b.gap || a.pct - b.pct; });
    const missing = table.missing.filter(function (row) { return row.area === area; });
    const leads = leadsFor(scope);
    const measured = [];
    const gapped = [];
    const stated = [];
    leads.forEach(function (site) {
      const beds = bedsOf(site);
      const price = leadPrice(site);
      const sqft = floorSqft(site);
      const all = median && median.all;
      if (sqft && price && all && all.median_gbp_per_sqft != null && all.n >= 5) {
        const pps = price / sqft;
        measured.push({ site: site, price: price, sqft: sqft, pps: pps, median: all.median_gbp_per_sqft, discount: (all.median_gbp_per_sqft - pps) / all.median_gbp_per_sqft });
      }
      const gap = window.lcRentGap ? lcRentGap.forLead(site) : null;
      if (gap && gap.gap != null) gapped.push({ site: site, gap: gap, price: price, beds: beds || gap.beds });
      else if (beds) stated.push({ site: site, beds: beds, price: price, why: gap && gap.label ? gap.label : 'Bedrooms are stated, and this series has no gap for them.' });
    });
    measured.sort(function (a, b) { return b.discount - a.discount; });
    gapped.sort(function (a, b) { return a.gap.gap - b.gap.gap || String(addressOf(a.site)).localeCompare(String(addressOf(b.site))); });
    return { area: area, median: median, rows: rows, missing: missing, measured: measured, gapped: gapped, stated: stated };
  }

  function priceLine(median) {
    if (!median || !median.all || median.all.median_gbp_per_sqft == null || !(median.all.n >= 5)) {
      return 'There is no floor-area data for this area, so there is no £/sq ft median and no measured discount.';
    }
    let line = 'Matched Land Registry sales median ' + sqftMoney(median.all.median_gbp_per_sqft) + '/sq ft, from ' + count(median.all.n) + ' sales.';
    if (median.houses && median.houses.n >= 5) line += ' Houses ' + sqftMoney(median.houses.median_gbp_per_sqft) + '/sq ft, n=' + count(median.houses.n) + '.';
    if (median.flats && median.flats.n >= 5) line += ' Flats ' + sqftMoney(median.flats.median_gbp_per_sqft) + '/sq ft, n=' + count(median.flats.n) + '.';
    return line;
  }

  function discountLine(info) {
    if (!info.median || !info.median.all || info.median.all.median_gbp_per_sqft == null) {
      return 'No current lead is given a discount. ' + priceLine(info.median);
    }
    if (!info.measured.length) {
      return 'No current lead has both a floor area and a guide, asking or sold price, so none is marked as a discount against the ' + sqftMoney(info.median.all.median_gbp_per_sqft) + '/sq ft median.';
    }
    const below = info.measured.filter(function (row) { return row.discount > 0; });
    if (!below.length) {
      const nearest = info.measured[0];
      return 'Leads with a floor area and a price are at or above the ' + sqftMoney(nearest.median) + '/sq ft median. None is a discount. The nearest is ' + esc(addressOf(nearest.site)) + ' at ' + sqftMoney(nearest.pps) + '/sq ft.';
    }
    const best = below[0];
    return 'The largest measured discount is ' + esc(addressOf(best.site)) + ': ' + sqftMoney(best.pps) + '/sq ft against ' + sqftMoney(best.median) + '/sq ft, ' + pct(best.discount) + ' below the median, on ' + money(best.price) + ' and ' + Math.round(best.sqft).toLocaleString('en-GB') + ' sq ft.';
  }

  function focusCopy(info) {
    if (!info.rows.length) {
      return 'There is no published open-market rent for ' + LABEL[info.area] + ', so there is no allowance gap to rank. Do not treat a missing gap as a small one.';
    }
    const best = info.rows[0];
    const size = best.bedLabel.toLowerCase().replace(' ', '-');
    const same = info.gapped.filter(function (row) { return String(row.beds) === String(best.beds) || String(row.gap.beds) === String(best.beds); });
    let line = 'Buy a ' + size + '. The allowance is ' + money(best.lha) + ' against a market rent of ' + money(best.omr) + ', a gap of ' + money(best.gap) + ' a month (' + pct(best.pct) + '). That is the smallest published gap in ' + LABEL[info.area] + '.';
    if (same.length) {
      line += ' ' + same.length + ' current lead' + (same.length === 1 ? '' : 's') + ' state' + (same.length === 1 ? 's' : '') + ' that size.';
    } else {
      line += ' No current lead states that size.';
    }
    return line;
  }

  function leadItem(row) {
    const price = row.price ? ', guide or price ' + money(row.price) : '';
    return '<li><b>' + esc(addressOf(row.site)) + '</b> — ' + esc(row.gap.label) + price + '.</li>';
  }

  function render(scope) {
    const info = advise(scope);
    const name = LABEL[info.area];
    const rentRows = info.rows.map(function (row) {
      return '<li>' + esc(row.bedLabel) + ': market ' + money(row.omr) + ', allowance ' + money(row.lha) + ', gap ' + money(row.gap) + ' (' + pct(row.pct) + ').</li>';
    }).join('');
    const missingRows = info.missing.map(function (row) {
      return '<li>' + esc(row.bedLabel) + ': ' + esc(row.reason) + '.</li>';
    }).join('');
    const gapItems = info.gapped.map(leadItem).join('');
    const statedItems = info.stated.map(function (row) {
      const price = row.price ? ', price ' + money(row.price) : '';
      return '<li><b>' + esc(addressOf(row.site)) + '</b> — ' + esc(row.beds) + '-bed' + price + '. ' + esc(row.why) + '</li>';
    }).join('');
    const discountItems = info.measured.map(function (row) {
      const word = row.discount > 0 ? pct(row.discount) + ' below' : pct(-row.discount) + ' above';
      return '<li><b>' + esc(addressOf(row.site)) + '</b> — ' + sqftMoney(row.pps) + '/sq ft, ' + word + ' the ' + sqftMoney(row.median) + ' median, on ' + money(row.price) + '.</li>';
    }).join('');
    const nearest = info.gapped[0];
    const nearestLine = nearest ? 'Closest current lead on the allowance gap: ' + addressOf(nearest.site) + ', ' + nearest.gap.label + (nearest.price ? ', price ' + money(nearest.price) : '') + '.' : 'No current lead has both a stated bedroom count and a published gap.';
    return '<section class="ios-buy"><p class="lc-kicker">What to buy</p><h2>' + esc(name) + '</h2><p>' + esc(focusCopy(info)) + '</p><p>' + esc(nearestLine) + '</p>' +
      '<details class="ios-disc"><summary>Price per square foot</summary><p>' + esc(discountLine(info)) + '</p><p>' + esc(priceLine(info.median)) + '</p>' +
      (discountItems ? '<ul>' + discountItems + '</ul>' : '<p>A discount is shown only where the lead itself states a floor area and a guide, asking or sold price.</p>') +
      '</details>' +
      '<details class="ios-disc"><summary>Allowance and market rent</summary><p>A smaller gap is the better fit where the tenant relies on the allowance. A larger gap is the downside in that case. ONS private rents, ' + esc(book.omr.month) + '. DWP Local Housing Allowance, ' + esc(book.lha.valid_from) + ' to ' + esc(book.lha.valid_to) + '.</p>' +
      (rentRows ? '<ul>' + rentRows + '</ul>' : '') +
      (missingRows ? '<p>Not ranked, because a figure is missing:</p><ul>' + missingRows + '</ul>' : '') +
      '</details>' +
      '<details class="ios-disc"><summary>Current leads</summary><p>' + (gapItems ? 'Smallest allowance gap first. The gap is the area series for the bedrooms stated on the lead, not that building\'s own rent.</p><ul>' + gapItems + '</ul>' : 'No current lead has a published allowance gap.</p>') +
      (statedItems ? '<p>Stated bedrooms, with no published gap for that lead:</p><ul>' + statedItems + '</ul>' : '') +
      '</details></section>';
  }

  function paint(host) {
    if (!host) return;
    const scope = window.DM && DM.scope;
    const area = SCOPE[scope];
    if (!area) {
      host.innerHTML = '<section class="ios-buy"><p class="lc-kicker">What to buy</p><h2>Pick a town</h2><p>Choose Manchester, Bristol, Cheltenham, Glasgow or Edinburgh.</p></section>';
      return;
    }
    if (!prices || !book || !window.lcRentGap) {
      host.innerHTML = '<section class="ios-buy"><p class="lc-kicker">What to buy</p><h2>' + esc(LABEL[area]) + '</h2><p>Loading the published figures.</p></section>';
      return;
    }
    host.innerHTML = render(scope);
  }

  function load() {
    return Promise.all([
      fetch('comps/home-ppsqft.json').then(function (response) { return response.json(); }),
      fetch('data/rent-scenarios.json').then(function (response) { return response.json(); })
    ]).then(function (pair) {
      prices = pair[0];
      book = pair[1];
      paint(document.getElementById('dm_buy'));
    }).catch(function () {
      prices = prices || { areas: {} };
      book = book || null;
    });
  }

  window.lcWhatToBuy = { paint: paint, advise: advise, load: load };
  load();
})();
