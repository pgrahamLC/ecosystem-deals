/* Quick model on the Deal tab. Inputs stay in this browser. Sums come from QuickModel only. */
(function () {
  'use strict';
  if (typeof document === 'undefined' || document.getElementById('quick_model')) return;
  const body = document.getElementById('deal_body');
  if (!body || !document.getElementById('deal_view') || !window.QuickModel) return;
  const KEY = 'ed_quick_model';
  const DEFAULTS = {name: '', route: 'LHA', basis: 'price', price: '', niyPct: '', rent1: '', opexPct: '', growthPct: '', costsPct: '6.8', ltvPct: '50', ratePct: '6.5', loanType: 'io', termYears: '25', entryMonth: '', exitMonth: '', exitYieldPct: '6', saleCostsPct: '2', reviewEvery: '', reviewType: 'off', reviewUpliftPct: '', reviewCapPct: '', reviewCollarPct: '', rentFreeMonths: '', rentFreeOpex: 'off', headlease: 'off', headleaseRent: '', headleaseEvery: '', headleaseUpliftPct: '', headleaseTerm: '', groundBasis: 'off', groundRent: '', groundPct: '', groundEvery: '', groundUpliftPct: '', scBasis: 'off', scPsf: '', scTotal: '', scRecoverPct: '', nia: '', gia: '', capexBasis: 'amount', capexAmount: '', capexPct: '', renoPsf: '', renoArea: 'gia', capexFrom: '', capexTo: '', acqAmount: '', acqFeePct: '', acqExitFeePct: '', acqDraw: '', acqRepay: '', acqInterest: 'serviced', acqRefiMonth: '', acqRefiAmount: '', acqRefiLtvPct: '', acqRefiRatePct: '', acqRefiFeePct: '', devBasis: 'off', devAmount: '', devLtcPct: '', devRatePct: '', devFeePct: '', devExitFeePct: '', devDrawFrom: '', devDrawTo: '', devRepay: '', devInterest: 'rolled'};
  const ROUTES = ['LHA', 'Council lease', 'Home Office provider', 'Mack Living', 'Office', 'Other'];
  let state = Object.assign({}, DEFAULTS);
  let holdOpen = false;
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
    '.qm-table th,.qm-table td{padding:5px 8px;text-align:right;border-bottom:1px solid #e9edf2;white-space:nowrap}.qm-table th:first-child,.qm-table td:first-child{text-align:left}' +
    '.qm-table td small{display:block;font-size:11px;color:#5b6472}@media(min-width:1101px) and (max-width:1560px){.qm-cols{grid-template-columns:minmax(300px,380px) minmax(0,1fr);gap:22px}.qm-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.qm-table th,.qm-table td{padding:5px 5px}}' +
    '.qm-table thead th{font-size:12px;color:#5b6472;font-weight:600}.qm-pass{color:#0a6b3d;font-weight:600}.qm-fail{color:#b3261e;font-weight:600}' +
    '.qm-note{margin:12px 0 0;font-size:12px;color:#5b6472}.qm-need{margin:0;padding:12px;border-radius:10px;background:#fff8e6;font-size:14px}' +
    '.qm-bar{display:flex;gap:8px;justify-content:flex-start;margin-top:12px}#quick_model .qm-bar button{min-height:0;height:34px;border:1px solid #d5dbe3;background:#fff;border-radius:999px;padding:0 14px;font:inherit;font-size:13px;cursor:pointer;color:#021a2b}' +
    '@media(max-width:1100px){.qm-cols{grid-template-columns:minmax(0,1fr);gap:16px}.qm-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}' +
    '.qm-more{grid-column:1/-1;margin-top:4px}.qm-more>summary{cursor:pointer;font-size:14px;font-weight:600;color:#021a2b;padding:12px 0}' +
    '.qm-hint{grid-column:1/-1;margin:0 0 4px;font-size:12px;color:#5b6472;line-height:1.45}' +
    '.qm-psf{margin:10px 0 0;font-size:13px;line-height:1.45;color:#021a2b}' +
    '@media(max-width:700px){#quick_model{width:calc(100% - 32px);padding:16px;margin:12px auto}.qm-grid,.qm-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.qm-more>summary{padding:14px 0}}';
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
  function psf(value) { return value == null || !Number.isFinite(value) ? 'n/a' : '£' + value.toLocaleString('en-GB', {minimumFractionDigits: 2, maximumFractionDigits: 2}); }
  function field(key, label, hint, mode) {
    return '<label>' + esc(label) + '<input data-k="' + key + '" inputmode="' + (mode || 'decimal') + '" value="' + esc(state[key] == null ? '' : state[key]) + '" placeholder="' + esc(hint || '') + '" autocomplete="off"></label>';
  }
  function choice(key, label, options) {
    return '<label>' + esc(label) + '<select data-k="' + key + '">' + options.map(([value, text]) => '<option value="' + esc(value) + '"' + (state[key] === value ? ' selected' : '') + '>' + esc(text) + '</option>').join('') + '</select></label>';
  }
  function leaseOpen() {
    if (holdOpen) return true;
    const picked = state.reviewType === 'fixed' || state.reviewType === 'index' || state.rentFreeOpex === 'passing' || state.headlease === 'on' || state.groundBasis === 'pa' || state.groundBasis === 'pct' || state.scBasis === 'psf' || state.scBasis === 'total' || state.capexBasis === 'pct' || state.devBasis === 'amount' || state.devBasis === 'ltc' || state.acqInterest === 'rolled';
    const typed = ['rentFreeMonths', 'reviewEvery', 'nia', 'gia', 'capexAmount', 'renoPsf', 'capexFrom', 'acqAmount', 'acqFeePct', 'acqExitFeePct', 'acqDraw', 'acqRepay', 'acqRefiMonth', 'devAmount', 'devLtcPct', 'devDrawFrom'].some((key) => String(state[key] == null ? '' : state[key]).trim() !== '');
    return picked || typed;
  }
  function leaseInputs() {
    const reviewOn = state.reviewType === 'fixed' || state.reviewType === 'index';
    const indexed = state.reviewType === 'index';
    const ground = state.groundBasis;
    const sc = state.scBasis;
    const dev = state.devBasis;
    return '<details class="qm-more"' + (leaseOpen() ? ' open' : '') + '><summary>Lease, areas, capex and debt timing</summary><div class="qm-grid">' +
      '<p class="qm-hint">Left blank, none of this changes the result. Month 1 is the entry month. A blank drawdown is at purchase, before month 1. A blank repayment is taken from the sale.</p>' +
      '<p class="qm-h">Rent review</p>' +
      choice('reviewType', 'Rent review', [['off', 'Off, use annual growth'], ['fixed', 'Fixed uplift'], ['index', 'RPI or CPI']]) +
      (reviewOn ? field('reviewEvery', 'Years between reviews', 'For example 5') + field('reviewUpliftPct', indexed ? 'Assumed RPI or CPI, % a year' : 'Uplift at each review, %', indexed ? 'For example 3' : 'For example 10') + field('reviewCapPct', indexed ? 'Cap, % a year' : 'Cap on the uplift, %', 'Optional') + field('reviewCollarPct', indexed ? 'Collar, % a year' : 'Collar on the uplift, %', 'Optional. 0 is upwards only') : '') +
      '<p class="qm-hint">A review replaces the annual growth box. On an RPI or CPI review the cap and collar limit the annual rate, which is then compounded to the review. On a fixed uplift they limit the increase at the review itself.</p>' +
      field('rentFreeMonths', 'Rent-free at the start, months', '0 if none') +
      choice('rentFreeOpex', 'Opex during rent-free', [['off', 'Nil, it is a % of rent received'], ['passing', 'Accrue on the passing rent']]) +
      '<p class="qm-hint">Opex is a percentage of the rent received, so a rent-free month has no opex unless you accrue it on the passing rent. Headlease rent, a fixed ground rent and unrecovered service charge are paid either way.</p>' +
      '<p class="qm-h">Headlease</p>' +
      choice('headlease', 'Headlease', [['off', 'Off, freehold'], ['on', 'Leasehold']]) +
      (state.headlease === 'on' ? field('headleaseRent', 'Headlease rent, £ a year', 'For example 12,000') + field('headleaseEvery', 'Headlease review every, years', 'Blank = flat') + field('headleaseUpliftPct', 'Headlease uplift, %', 'Fixed uplift at each review') + field('headleaseTerm', 'Unexpired term, years', 'Blank = still running at the sale') : '') +
      '<p class="qm-hint">Headlease rent is deducted while the lease runs, including in a rent-free period. When the unexpired term ends, the occupational rent stops and there is no freehold sale value. A blank term is still running at the sale and is valued on the exit yield.</p>' +
      '<p class="qm-h">Ground rent</p>' +
      choice('groundBasis', 'Ground rent', [['off', 'Off'], ['pa', '£ a year'], ['pct', '% of rent']]) +
      (ground === 'pa' ? field('groundRent', 'Ground rent, £ a year', 'For example 1,200') + field('groundEvery', 'Ground rent review every, years', 'Blank = flat') + field('groundUpliftPct', 'Ground rent uplift, %', 'Fixed uplift at each review') : '') +
      (ground === 'pct' ? field('groundPct', 'Ground rent, % of rent', 'For example 5') : '') +
      '<p class="qm-hint">' + (ground === 'pct' ? 'This percentage is of the passing rent that month, including after a rent review. It is not increased a second time. It is zero during rent-free.' : 'A percentage is of the passing rent, including after a rent review, and is not increased a second time. A yearly amount is paid anyway, including during rent-free, and can step up at its own review.') + '</p>' +
      '<p class="qm-h">Service charge</p>' +
      choice('scBasis', 'Service charge', [['off', 'Off'], ['psf', '£ per sq ft a year'], ['total', '£ a year, total']]) +
      (sc === 'psf' ? field('scPsf', 'Service charge, £ per sq ft a year', 'On the net internal area') : '') +
      (sc === 'total' ? field('scTotal', 'Service charge, £ a year', 'The whole building') : '') +
      (sc === 'off' ? '' : field('scRecoverPct', 'Recoverable from tenants, %', 'Blank = none recovered')) +
      '<p class="qm-hint">The share tenants do not pay is a cost. Per sq ft uses the net internal area.</p>' +
      '<p class="qm-h">Areas</p>' +
      field('nia', 'Net internal area, sq ft', 'NIA') +
      field('gia', 'Gross internal area, sq ft', 'GIA') +
      '<p class="qm-h">Capex</p>' +
      choice('capexBasis', 'Capex entered as', [['amount', 'A £ amount'], ['pct', '% of the purchase price']]) +
      (state.capexBasis === 'pct' ? field('capexPct', 'Capex, % of purchase price', 'For example 10') : field('capexAmount', 'Capex, £', 'For example 100,000')) +
      field('renoPsf', 'Renovation, £ per sq ft', 'Added to the amount above') +
      choice('renoArea', 'Apply renovation to', [['gia', 'Gross internal area'], ['nia', 'Net internal area']]) +
      field('capexFrom', 'Capex from month', 'Blank = all at purchase') +
      field('capexTo', 'Capex to month', 'Blank = all at purchase') +
      '<p class="qm-hint">A from and to month spreads the capex evenly. It is included in the all-in cost, the yield on cost and the cash flow.</p>' +
      '<p class="qm-h">Purchase loan timing</p>' +
      '<p class="qm-hint">The loan percentage, rate and interest-only or repayment choice above still apply. An amount here is used instead of that percentage.</p>' +
      field('acqAmount', 'Purchase loan amount, £', 'Blank = use the % of price') +
      field('acqFeePct', 'Arrangement fee, %', 'Of the loan, at drawdown') +
      field('acqExitFeePct', 'Exit fee, %', 'Of the loan amount, when it is repaid') +
      field('acqDraw', 'Drawdown month', 'Blank = at purchase') +
      field('acqRepay', 'Repayment month', 'Blank = at the sale') +
      choice('acqInterest', 'Purchase loan interest', [['serviced', 'Serviced each month'], ['rolled', 'Rolled up into the balance']]) +
      field('acqRefiMonth', 'Refinance in month', 'Blank = no refinance') +
      field('acqRefiAmount', 'New loan amount, £', 'Blank = use the % below') +
      field('acqRefiLtvPct', 'New loan, % of price', 'Used if the amount is blank') +
      field('acqRefiRatePct', 'New loan rate, %', 'Blank = the purchase loan rate') +
      field('acqRefiFeePct', 'New loan arrangement fee, %', 'At the refinance') +
      '<p class="qm-hint">Rolled-up interest is added to the balance instead of being paid each month. A refinance, at the start of that month, repays this loan and draws the new one. A blank new rate uses the purchase loan rate, and the note says so. A typed 0% charges no interest. The repayment schedule above applies only when the loan is drawn at purchase, interest is serviced and there is no refinance.</p>' +
      '<p class="qm-h">Construction loan</p>' +
      choice('devBasis', 'Construction loan', [['off', 'Off'], ['amount', 'A £ amount'], ['ltc', '% of capex (loan to cost)']]) +
      (dev === 'amount' ? field('devAmount', 'Construction loan, £', 'For example 180,000') : '') +
      (dev === 'ltc' ? field('devLtcPct', 'Loan to cost, % of capex', 'For example 80') : '') +
      (dev === 'off' ? '' : field('devRatePct', 'Construction rate, %', 'Required. Blank is not 0%') + field('devFeePct', 'Construction arrangement fee, %', 'At the first draw') + field('devExitFeePct', 'Construction exit fee, %', 'When the loan is repaid') + field('devDrawFrom', 'Draw from month', 'Blank = follow the capex') + field('devDrawTo', 'Draw to month', 'Blank = follow the capex') + field('devRepay', 'Construction repayment month', 'Blank = at the sale') + choice('devInterest', 'Construction interest', [['rolled', 'Rolled up into the balance'], ['serviced', 'Serviced each month']])) +
      '<p class="qm-hint">Draws follow the capex in the draw window. If there is no capex in that window, the draws are equal. Rolled-up interest is not paid monthly. It is repaid with the balance. A blank construction rate stops the model. It is not treated as 0%, and it is not copied from the purchase loan. Type 0 only if the loan really charges nothing.</p>' +
      '</div></details>';
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
      field('opexPct', 'Opex, % of rent', 'Of the rent received') +
      field('growthPct', 'Rent growth, % a year', '0 if flat') +
      '<p class="qm-h">Debt</p>' +
      field('ltvPct', 'Loan, % of price', '0 for no debt') +
      field('ratePct', 'Interest rate, %', 'Yearly rate') +
      '<label>Repayment<select data-k="loanType"><option value="io"' + (state.loanType === 'amort' ? '' : ' selected') + '>Interest only</option><option value="amort"' + (state.loanType === 'amort' ? ' selected' : '') + '>Repaid over a term</option></select></label>' +
      (state.loanType === 'amort' ? field('termYears', 'Loan term, years', 'For example 25') : '') +
      '<p class="qm-h">Timing</p>' +
      dateField('entryMonth', 'Entry month') +
      dateField('exitMonth', 'Exit month') +
      '<p class="qm-h">Exit</p>' +
      field('exitYieldPct', 'Exit yield, %', 'For example 6') +
      field('saleCostsPct', 'Sale costs, % of sale', 'Agent, legal and fees') +
      leaseInputs() +
      '</div>';
  }

  function areaLine(out) {
    const area = out.areas;
    if (!area) return '';
    const bits = [];
    if (area.nia) bits.push('NIA ' + Math.round(area.nia).toLocaleString('en-GB') + ' sq ft');
    if (area.gia) bits.push('GIA ' + Math.round(area.gia).toLocaleString('en-GB') + ' sq ft');
    if (area.efficiency != null) bits.push('net to gross ' + (area.efficiency * 100).toFixed(1) + '%');
    if (area.rentPsf != null) bits.push('passing rent ' + psf(area.rentPsf) + ' per sq ft');
    if (area.pricePsf != null) bits.push('price ' + psf(area.pricePsf) + ' per sq ft NIA');
    if (area.giaPricePsf != null) bits.push(psf(area.giaPricePsf) + ' per sq ft GIA');
    if (area.capexPsf != null && out.totalCapex > 0.5) bits.push('capex ' + psf(area.capexPsf) + ' per sq ft NIA');
    if (area.noiPsf != null) bits.push('year one NOI ' + psf(area.noiPsf) + ' per sq ft NIA');
    return '<p class="qm-psf">' + esc(bits.join(' · ')) + '</p>';
  }
  function leaseNote(out) {
    const flags = out.flags;
    if (!flags || !flags.any) return '';
    const bits = [];
    const free = Math.round(Q.num(state.rentFreeMonths));
    if (flags.rentFree) bits.push('The first ' + free + ' month' + (free === 1 ? ' is' : 's are') + ' rent-free, then the full passing rent. ' + (state.rentFreeOpex === 'passing' ? 'Opex in those months is the opex percentage of the passing rent, so the void costs still run.' : 'Opex is a percentage of the rent received, so it is nil in those months. Headlease rent, a fixed ground rent and unrecovered service charge still run.'));
    if (flags.review) {
      const limited = String(state.reviewCapPct || '').trim() || String(state.reviewCollarPct || '').trim();
      bits.push(state.reviewType === 'index'
        ? 'Rent is reviewed every ' + state.reviewEvery + ' years by compounding the assumed RPI or CPI' + (limited ? ', after the cap and collar' : '') + '. The annual growth box is not added on top.'
        : 'Rent steps up by the fixed uplift every ' + state.reviewEvery + ' years' + (limited ? ', limited by the cap and collar' : '') + '. The annual growth box is not added on top.');
    }
    if (flags.headlease || out.exitBasis === 'expired' || out.exitBasis === 'remainder') {
      if (out.exitBasis === 'expired') bits.push((flags.headlease ? 'Headlease rent is deducted while the lease runs. ' : '') + 'Income stops when the headlease ends, and the exit value is nil.');
      else if (out.exitBasis === 'remainder') bits.push('The headlease runs out within a year of the sale, so the exit value is the income until then, not a yield.');
      else bits.push('Headlease rent is deducted from income' + (String(state.headleaseTerm || '').trim() ? '. The term still covers the year after the sale, so the exit is a yield on that income' : '. No unexpired term is set, so the lease is treated as still running at the sale') + '.');
    }
    if (flags.ground) bits.push(state.groundBasis === 'pct' ? 'Ground rent is that percentage of the passing rent, including after a review, and is deducted. The percentage itself does not step up.' : 'Ground rent is deducted every month, including during a rent-free period.');
    if (flags.service) bits.push('Only the service charge tenants do not pay is a cost.');
    if (flags.capex) bits.push('Capex of ' + money(out.totalCapex) + (String(state.capexFrom || '').trim() ? ' is spread from month ' + state.capexFrom + ' to month ' + state.capexTo : ' is paid at purchase') + '. It is in the all-in cost and in its own cash flow column, so cash after debt does not repeat it.');
    if (flags.dev) bits.push('The construction loan is ' + money(out.devDebt) + (out.ltc != null ? ' (' + pct(out.ltc) + ' of capex)' : '') + '. Draws follow the capex. Peak debt is ' + money(out.peakDebt) + ', ' + pct(out.peakLtv) + ' of the price, against a purchase loan of ' + pct(out.ltv) + '. Its interest of ' + money(out.finance.devInterest) + (state.devInterest === 'serviced' ? ' is paid each month.' : ' is rolled up and paid with the balance.'));
    if (flags.refi) bits.push('The purchase loan is refinanced at the start of month ' + state.acqRefiMonth + (out.refiRateAssumed ? '. The new rate was blank, so the purchase loan rate is used' : '') + '.');
    if (state.acqInterest === 'rolled' && out.debt > 0) bits.push('Purchase-loan interest of ' + money(out.finance.acqInterest) + ' is rolled up into the balance.');
    if (out.finance && (flags.dev || flags.fees || flags.rolled)) bits.push('Total finance cost is ' + money(out.finance.total) + '. Purchase-loan interest is ' + money(out.finance.acqInterest) + ' and fees are ' + money(out.finance.acqFees + out.finance.devFees) + '.');
    if (flags.dev || flags.rolled) bits.push('Interest cover uses the interest accrued on both loans, including interest rolled up. Cash debt cover uses the cash interest and any scheduled principal, not a bullet repayment.');
    return bits.join(' ');
  }
  function results() {
    const out = window.QuickModel.compute(state);
    if (!out.ok) {
      const rateNote = out.missing.indexOf('construction loan rate') >= 0 ? ' A blank construction rate is not taken as 0%.' : '';
      return '<p class="qm-need">Still needed: ' + esc(out.missing.join(', ')) + '. Nothing is assumed for these.' + rateNote + '</p>';
    }
    const flags = out.flags || {};
    const tile = (label, value, small) => '<div class="qm-tile"><span>' + esc(label) + '</span><b>' + esc(value) + '</b>' + (small ? '<small>' + esc(small) + '</small>' : '') + '</div>';
    let equitySmall = 'Loan ' + money(out.debt);
    if (out.devDebt > 0.5) equitySmall += ' · development ' + money(out.devDebt);
    if (out.equityTotal - out.equity > 1) equitySmall += ' · total cheques ' + money(out.equityTotal);
    let costSmall = 'Costs ' + money(out.purchaseCosts);
    if (out.totalCapex > 0.5) costSmall += ' · capex ' + money(out.totalCapex);
    let exitSmall = out.exitBasis === 'expired' ? 'Nil. The headlease has ended' : out.exitBasis === 'remainder' ? 'Income until the headlease ends' : 'Sold ' + out.saleLabel + ' at ' + pct(Q.num(state.exitYieldPct) / 100);
    if (flags.any && out.exitBasis === 'yield') exitSmall += ' · exit NOI ' + money(out.exitNoi);
    let more = '';
    if (flags.any) {
      more += tile('Finance cost', money(out.finance.total), 'Purchase interest ' + money(out.finance.acqInterest) + (out.devDebt > 0.5 ? ' · development ' + money(out.finance.devInterest) : '') + (out.finance.acqFees + out.finance.devFees > 0.5 ? ' · fees ' + money(out.finance.acqFees + out.finance.devFees) : ''));
      if (out.totalCapex > 0.5) more += tile('Profit on cost', pct(out.profitOnCost), 'Unlevered profit divided by all-in cost');
      if (Math.abs(out.yearEquityCash - out.yearOperatingCash) > 1) more += tile('Year one equity cash', money(out.yearEquityCash), 'Cash after debt, less capex. Cash on cash leaves capex and bullet repayments out');
    }
    const tiles = '<div class="qm-tiles">' +
      tile(out.basis === 'niy' ? 'Price this NIY implies' : 'Entry NIY', out.basis === 'niy' ? money(out.price) : pct(out.niy), out.basis === 'niy' ? 'NIY ' + pct(out.niy) + ' after costs' : 'After purchase costs') +
      tile('All-in cost', money(out.allIn), costSmall) +
      tile('Year one NOI', money(out.noi1), 'Yield on cost ' + pct(out.yieldOnCost)) +
      tile('Equity in', money(out.equity), equitySmall) +
      tile('Unlevered IRR', pct(out.unleveredIrr)) +
      tile('Levered IRR', pct(out.leveredIrr)) +
      tile('Equity multiple', times(out.multiple), 'Profit ' + money(out.profit)) +
      tile('Exit value', money(out.exitValue), exitSmall) +
      more +
      '</div>';
    const amort = out.loanType === 'amort';
    const showPrincipal = amort || out.rows.some((row) => row.principal > 0.5);
    const showBalance = amort || !!flags.dev;
    const column = (heading, cell) => ({heading, cell});
    const columns = [column('Rent', (row) => money(row.rent)), column('Opex', (row) => money(-row.opex))];
    if (flags.headlease) columns.push(column('Headlease', (row) => money(-row.headlease)));
    if (flags.ground) columns.push(column('Ground rent', (row) => money(-row.ground)));
    if (flags.service) columns.push(column('Service charge', (row) => money(-row.service)));
    columns.push(column('NOI', (row) => money(row.noi)));
    if (flags.capex) columns.push(column('Capex', (row) => row.capex ? money(-row.capex) : ''));
    if (flags.dev || flags.refi || flags.timing) columns.push(column('Drawdown', (row) => row.draw ? money(row.draw) : ''));
    if (flags.dev) {
      columns.push(column('Purchase interest', (row) => money(-row.acqInterest)));
      columns.push(column('Development interest', (row) => money(-row.devInterest)));
    } else columns.push(column('Interest', (row) => money(-row.interest)));
    if (flags.fees) columns.push(column('Fees', (row) => row.fee ? money(-row.fee) : ''));
    if (showPrincipal) columns.push(column('Loan repaid', (row) => money(-row.principal)));
    columns.push(column(flags.capex ? 'Cash after debt, before capex' : 'Cash after debt', (row) => money(row.cash)));
    if (showBalance) columns.push(column('Loan left', (row) => money((row.balance || 0) + (row.devBalance || 0))));
    columns.push(column('Net sale', (row) => (row.sale || row.month === out.months || row.year === out.years.length) ? money(row.sale) : ''));
    const head = '<thead><tr><th>Cash flow</th>' + columns.map((item) => '<th>' + esc(item.heading) + '</th>').join('') + '</tr></thead>';
    const line = (name, row, dates) => '<tr><td>' + esc(name) + (dates ? '<small>' + esc(dates) + '</small>' : '') + '</td>' + columns.map((item) => '<td>' + item.cell(row) + '</td>').join('') + '</tr>';
    const table = '<div class="qm-wrap"><table class="qm-table">' + head + '<tbody>' +
      out.years.map((year) => line('Year ' + year.year, year, year.from + (year.from === year.to ? '' : ' to ' + year.to))).join('') + '</tbody></table></div>' +
      '<details class="qm-months"><summary>Show all ' + out.months + ' months</summary><div class="qm-wrap"><table class="qm-table">' + head + '<tbody>' + out.rows.map((row) => line(row.label, row)).join('') + '</tbody></table></div></details>';
    const lim = limits(out.holdYears);
    const checks = window.QuickModel.screen(out, lim);
    const show = (row, value) => row.kind === 'times' ? times(value) : (value == null || !Number.isFinite(value) ? 'n/a' : (value * 100).toFixed(2) + '%');
    const screen = checks.length ? '<div class="qm-wrap"><table class="qm-table"><thead><tr><th>Quick screen</th><th>This deal</th><th>Hurdle</th><th>Result</th></tr></thead><tbody>' + checks.map((row) => '<tr><td>' + esc(row.name) + '</td><td>' + show(row, row.value) + '</td><td>' + (row.kind === 'max' ? 'At most ' : 'At least ') + show(row, row.limit) + '</td><td class="' + (row.pass ? 'qm-pass' : 'qm-fail') + '">' + (row.pass == null ? 'n/a' : row.pass ? 'Pass' : 'Fail') + '</td></tr>').join('') + '</tbody></table></div>' : '';
    const warn = out.warnings && out.warnings.length ? '<p class="qm-need">' + esc(out.warnings.join(' ')) + '</p>' : '';
    const extra = leaseNote(out);
    const debtSentence = flags.any
      ? (amort ? 'Purchase loan repaid over ' + (out.termMonths / 12) + ' years at ' + money(out.payment) + ' a month, with ' + money(out.loanAtExitAcq) + ' of it still owed at the sale.' : (state.acqInterest === 'rolled' ? 'Purchase-loan interest is rolled up and paid when that loan is repaid.' : 'Interest-only purchase loan. Any balance is repaid at the sale unless a repayment month is set.'))
      : (amort ? 'Loan repaid over ' + (out.termMonths / 12) + ' years at ' + money(out.payment) + ' a month, with ' + money(out.loanAtExit) + ' still owed and repaid at the sale.' : 'Interest only loan, repaid in full at the sale.');
    const rhythm = flags.review || flags.rentFree ? 'Rent is monthly. Opex is the opex percentage of the rent received' + (flags.rentFree && state.rentFreeOpex !== 'passing' ? ', so a rent-free month has no opex' : '') + '. ' : 'Rent, opex and interest are a twelfth of the yearly figure each month. Rent growth steps up on each anniversary of entry. ';
    const netSaleText = 'Net sale is the sale price less sale costs, the loan still owed' + (out.exitFees > 0.5 ? ' and lender exit fees of ' + money(out.exitFees) : ' and any lender exit fee') + '.';
    const exitText = out.exitBasis === 'expired'
      ? 'The headlease has ended by the sale, so the exit value is nil rather than a yield. ' + netSaleText
      : out.exitBasis === 'remainder'
        ? 'The headlease runs out within a year of the sale, so the exit value is the income until it ends, not a yield. ' + netSaleText
        : netSaleText + ' Exit value is the twelve months of NOI after the sale divided by the exit yield.';
    const cashGap = Math.abs(out.yearEquityCash - out.yearOperatingCash) > 1;
    const coverDiff = !amort && out.debtCover != null && out.interestCover != null && Math.abs(out.debtCover - out.interestCover) > 1e-4;
    const tail = cashGap || coverDiff
      ? (cashGap ? 'Year one cash on cash is ' + pct(out.cashOnCash) + '. That is year-one NOI less cash debt service, divided by the day-one equity. It leaves out capex, fees, loan draws and bullet repayments. Year-one equity cash is ' + money(out.yearEquityCash) + '. ' : 'Year one cash on cash ' + pct(out.cashOnCash) + '. ') +
        (amort ? 'Debt service cover ' + times(out.debtCover) + ' (interest alone ' + times(out.interestCover) + '). ' : coverDiff ? 'Interest cover ' + times(out.interestCover) + ' is accrued interest on both loans, including interest that is rolled up. Cash debt cover ' + times(out.debtCover) + ' is the cash interest and any scheduled principal. ' : 'Interest cover ' + times(out.interestCover) + '. ') +
        'Loan at exit ' + pct(out.exitLtv) + ' of value. Break even exit yield ' + pct(out.breakEvenYield) + '.'
      : 'Year one cash on cash ' + pct(out.cashOnCash) + ', ' + (amort ? 'debt service cover ' + times(out.debtCover) + ' (interest alone ' + times(out.interestCover) + ')' : 'interest cover ' + times(out.interestCover)) + ', loan at exit ' + pct(out.exitLtv) + ' of value, break even exit yield ' + pct(out.breakEvenYield) + '.';
    return warn + tiles + areaLine(out) + table + screen +
      '<p class="qm-note">Monthly model, ' + out.months + ' months: in at the start of ' + esc(out.entryLabel) + ', last rent ' + esc(out.exitLabel) + ', sold at the start of ' + esc(out.saleLabel) + '. ' + rhythm + debtSentence + ' ' + exitText + ' IRR is the monthly rate compounded to a year. ' + tail +
      (checks.length ? ' The quick screen covers the numeric hurdles only. The lease, operator and evidence hurdles are in the full test below.' : '') + (extra ? ' ' + extra : '') + ' Screening research, not an investment recommendation.</p>';
  }

  function paintResults() { const el = host.querySelector('#qm_out'); if (el) el.innerHTML = results(); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (error) { /* private mode */ } }
  function paint() {
    host.innerHTML = '<p class="qm-k">Quick model</p><h2>Price, rent, debt and exit</h2><p class="qm-sub">Works for any income deal: LHA, a council or Home Office lease, Mack Living or an office. What you type stays in this browser.</p>' +
      '<div class="qm-cols"><div>' + inputs() + '<div class="qm-bar"><button type="button" id="qm_clear">Clear</button></div></div><div id="qm_out">' + results() + '</div></div>';
    const rebuild = new Set(['basis', 'loanType', 'reviewType', 'headlease', 'groundBasis', 'scBasis', 'capexBasis', 'renoArea', 'acqInterest', 'devBasis', 'devInterest']);
    host.querySelectorAll('[data-k]').forEach((el) => {
      const key = el.dataset.k;
      const on = () => {
        state[key] = el.value;
        save();
        if (rebuild.has(key)) { holdOpen = holdOpen || !!host.querySelector('.qm-more[open]'); paint(); }
        else paintResults();
      };
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
    host.querySelector('#qm_clear').onclick = () => { state = Object.assign({}, DEFAULTS); holdOpen = false; seedDates(); save(); paint(); };
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
