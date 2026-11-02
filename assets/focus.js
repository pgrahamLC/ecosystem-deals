/* One headline per screen. Everything else stays, behind a labelled expander. */
(function () {
  'use strict';

  const PRIMARY = [
    ['assets', 'Find'],
    ['distress', 'Leads'],
    ['deal', 'Deal'],
    ['comps', 'Comps']
  ];
  const MORE = [
    ['map', 'Map'],
    ['sales', 'For sale now'],
    ['valuation', 'Local OMV / LHA'],
    ['accom', 'Demand'],
    ['pipeline', 'Pipeline'],
    ['shortlist', 'Shortlist'],
    ['overview', 'Overview']
  ];
  const COPY = {
    assets: ['Find', 'Where to look', 'Manchester, Cheltenham and Bristol. Open a town, then a lead, then a deal.'],
    distress: ['Leads', 'Who has to sell', 'A is a live insolvency. B is a lender or receiver sale. C is a watchlist, not a forced sale.'],
    sales: ['Leads', 'For sale now', 'Checked listings only. An empty list is not proof that nothing is for sale.'],
    deal: ['Deal', 'The decision', 'Rent, operating income, the NIY you are using, the maximum bid, and the return.'],
    comps: ['Comps', 'What sold nearby', 'Land Registry prices for this town. A yield is shown only when the same lot states rent and price.'],
    map: ['Find', 'Map', 'One town at a time. Colour is a screen, not a valuation.'],
    valuation: ['Comps', 'Local sold evidence', 'Cohort medians. Local Housing Allowance here is a benefit cap, not a rent.'],
    accom: ['More', 'Demand', 'Published temporary accommodation and asylum figures. Not a lease.'],
    pipeline: ['More', 'Pipeline', 'Stages kept in this browser.'],
    shortlist: ['More', 'Shortlist', 'Sites you marked, in this browser.'],
    overview: ['More', 'Overview', 'A count of the book, not a recommendation.']
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function money(n) {
    if (n == null || !isFinite(+n)) return '—';
    return '£' + Math.round(+n).toLocaleString('en-GB');
  }
  function rate(n) {
    if (n == null || !isFinite(+n)) return '—';
    return (Math.abs(n) <= 2 ? n * 100 : n).toFixed(1) + '%';
  }

  function installNav() {
    const bar = document.querySelector('.mainnav');
    if (!bar || bar.dataset.focus) return;
    const partner = document.querySelector('#nav2 a.mainb');
    const partnerHref = partner ? partner.href : 'https://pgraham974.github.io/ecosystem-partners/';
    bar.dataset.focus = '1';
    bar.innerHTML = PRIMARY.map(function (pair) {
      return '<button class="mainb" type="button" data-v="' + pair[0] + '">' + pair[1] + '</button>';
    }).join('') +
      '<div class="lc-more"><button class="mainb" type="button" id="lc_more_btn" aria-expanded="false">More</button>' +
      '<div class="lc-more-menu" hidden>' +
      MORE.map(function (pair) {
        return '<button type="button" data-v="' + pair[0] + '">' + pair[1] + '</button>';
      }).join('') +
      '<a href="' + esc(partnerHref) + '" target="_blank" rel="noopener">Partner site</a></div></div>';
    bar.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-v]');
      if (!btn || !bar.contains(btn)) return;
      e.preventDefault();
      closeMore();
      if (typeof viewMode === 'function') viewMode(btn.getAttribute('data-v'));
    });
    const more = document.getElementById('lc_more_btn');
    more.addEventListener('click', function (e) {
      e.stopPropagation();
      const menu = more.nextElementSibling;
      const open = menu.hasAttribute('hidden');
      if (open) menu.removeAttribute('hidden'); else menu.setAttribute('hidden', '');
      more.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.lc-more')) closeMore();
    });
    const sub = document.getElementById('subnav');
    if (sub) sub.hidden = true;
  }

  function closeMore() {
    const menu = document.querySelector('.lc-more-menu');
    const btn = document.getElementById('lc_more_btn');
    if (menu) menu.setAttribute('hidden', '');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function markNav(mode) {
    document.querySelectorAll('.mainnav .mainb[data-v]').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-v') === mode);
    });
    const moreOn = MORE.some(function (pair) { return pair[0] === mode; });
    const moreBtn = document.getElementById('lc_more_btn');
    if (moreBtn) moreBtn.classList.toggle('on', moreOn);
  }

  function screenHost() {
    let host = document.getElementById('lc_screen');
    if (host) return host;
    host = document.createElement('section');
    host.id = 'lc_screen';
    host.className = 'lc-screen';
    const nav = document.getElementById('nav2');
    if (nav && nav.parentNode) nav.parentNode.insertBefore(host, nav.nextSibling);
    else document.body.insertBefore(host, document.body.firstChild);
    return host;
  }

  function leadCounts() {
    const sites = (window.DM && DM.sites) || [];
    const n = function (kind) { return sites.filter(function (s) { return s.kind === kind; }).length; };
    if (!sites.length) return [];
    return [
      { n: n('d'), l: 'A sites' },
      { n: n('lot'), l: 'B sales' },
      { n: n('pre') + n('s'), l: 'C watchlist' },
      { n: n('sale'), l: 'Ordinary sales' }
    ];
  }

  function findCounts() {
    const sites = (window.DM && DM.sites) || [];
    const towns = [['Manchester', 'Manchester'], ['Cheltenham', 'Cheltenham'], ['City Of Bristol', 'Bristol']];
    if (!sites.length) return [];
    return towns.map(function (t) {
      return {
        n: sites.filter(function (s) { return s.city === t[0] && (s.kind === 'd' || s.kind === 'lot'); }).length,
        l: t[1] + ' A/B'
      };
    });
  }

  function dealCounts() {
    const r = (typeof UW !== 'undefined' && UW.result && !(UW.result.errors && UW.result.errors.length)) ? UW.result : null;
    const niy = (typeof UW !== 'undefined' && UW.state) ? UW.state.entryYield : null;
    const mode = (typeof UW !== 'undefined' && UW.state && UW.state.niyMode === 'average' && !UW.state.niyUserOverride) ? ' area' : '';
    if (!r) return [{ n: '—', l: 'Needs rent and OPEX' }];
    const irr = r.levered && r.levered.irr;
    const mult = r.levered && r.levered.multiple;
    return [
      { n: money(r.annualRent), l: 'Rent' },
      { n: money(r.noi), l: 'NOI' },
      { n: (niy == null ? '—' : Number(niy).toFixed(2) + '%') + mode, l: 'NIY used' },
      { n: money(r.bid), l: 'Max bid' },
      { n: rate(irr), l: 'Levered IRR' },
      { n: (mult == null || !isFinite(+mult) ? '—' : Number(mult).toFixed(2) + '×'), l: 'Multiple' }
    ];
  }

  function paintScreen(mode) {
    const copy = COPY[mode] || ['More', 'More', 'The rest of the book. Nothing here is a recommendation.'];
    const stats = mode === 'deal' ? dealCounts() : mode === 'distress' || mode === 'sales' ? leadCounts() : mode === 'assets' || mode === 'map' ? findCounts() : [];
    const host = screenHost();
    host.innerHTML = '<p class="lc-kicker">' + esc(copy[0]) + '</p><h1>' + esc(copy[1]) + '</h1><p class="lc-purpose">' + esc(copy[2]) + '</p>' +
      (stats.length ? '<div class="lc-stats">' + stats.map(function (s) {
        return '<div><b>' + esc(s.n) + '</b><span>' + esc(s.l) + '</span></div>';
      }).join('') + '</div>' : '');
    markNav(mode);
  }

  function fold(el, label) {
    if (!el || el.closest('details.lc-fold')) return;
    const details = document.createElement('details');
    details.className = 'lc-fold';
    const summary = document.createElement('summary');
    summary.textContent = label;
    details.appendChild(summary);
    el.parentNode.insertBefore(details, el);
    details.appendChild(el);
  }

  function clipLong(root) {
    if (!root) return;
    root.querySelectorAll('p, .foot').forEach(function (p) {
      if (p.dataset.clipped || p.closest('.lc-decision, .lc-screen, details, table, .lc-stats')) return;
      if (p.querySelector('button, input, select, table')) return;
      const plain = p.textContent.replace(/\s+/g, ' ').trim();
      if (plain.length < 170) return;
      const full = p.innerHTML;
      const short = plain.slice(0, 118).replace(/\s+\S*$/, '');
      p.textContent = short + '. ';
      const details = document.createElement('details');
      details.className = 'lc-inline';
      details.innerHTML = '<summary>Full note</summary><div>' + full + '</div>';
      p.appendChild(details);
      p.dataset.clipped = '1';
    });
  }

  function foldStatic() {
    const aside = document.querySelector('aside.card');
    if (aside) fold(aside, 'Caveats');
    const legend = document.querySelector('.legend');
    if (legend) fold(legend, 'Method');
    const demand = document.getElementById('f_demand');
    if (demand) fold(demand, 'Evidence');
    const table = document.getElementById('tfun');
    if (table) fold(table.closest('.scroll') || table, 'Full table');
    const chart = document.getElementById('f_chart');
    if (chart && chart.childElementCount) fold(chart, 'Evidence');
  }

  function foldComps() {
    const table = document.getElementById('comp_table');
    if (table && table.childElementCount) fold(table, 'Full table');
    fold(document.getElementById('comp_sales'), 'Full table');
    fold(document.getElementById('comp_area_yields'), 'Evidence');
    fold(document.getElementById('comp_rents'), 'Sources');
    fold(document.getElementById('comp_yields'), 'Evidence');
    const lead = document.querySelector('#comps_view .lead');
    if (lead) clipLong(lead.parentNode);
  }

  function foldLeads() {
    const grid = document.querySelector('#distress_view .dm-grid');
    if (grid && !grid.closest('details.lc-fold')) {
      fold(grid, 'Full map');
      const details = grid.closest('details.lc-fold');
      if (details && !details.dataset.map) {
        details.dataset.map = '1';
        details.addEventListener('toggle', function () {
          if (details.open && window.DM && DM.map && DM.map.invalidateSize) DM.map.invalidateSize();
        });
      }
    }
    const intro = document.querySelector('#distress_view .ctl .foot');
    if (intro && intro.parentElement) clipLong(intro.parentElement);
  }

  function foldNiy() {
    const box = document.getElementById('niy_box');
    if (!box || box.querySelector(':scope > details.lc-fold')) return;
    const bits = [];
    box.querySelectorAll('table, .scroll').forEach(function (el) {
      if (el.closest('details')) return;
      if (bits.indexOf(el.closest('.scroll') || el) === -1) bits.push(el.closest('.scroll') || el);
    });
    if (!bits.length) return;
    const details = document.createElement('details');
    details.className = 'lc-fold';
    details.innerHTML = '<summary>Evidence</summary>';
    bits[0].parentNode.insertBefore(details, bits[0]);
    bits.forEach(function (el) { if (!details.contains(el)) details.appendChild(el); });
  }

  function shapeDeal() {
    const body = document.getElementById('deal_body');
    if (!body) return;
    const stale = document.getElementById('lc_decision');
    if (stale) stale.remove();
    const results = document.getElementById('uw_results');
    const saved = document.getElementById('uw_saved');
    if (results && results.parentNode === body) {
      if (saved && saved.parentNode === body) body.insertBefore(results, saved);
      else body.appendChild(results);
    }
    if (results) {
      const cash = results.querySelector('details');
      if (cash) cash.open = true;
      clipLong(results);
    }
    clipLong(document.getElementById('rr_card'));
    clipLong(document.getElementById('rr_bridge'));
    foldNiy();
    clipLong(body);
    const dealView = document.getElementById('deal_view');
    if (dealView && !dealView.classList.contains('hidden')) paintScreen('deal');
  }

  function tidy(mode) {
    installNav();
    foldStatic();
    paintScreen(mode);
    if (mode === 'comps') foldComps();
    if (mode === 'distress') foldLeads();
    if (mode === 'deal') shapeDeal();
    if (mode === 'assets') foldStatic();
    clipLong(document.getElementById(mode + '_view'));
  }

  function hook(name, after) {
    const prev = window[name];
    if (typeof prev !== 'function' || prev._focus) return;
    const wrapped = function () {
      const out = prev.apply(this, arguments);
      const run = function () { try { after(); } catch (e) { console.log('focus', e); } };
      if (out && typeof out.then === 'function') return out.then(function (v) { run(); return v; });
      run();
      return out;
    };
    wrapped._focus = true;
    window[name] = wrapped;
  }

  installNav();
  if (typeof viewMode === 'function' && !viewMode._focus) {
    const prev = viewMode;
    const wrapped = function (mode) {
      const out = prev.apply(this, arguments);
      const run = function () { tidy(mode); };
      if (out && typeof out.then === 'function') return out.then(function (v) { run(); return v; });
      setTimeout(run, 0);
      return out;
    };
    wrapped._focus = true;
    viewMode = wrapped;
  }
  if (typeof navGo === 'function' && !navGo._focus) {
    const prevGo = navGo;
    const wrappedGo = function (g) {
      if (g === 'find') return viewMode('assets');
      return prevGo(g);
    };
    wrappedGo._focus = true;
    navGo = wrappedGo;
  }
  hook('uwUpdate', shapeDeal);
  hook('uwStart', function () { setTimeout(shapeDeal, 0); });
  hook('dmStart', function () { setTimeout(function () { foldLeads(); paintScreen('distress'); }, 0); });

  setTimeout(function () { viewMode('assets'); }, 0);
  let tries = 0;
  const waitSites = setInterval(function () {
    tries += 1;
    const ready = window.DM && DM.sites && DM.sites.length;
    if (!ready && tries < 25) return;
    clearInterval(waitSites);
    const title = document.querySelector('#lc_screen h1');
    if (!title) return;
    if (title.textContent === 'Where to look') paintScreen('assets');
    if (title.textContent === 'Who has to sell') paintScreen('distress');
  }, 400);
})();
