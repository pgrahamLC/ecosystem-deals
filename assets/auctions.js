/* Auctions: live catalogue written by the scheduled collector. */
(function () {
  const TOWNS = ['Manchester', 'Glasgow', 'Edinburgh', 'Bristol', 'Cheltenham'];
  const TYPES = [
    ['', 'All'],
    ['block', 'Blocks'],
    ['house', 'Houses'],
    ['flat', 'Flats'],
    ['hmo', 'HMO'],
    ['portfolio', 'Portfolios'],
    ['mixed', 'Mixed-use'],
    ['development', 'Development']
  ];
  const TYPE_LABEL = { block: 'Block', house: 'House', flat: 'Flat', hmo: 'HMO', portfolio: 'Portfolio', mixed: 'Mixed-use', development: 'Development' };
  const state = { town: '', type: '', tab: 'upcoming', sort: 'date', q: '' };
  let data = { lots: [], updated_at: '' };
  let coverage = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function money(n) {
    if (n == null || !isFinite(+n)) return '';
    return '£' + Math.round(+n).toLocaleString('en-GB');
  }
  function when(iso) {
    if (!iso) return 'Date not stated';
    const d = new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  function grade(lot) {
    if (lot.grade === 'A' || lot.grade === 'B' || lot.grade === 'C') return lot.grade;
    const text = [lot.seller_type, lot.title, lot.description].join(' ');
    if (/receivers?|mortgagee|administrators?|liquidators?/i.test(text)) return 'B';
    return '';
  }
  function gradeRank(g) { return g === 'A' ? 0 : g === 'B' ? 1 : g === 'C' ? 2 : 3; }
  function badge(g) {
    const cls = g === 'A' ? 'd' : g === 'B' ? 'b' : g === 'C' ? 's' : 'x';
    const label = g || 'Ungraded';
    return '<span class="lvl ' + cls + '">' + esc(label) + '</span>';
  }

  function rows() {
    const closed = state.tab === 'sold';
    let list = (data.lots || []).filter(function (lot) {
      const isSold = lot.status === 'sold' || lot.status === 'withdrawn';
      if (closed ? !isSold : isSold) return false;
      if (state.town && lot.town !== state.town) return false;
      if (state.type && lot.lot_type !== state.type) return false;
      if (state.q) {
        const hay = [lot.address, lot.title, lot.postcode, lot.source, lot.description].join(' ').toLowerCase();
        if (!hay.includes(state.q)) return false;
      }
      return true;
    });
    list.sort(function (a, b) {
      if (state.sort === 'grade') {
        const d = gradeRank(grade(a)) - gradeRank(grade(b));
        if (d) return d;
      }
      if (state.sort === 'price') return (b.guide_gbp || 0) - (a.guide_gbp || 0);
      const ad = a.auction_date || (closed ? '0000' : '9999');
      const bd = b.auction_date || (closed ? '0000' : '9999');
      return closed ? bd.localeCompare(ad) : ad.localeCompare(bd);
    });
    return list;
  }

  function counts() {
    const base = (data.lots || []).filter(function (lot) {
      return state.tab === 'sold' ? (lot.status === 'sold' || lot.status === 'withdrawn') : (lot.status !== 'sold' && lot.status !== 'withdrawn');
    });
    const byTown = {};
    TOWNS.forEach(function (t) { byTown[t] = base.filter(function (l) { return l.town === t; }).length; });
    return { n: base.length, byTown: byTown };
  }

  function card(lot) {
    const g = grade(lot);
    const price = lot.status === 'sold' && lot.sold_price ? money(lot.sold_price) : (lot.guide_price || 'Guide not stated');
    const priceLabel = lot.status === 'sold' && lot.sold_price ? 'Sold' : 'Guide';
    return '<article class="auc-card">' +
      '<div class="auc-top">' + badge(g) +
      '<span class="auc-type">' + esc(TYPE_LABEL[lot.lot_type] || 'Residential') + '</span>' +
      '<span class="auc-status">' + esc(lot.status) + '</span></div>' +
      '<h2>' + esc(lot.address || lot.title) + '</h2>' +
      '<p class="auc-meta">' + esc(lot.town || '') + (lot.postcode ? ' · ' + esc(lot.postcode) : '') + '</p>' +
      '<p class="auc-price"><span>' + priceLabel + '</span> ' + esc(price) + '</p>' +
      '<p class="auc-meta">' + esc(when(lot.auction_date)) + ' · ' + esc(lot.source) + '</p>' +
      (lot.description ? '<p class="auc-desc">' + esc(lot.description) + '</p>' : '') +
      '<a class="auc-link" href="' + esc(lot.source_url) + '" target="_blank" rel="noopener">Open the lot</a>' +
      '</article>';
  }

  function coverageHtml() {
    if (!coverage || !coverage.sources) return '';
    const live = coverage.sources.filter(function (s) { return s.status === 'live'; });
    const skipped = coverage.sources.filter(function (s) { return s.status !== 'live'; });
    const row = function (s) {
      return '<tr><td class="l">' + esc(s.name) + '</td><td>' + esc(s.status) + '</td><td>' + (s.lots || 0) + '</td><td class="l">' + esc(s.reason || '') + '</td></tr>';
    };
    return '<details class="ios-disc"><summary>Which catalogues were read</summary>' +
      '<p class="lc-purpose">' + live.length + ' catalogues answered. ' + skipped.length + ' were skipped or failed. ' +
      (coverage.commercial_excluded || 0) + ' lots in the five towns were left out because they were not residential.</p>' +
      '<div class="scroll"><table class="mt"><thead><tr><th class="l">House</th><th>State</th><th>Lots kept</th><th class="l">Note</th></tr></thead><tbody>' +
      coverage.sources.map(row).join('') + '</tbody></table></div></details>';
  }

  function render() {
    const host = document.getElementById('auctions_body');
    if (!host) return;
    const list = rows();
    const c = counts();
    host.innerHTML =
      '<p class="auc-updated">Last updated ' + esc(when(data.updated_at || (coverage && coverage.generated_at))) + '. The file is refreshed by a scheduled read of public catalogues. A blank is not proof a room is empty.</p>' +
      '<div class="auc-tabs" role="tablist">' +
      '<button type="button" class="' + (state.tab === 'upcoming' ? 'on' : '') + '" data-tab="upcoming">Upcoming</button>' +
      '<button type="button" class="' + (state.tab === 'sold' ? 'on' : '') + '" data-tab="sold">Sold</button></div>' +
      '<div class="auc-filters">' +
      '<label>Town <select id="auc_town">' + '<option value="">All five</option>' + TOWNS.map(function (t) {
        return '<option value="' + t + '"' + (state.town === t ? ' selected' : '') + '>' + t + ' (' + (c.byTown[t] || 0) + ')</option>';
      }).join('') + '</select></label>' +
      '<label>Type <select id="auc_type">' + TYPES.map(function (pair) {
        return '<option value="' + pair[0] + '"' + (state.type === pair[0] ? ' selected' : '') + '>' + pair[1] + '</option>';
      }).join('') + '</select></label>' +
      '<label>Sort <select id="auc_sort">' +
      '<option value="date"' + (state.sort === 'date' ? ' selected' : '') + '>Auction date</option>' +
      '<option value="price"' + (state.sort === 'price' ? ' selected' : '') + '>Guide price</option>' +
      '<option value="grade"' + (state.sort === 'grade' ? ' selected' : '') + '>A, then B, then C</option>' +
      '</select></label>' +
      '<label>Search <input id="auc_q" type="search" value="' + esc(state.q) + '" placeholder="Street, postcode, house"></label>' +
      '</div>' +
      '<p class="auc-count">' + list.length + ' lot' + (list.length === 1 ? '' : 's') + '</p>' +
      (list.length ? '<div class="auc-grid">' + list.map(card).join('') + '</div>' : '<p class="lc-purpose">Nothing in this filter. Try another town or type. An empty list is not proof the town has no auctions.</p>') +
      coverageHtml();
    host.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.onclick = function () { state.tab = btn.getAttribute('data-tab'); render(); };
    });
    host.querySelector('#auc_town').onchange = function (e) { state.town = e.target.value; render(); };
    host.querySelector('#auc_type').onchange = function (e) { state.type = e.target.value; render(); };
    host.querySelector('#auc_sort').onchange = function (e) { state.sort = e.target.value; render(); };
    host.querySelector('#auc_q').oninput = function (e) { state.q = e.target.value.toLowerCase(); render(); };
  }

  async function auctionsStart() {
    const host = document.getElementById('auctions_body');
    if (!host) return;
    if (!data.lots.length) {
      host.innerHTML = '<p class="lc-purpose">Loading the catalogue…</p>';
      try {
        const [lotsRes, covRes] = await Promise.all([
          fetch('data/auctions/lots.json?v=' + Date.now()),
          fetch('data/auctions/coverage.json?v=' + Date.now())
        ]);
        if (!lotsRes.ok) throw new Error('No catalogue file yet');
        data = await lotsRes.json();
        coverage = covRes.ok ? await covRes.json() : null;
      } catch (e) {
        host.innerHTML = '<p class="lc-purpose">No catalogue has been collected yet. The scheduled read has not written a file.</p>';
        return;
      }
    }
    render();
  }
  window.auctionsStart = auctionsStart;
})();
