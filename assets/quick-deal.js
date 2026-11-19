/* Quick model on the Deal tab. Inputs stay in this browser. Sums come from QuickModel only. */
(function () {
  'use strict';
  if (typeof document === 'undefined' || document.getElementById('quick_model')) return;
  const body = document.getElementById('deal_body');
  if (!body || !document.getElementById('deal_view') || !window.QuickModel) return;
  const KEY = 'ed_quick_model';
  const DEFAULTS = {name: '', route: 'LHA', basis: 'price', price: '', niyPct: '', rent1: '', opexPct: '', growthPct: '', costsPct: '6.8', ltvPct: '50', ratePct: '6.5', entryMonth: '', exitMonth: '', exitYieldPct: '6', saleCostsPct: '2'};
  const ROUTES = ['LHA', 'Council lease', 'Home Office provider', 'Mack Living', 'Office', 'Other'];
  let state = Object.assign({}, DEFAULTS);
  try { state = Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (error) { /* private mode */ }
  let config = null;
  const Q = window.QuickModel;
  function thisMonth() {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/London', year: 'numeric', month: '2-digit'}).format(new Date()).split('-');
    return parts[0] + '-' + parts[1];
  }
  // Fill the two dates when they are blank: entry this month, exit five years on (or the old hold in years, if one was saved).
  function seedDates() {
    if (!Number.isFinite(Q.monthIndex(state.entryMonth))) state.entryMonth = thisMonth();
    if (!Number.isFinite(Q.monthIndex(state.exitMonth))) {
      const years = Math.round(Q.num(state.holdYears));
      state.exitMonth = Q.monthText(Q.monthIndex(state.entryMonth) + (years >= 1 && years <= 40 ? years : 5) * 12);
    }
    delete state.holdYears;
  }
  seedDates();

  const style = document.createElement('style');
  style.textContent = '#quick_model{background:#fff;border-radius:16px;padding:20px 22px;margin:16px auto;width:calc(100% - 56px);box-sizing:border-box;color:#021a2b;font-size:15px}' +
    '#quick_model h2{margin:2px 0 4px;font-size:20px}#quick_model .qm-k{margin:0;font-size:12px;color:#5b6472}#quick_model .qm-sub{margin:0 0 14px;color:#5b6472;font-size:13px}' +
    '.qm-cols{display:grid;grid-template-columns:minmax(360px,540px) minmax(0,1fr);gap:28px;align-items:start}' +
    '.qm-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 12px}.qm-grid label{display:block;font-size:12px;line-height:1.3;color:#5b6472}' +
    '#quick_model .qm-grid input,#quick_model .qm-grid select{display:block;width:100%;box-sizing:border-box;margin:3px 0 0;height:36px;min-height:0;padding:4px 10px;border:1px solid #d5dbe3;border-radius:8px;font:inherit;font-size:14px;color:#021a2b;background-color:#fff}' +
    '.qm-date{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.15fr);gap:4px}.qm-months{margin-top:10px}.qm-months summary{cursor:pointer;font-size:13px;color:#021a2b;padding:4px 0}' +
    '.qm-h{grid-column:1/-1;margin:8px 0 -2px;font-size:13px;font-weight:600;color:#021a2b}' +
    '.qm-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0}.qm-tile{background:#f1f3f6;border-radius:10px;padding:10px 12px;min-width:0}' +
    '.qm-tile span{display:block;font-size:12px;color:#5b6472}.qm-tile b{display:block;font-size:19px;margin-top:2px;overflow-wrap:anywhere}.qm-tile small{display:block;font-size:12px;color:#5b6472;margin-top:2px}' +
    '.qm-wrap{overflow-x:auto;margin-top:14px}.qm-table{border-collapse:collapse;width:100%;font-size:13px;font-variant-numeric:tabular-nums}' +
    '.qm-table th,.qm-table td{padding:5px 10px;text-align:right;border-bottom:1px solid #e9edf2;white-space:nowrap}.qm-table th:first-child,.qm-table td:first-child{text-align:left}' +
    '.qm-table thead th{font-size:12px;color:#5b6472;font-weight:600}.qm-pass{color:#0a6b3d;font-weight:600}.qm-fail{color:#b3261e;font-weight:600}' +
    '.qm-note{margin:12px 0 0;font-size:12px;color:#5b6472}.qm-need{margin:0;padding:12px;border-radius:10px;background:#fff8e6;font-size:14px}' +
    '.qm-bar{display:flex;gap:8px;justify-content:flex-start;margin-top:12px}#quick_model .qm-bar button{min-height:0;height:34px;border:1px solid #d5dbe3;background:#fff;border-radius:999px;padding:0 14px;font:inherit;font-size:13px;cursor:pointer;color:#021a2b}' +
    '@media(max-width:1100px){.qm-cols{grid-template-columns:minmax(0,1fr);gap:16px}.qm-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}' +
    '@media(max-width:700px){#quick_model{width:calc(100% - 32px);padding:16px;margin:12px auto}.qm-grid,.qm-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}';
  document.head.appendChild(style);

  const host = document.createElement('section');
  host.id = 'quick_model';
  const view = document.getElementById('deal_view');
  // Other modules fold the sheet below into closed sections, so keep this panel as the first thing in the Deal view.
  function seat() { if (view && view.firstElementChild !== host) view.insertBefore(host, view.firstElementChild); }
  seat();

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c])); }
  function money(value) { return value == null || !Number.isFinite(value) ? 'n/a' : (value < 0 ? '-' : '') + '£' + Math.abs(Math.round(value)).toLocaleString('en-GB'); }
  function pct(value) { return value == null || !Number.isFinite(value) ? 'n/a' : (value * 100).toFixed(1) + '%'; }
  function times(value) { return value == null || !Number.isFinite(value) ? 'n/a' : value.toFixed(2) + 'x'; }
  function field(key, label, hint, mode) {
    return '<label>' + esc(label) + '<input data-k="' + key + '" inputmode="' + (mode || 'decimal') + '" value="' + esc(state[key]) + '" placeholder="' + esc(hint || '') + '" autocomplete="off"></label>';
  }
  function dateField(key, label) {
    const index = Q.monthIndex(state[key]);
    const month = ((index % 12) + 12) % 12;
    const year = Math.floor(index / 12);
    const first = Math.min(year, Math.floor(Q.monthIndex(thisMonth()) / 12) - 2);
    let years = '';
    for (let y = first; y <= Math.max(year, first + 42); y += 1) years += '<option' + (y === year ? ' selected' : '') + '>' + y + '</option>';
    return '<label>' + esc(label) + '<span class="qm-date"><select data-d="' + key + '" data-part="m" aria-label="' + esc(label) + ', month">' +
      Q.MONTHS.map((name, i) => '<option value="' + (i + 1) + '"' + (i === month ? ' selected' : '') + '>' + name + '</option>').join('') +
      '</select><select data-d="' + key + '" data-part="y" aria-label="' + esc(label) + ', year">' + years + '</select></span></label>';
  }
  function limits(hold) {
    if (!config || !window.GatesModel) return null;
    try { return window.GatesModel.thresholds(Object.assign({}, config, {anchors: Object.assign({}, config.anchors, {holdYears: hold})})); } catch (error) { return null; }
  }

  function inputs() {
    const byPrice = state.basis !== 'niy';
    return '<div class="qm-grid">' +
      '<label>Deal name<input data-k="name" inputmode="text" value="' + esc(state.name) + '" placeholder="Optional" autocomplete="off"></label>' +
      '<label>Route<select data-k="route">' + ROUTES.map((item) => '<option' + (item === state.route ? ' selected' : '') + '>' + esc(item) + '</option>').join('') + '</select></label>' +
      '<p class="qm-h">Entry</p>' +
      '<label>Enter the price as<select data-k="basis"><option value="price"' + (byPrice ? ' selected' : '') + '>A price in £</option><option value="niy"' + (byPrice ? '' : ' selected') + '>A net initial yield</option></select></label>' +
      (byPrice ? field('price', 'Purchase price, £', 'For example 1,000,000') : field('niyPct', 'Entry NIY, %', 'For example 6.5')) +
      field('costsPct', 'Purchase costs, % of price', 'Tax, legal and fees') +
      '<p class="qm-h">Income</p>' +
      field('rent1', 'Year one rent, £', 'Whole deal, per year') +
      field('opexPct', 'Opex, % of rent', 'For example 20') +
      field('growthPct', 'Rent growth, % a year', '0 if flat') +
      '<p class="qm-h">Debt</p>' +
      field('ltvPct', 'Loan, % of price', '0 for no debt') +
      field('ratePct', 'Interest rate, %', 'Interest only') +
      '<p class="qm-h">Timing</p>' +
      dateField('entryMonth', 'Entry month') +
      dateField('exitMonth', 'Exit month') +
      '<p class="qm-h">Exit</p>' +
      field('exitYieldPct', 'Exit yield, %', 'For example 6') +
      field('saleCostsPct', 'Sale costs, % of sale', 'Agent, legal and fees') +
      '</div>';
  }

  function results() {
    const out = window.QuickModel.compute(state);
    if (!out.ok) return '<p class="qm-need">Still needed: ' + esc(out.missing.join(', ')) + '. Nothing is assumed for these.</p>';
    const tile = (label, value, small) => '<div class="qm-tile"><span>' + esc(label) + '</span><b>' + esc(value) + '</b>' + (small ? '<small>' + esc(small) + '</small>' : '') + '</div>';
    const tiles = '<div class="qm-tiles">' +
      tile(out.basis === 'niy' ? 'Price this NIY implies' : 'Entry NIY', out.basis === 'niy' ? money(out.price) : pct(out.niy), out.basis === 'niy' ? 'NIY ' + pct(out.niy) + ' after costs' : 'After purchase costs') +
      tile('All-in cost', money(out.allIn), 'Costs ' + money(out.purchaseCosts)) +
      tile('Year one NOI', money(out.noi1), 'Yield on cost ' + pct(out.yieldOnCost)) +
      tile('Equity in', money(out.equity), 'Loan ' + money(out.debt)) +
      tile('Unlevered IRR', pct(out.unleveredIrr)) +
      tile('Levered IRR', pct(out.leveredIrr)) +
      tile('Equity multiple', times(out.multiple), 'Profit ' + money(out.profit)) +
      tile('Exit value', money(out.exitValue), 'Sold ' + out.saleLabel + ' at ' + pct(Q.num(state.exitYieldPct) / 100)) +
      '</div>';
    const head = '<thead><tr><th>Cash flow</th><th>Rent</th><th>Opex</th><th>NOI</th><th>Interest</th><th>Cash after debt</th><th>Sale after loan and costs</th></tr></thead>';
    const line = (name, row) => '<tr><td>' + esc(name) + '</td><td>' + money(row.rent) + '</td><td>' + money(-row.opex) + '</td><td>' + money(row.noi) + '</td><td>' + money(-row.interest) + '</td><td>' + money(row.cash) + '</td><td>' + (row.sale ? money(row.sale) : '') + '</td></tr>';
    const table = '<div class="qm-wrap"><table class="qm-table">' + head + '<tbody>' +
      out.years.map((year) => line('Year ' + year.year + ', ' + year.from + (year.from === year.to ? '' : ' to ' + year.to), year)).join('') + '</tbody></table></div>' +
      '<details class="qm-months"><summary>Show all ' + out.months + ' months</summary><div class="qm-wrap"><table class="qm-table">' + head + '<tbody>' + out.rows.map((row) => line(row.label, row)).join('') + '</tbody></table></div></details>';
    const lim = limits(out.holdYears);
    const checks = window.QuickModel.screen(out, lim);
    const show = (row, value) => row.kind === 'times' ? times(value) : (value == null || !Number.isFinite(value) ? 'n/a' : (value * 100).toFixed(2) + '%');
    const screen = checks.length ? '<div class="qm-wrap"><table class="qm-table"><thead><tr><th>Quick screen</th><th>This deal</th><th>Hurdle</th><th>Result</th></tr></thead><tbody>' + checks.map((row) => '<tr><td>' + esc(row.name) + '</td><td>' + show(row, row.value) + '</td><td>' + (row.kind === 'max' ? 'At most ' : 'At least ') + show(row, row.limit) + '</td><td class="' + (row.pass ? 'qm-pass' : 'qm-fail') + '">' + (row.pass == null ? 'n/a' : row.pass ? 'Pass' : 'Fail') + '</td></tr>').join('') + '</tbody></table></div>' : '';
    return tiles + table + screen +
      '<p class="qm-note">Monthly model, ' + out.months + ' months: in at the start of ' + esc(out.entryLabel) + ', last rent ' + esc(out.exitLabel) + ', sold at the start of ' + esc(out.saleLabel) + '. Rent, opex and interest are a twelfth of the yearly figure each month. Rent growth steps up on each anniversary of entry. Interest only loan. Exit value is the twelve months of NOI after the sale divided by the exit yield. IRR is the monthly rate compounded to a year. Year one cash on cash ' + pct(out.cashOnCash) + ', interest cover ' + times(out.interestCover) + ', loan at exit ' + pct(out.exitLtv) + ' of value, break even exit yield ' + pct(out.breakEvenYield) + '.' +
      (checks.length ? ' The quick screen covers the numeric hurdles only. The lease, operator and evidence hurdles are in the full test below.' : '') + ' Screening research, not an investment recommendation.</p>';
  }

  function paintResults() { const el = host.querySelector('#qm_out'); if (el) el.innerHTML = results(); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (error) { /* private mode */ } }
  function paint() {
    host.innerHTML = '<p class="qm-k">Quick model</p><h2>Price, rent, debt and exit</h2><p class="qm-sub">Works for any income deal: LHA, a council or Home Office lease, Mack Living or an office. What you type stays in this browser.</p>' +
      '<div class="qm-cols"><div>' + inputs() + '<div class="qm-bar"><button type="button" id="qm_clear">Clear</button></div></div><div id="qm_out">' + results() + '</div></div>';
    host.querySelectorAll('[data-k]').forEach((el) => {
      const key = el.dataset.k;
      const on = () => { state[key] = el.value; save(); if (key === 'basis') paint(); else paintResults(); };
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', on);
    });
    host.querySelectorAll('[data-d]').forEach((el) => {
      el.addEventListener('change', () => {
        const key = el.dataset.d;
        const month = host.querySelector('[data-d="' + key + '"][data-part="m"]').value;
        const year = host.querySelector('[data-d="' + key + '"][data-part="y"]').value;
        state[key] = year + '-' + String(month).padStart(2, '0');
        save();
        paintResults();
      });
    });
    host.querySelector('#qm_clear').onclick = () => { state = Object.assign({}, DEFAULTS); seedDates(); save(); paint(); };
  }

  paint();
  fetch('data/market-entry/gates.json').then((response) => response.ok ? response.json() : null).then((data) => { config = data; paintResults(); }).catch(() => {});
  const previous = window.viewMode;
  if (typeof previous === 'function') {
    window.viewMode = function (mode) {
      const out = previous.apply(this, arguments);
      if (mode === 'deal') { seat(); setTimeout(seat, 400); }
      return out;
    };
  }
  setTimeout(seat, 1500);
  window.QuickDeal = {paint, state: () => Object.assign({}, state)};
})();
