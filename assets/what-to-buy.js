/* Agent view: rank current leads in three towns from published figures only. */
(function () {
  'use strict';

  const SCOPE = {
    Manchester: 'Manchester',
    'City Of Bristol': 'Bristol',
    Cheltenham: 'Cheltenham'
  };
  const LABEL = { Manchester: 'Manchester', Bristol: 'Bristol', Cheltenham: 'Cheltenham' };
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
    return (Math.abs(n) * 100).toFixed(1) + '%';
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
    return ((window.DM && DM.sites) || []).filter(function (site) { return site && site.city === scope; });
  }

  function scoreLead(site, area, median, smallestGap) {
    const price = leadPrice(site);
    const sqft = floorSqft(site);
    const beds = bedsOf(site);
    const gapInfo = window.lcRentGap ? lcRentGap.forLead(site) : null;
    const gap = gapInfo && gapInfo.gap != null ? gapInfo.gap : null;
    let discount = null;
    let priceLine = 'No floor area and no price.';
    if (sqft && !price) priceLine = 'Floor area is on the lead, but there is no price.';
    else if (!sqft && price) priceLine = 'No floor area, so no £/sq ft discount. Price ' + money(price) + '.';
    else if (sqft && price && median != null) {
      const pps = price / sqft;
      discount = (median - pps) / median;
      priceLine = sqftMoney(pps) + '/sq ft against the ' + sqftMoney(median) + '/sq ft median, ' + (discount > 0 ? pct(discount) + ' below' : pct(discount) + ' above') + '.';
    } else if (sqft && price) priceLine = 'Price and floor area are on the lead, but this area has no £/sq ft median.';
    let gapLine = 'Bedrooms are not stated, so there is no allowance gap.';
    if (beds && gap == null) gapLine = (gapInfo && gapInfo.label) || 'No allowance gap for this bedroom count.';
    else if (gap != null) gapLine = gapInfo.label;
    const strong = discount != null && discount >= 0.1;
    const below = discount != null && discount > 0;
    const smallGap = gap != null && smallestGap != null && gap <= smallestGap + 0.5;
    const wideGap = gap != null && smallestGap != null && gap > smallestGap + 0.5;
    let stance = 'skip';
    let why = '';
    if (strong && smallGap) {
      stance = 'buy';
      why = 'Below the local median by ' + pct(discount) + ', and on the closest allowance gap.';
    } else if (strong) {
      stance = 'buy';
      why = 'A measured discount against the local median. ' + (wideGap ? 'The allowance gap is wider than the closest size.' : gapLine);
    } else if (smallGap && below) {
      stance = 'buy';
      why = 'On the closest allowance gap, and the price per sq ft is under the median.';
    } else if (smallGap) {
      stance = 'buy';
      why = 'On the closest allowance gap. ' + priceLine;
    } else if (below) {
      stance = 'buy';
      why = 'Under the local median. ' + gapLine;
    } else if (wideGap) {
      why = 'The allowance gap is wider than the closest size in ' + LABEL[area] + '. ' + priceLine;
    } else if (discount != null && discount <= 0) {
      why = 'Not below the local median. ' + gapLine;
    } else if (!sqft && !price && !beds) {
      why = 'No floor area, no price, and bedrooms are not stated.';
    } else {
      why = priceLine + ' ' + gapLine;
    }
    return {
      site: site,
      address: addressOf(site),
      price: price,
      sqft: sqft,
      beds: beds,
      discount: discount,
      gap: gap,
      strong: strong,
      smallGap: smallGap,
      wideGap: wideGap,
      stance: stance,
      why: why,
      priceLine: priceLine,
      gapLine: gapLine
    };
  }

  function review(scope) {
    const area = SCOPE[scope];
    const block = prices && prices.areas ? prices.areas[area] : null;
    const median = block && block.all && block.all.n >= 5 ? block.all.median_gbp_per_sqft : null;
    const table = window.lcRentGap && book ? lcRentGap.build(book) : { ranked: [] };
    const rows = table.ranked.filter(function (row) { return row.area === area; }).slice().sort(function (a, b) { return a.gap - b.gap; });
    const smallest = rows[0] || null;
    const scored = leadsFor(scope).map(function (site) { return scoreLead(site, area, median, smallest && smallest.gap); });
    const buys = scored.filter(function (row) { return row.stance === 'buy'; }).sort(function (a, b) {
      if (a.strong !== b.strong) return a.strong ? -1 : 1;
      if (a.smallGap !== b.smallGap) return a.smallGap ? -1 : 1;
      return (b.discount || -1) - (a.discount || -1) || (a.gap == null ? 1 : a.gap) - (b.gap == null ? 1 : b.gap);
    });
    const skips = scored.filter(function (row) { return row.stance !== 'buy'; });
    const quiet = skips.filter(function (row) { return !row.price && !row.sqft && !row.beds && row.gap == null; });
    const named = skips.filter(function (row) { return quiet.indexOf(row) < 0; });
    return { area: area, median: median, medianN: block && block.all ? block.all.n : null, smallest: smallest, buys: buys, named: named, quiet: quiet.length, total: scored.length };
  }

  function verdict(info) {
    const name = LABEL[info.area];
    if (!info.smallest) return 'There is no published allowance gap for ' + name + ', so nothing is ranked on rent.';
    const both = info.buys.filter(function (row) { return row.strong && row.smallGap; });
    const strong = info.buys.filter(function (row) { return row.strong; });
    const close = info.buys.filter(function (row) { return row.smallGap; });
    let line = 'The closest allowance fit in ' + name + ' is a ' + info.smallest.bedLabel.toLowerCase() + ': market rent ' + money(info.smallest.omr) + ', allowance ' + money(info.smallest.lha) + ', gap ' + money(info.smallest.gap) + ' a month.';
    if (!info.median) line += ' There is no £/sq ft median here, so no discount is calculated.';
    else line += ' The matched-sales median is ' + sqftMoney(info.median) + '/sq ft.';
    if (both.length) return line + ' Buy where both show up: a discount of 10% or more and that closest gap.';
    if (strong.length) return line + ' Buy on the measured discount. Nothing also sits on that closest gap.';
    if (close.length) return line + ' No lead is 10% or more under the median. Look at the leads on that closest gap.';
    if (info.buys.length) return line + ' A few leads are under the median, but not by 10%, and none is on the closest gap.';
    return line + ' No current lead is both under the median and on that closest gap.';
  }

  function card(row) {
    return '<article class="ios-agent"><p class="lc-kicker">' + esc(row.stance === 'buy' ? 'Look at' : 'Skip') + '</p><h3>' + esc(row.address) + '</h3><p>' + esc(row.why) + '</p></article>';
  }

  function render(scope) {
    const info = review(scope);
    const name = LABEL[info.area];
    const nearest = info.named.filter(function (row) { return row.gap != null || row.discount != null || row.price; }).sort(function (a, b) {
      return (a.gap == null ? 1 : 0) - (b.gap == null ? 1 : 0) || (a.gap || 0) - (b.gap || 0);
    });
    const buyCards = info.buys.slice(0, 8).map(card).join('');
    const skipCards = info.named.slice(0, 12).map(card).join('');
    const nearestCards = info.buys.length ? '' : nearest.slice(0, 3).map(card).join('');
    const moreBuys = info.buys.length > 8 ? '<p>' + (info.buys.length - 8) + ' more leads are under the median or on the closest gap.</p>' : '';
    const quiet = info.quiet ? '<p>' + info.quiet.toLocaleString('en-GB') + ' other leads have no floor area, no price and no stated bedrooms, so they are not ranked.</p>' : '';
    const full = info.buys.concat(info.named).map(function (row) {
      return '<li><b>' + esc(row.address) + '</b> — ' + esc(row.priceLine) + ' ' + esc(row.gapLine) + '</li>';
    }).join('');
    return '<section class="ios-buy"><p class="lc-kicker">Agent view</p><h2>' + esc(name) + '</h2><p>' + esc(verdict(info)) + '</p>' +
      (buyCards ? buyCards + moreBuys : '<p>None of the current leads is a buy on these tests.</p>' + nearestCards) +
      '<details class="ios-disc"><summary>Skip, and why</summary>' + (skipCards || '<p>No named skip.</p>') + quiet + '</details>' +
      '<details class="ios-disc"><summary>How each scored lead was read</summary><p>A discount needs both a floor area and a price on that lead. A gap needs the bedrooms stated on that lead, and an ONS rent for this local authority. Neither is guessed.</p><ul>' + (full || '<li>No lead had a price, a floor area, or stated bedrooms.</li>') + '</ul></details></section>';
  }

  function paint(host) {
    if (!host) return;
    const scope = window.DM && DM.scope;
    const area = SCOPE[scope];
    if (scope === 'Edinburgh' || scope === 'Glasgow') {
      host.innerHTML = '<section class="ios-buy"><p class="lc-kicker">Agent view</p><h2>' + esc(scope) + '</h2><p>This note covers Manchester, Bristol and Cheltenham.</p></section>';
      return;
    }
    if (!area) {
      host.innerHTML = '<section class="ios-buy"><p class="lc-kicker">Agent view</p><h2>Pick a town</h2><p>Choose Manchester, Bristol or Cheltenham.</p></section>';
      return;
    }
    if (!prices || !book || !window.lcRentGap) {
      host.innerHTML = '<section class="ios-buy"><p class="lc-kicker">Agent view</p><h2>' + esc(LABEL[area]) + '</h2><p>Loading the published figures.</p></section>';
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

  window.lcWhatToBuy = { paint: paint, review: review, load: load };
  load();
})();
