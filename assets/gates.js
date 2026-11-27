/* Fourteen gate scorecard inside the deal section. */
(function () {
  'use strict';
  const G = window.GatesModel;
  if (!G) return;
  const KEY = 'ed-gates-evidence-v1';
  const CFG = 'ed-gates-config-v1';
  let config = null;
  let evidence = {attribution: false, bridge: false, fees: false, term: false, cashOut: false};
  let scenario = 'base';
  let operatorIncome = '';
  let cheque = '';
  let open = null;
  let engaged = false;
  let deal = null;
  let catalogue = null;
  let lastFigures = null;
  const EXAMPLES = [{id: 'tain-manchester', title: 'Tain Manchester portfolio, 6 homes', file: 'data/deals/tain-manchester.json'}];
  let originalAnchors = null;
  let fileMessage = '';
  const FILEKEY = 'ed-deal-file-v1';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  }
  function loadLocal() {
    try { evidence = Object.assign(evidence, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (error) { evidence = evidence; }
    try {
      const saved = JSON.parse(localStorage.getItem(CFG) || 'null');
      if (saved && config) config.anchors = Object.assign({}, config.anchors, saved);
    } catch (error) { /* keep the file */ }
  }
  function saveLocal() {
    try { localStorage.setItem(KEY, JSON.stringify(evidence)); } catch (error) { /* private mode */ }
    try { localStorage.setItem(CFG, JSON.stringify(config.anchors)); } catch (error) { /* private mode */ }
  }
  function host() {
    const view = document.getElementById('deal_view');
    if (!view) return null;
    let node = document.getElementById('gates_root');
    if (!node) {
      node = document.createElement('div');
      node.id = 'gates_root';
      node.className = 'sheet-keep';
      // Sit under the sheet head when it is already there, so the example and saved models stay at the top.
      const sheetHead = view.querySelector(':scope > .sheet-head');
      view.insertBefore(node, sheetHead ? sheetHead.nextSibling : view.firstChild);
    }
    return node;
  }
  function payback(schedule) {
    if (!schedule) return null;
    const hit = schedule.find((row) => row.cumLev >= 0 && row.m > 0);
    return hit ? hit.m / 12 : null;
  }
  function breakEven(exitNoi, exitNet, profit, purchaser, saleCosts, exitCosts) {
    const net = exitNet - profit;
    const value = (net + (exitCosts || 0)) / (1 - (saleCosts || 0));
    if (!(value > 0) || !(exitNoi > 0)) return null;
    return exitNoi / (value * (1 + (purchaser || 0)));
  }
  function metricsFrom(result, state) {
    if (!result || result.errors && result.errors.length) return null;
    const s = state || {};
    const purchaser = Number(s.exitPurchaserPct) / 100 || 0;
    const saleCosts = Number(s.saleCostsPct) / 100 || 0;
    const basis = Math.min(result.price || 0, result.omv > 0 ? result.omv : result.price || 0);
    const ltv = basis > 0 ? result.debt / basis : null;
    const annual = [];
    if (result.schedule) {
      const years = Math.max(1, Number(s.holdYears) || 1);
      for (let i = 0; i <= years; i++) annual[i] = 0;
      result.schedule.forEach((row) => {
        const slot = Math.min(years, Math.floor(row.m / 12));
        annual[slot] += row.lev;
      });
    }
    return {
      noi: result.noi,
      annualRent: result.annualRent,
      annualOpex: result.annualOpex,
      fees: (result.acqFees || 0) + (result.debtFee || 0),
      allIn: result.allIn,
      price: result.price,
      debt: result.debt,
      interestRate: Number(s.interest) / 100,
      annualInterest: result.annualInterest,
      yieldOnCost: result.yieldOnCost,
      profitOnCost: result.allIn ? result.unlevered.profit / result.allIn : null,
      unleveredIrr: result.unlevered && result.unlevered.irr,
      leveredIrr: result.levered && result.levered.irr,
      leveredMultiple: result.levered && result.levered.multiple,
      peakEquity: result.levered && result.levered.peakEquity,
      cheque: cheque === '' ? null : Number(cheque),
      paybackYears: payback(result.schedule),
      holdYears: Number(s.holdYears) || config.anchors.holdYears,
      ltv,
      ltc: result.allIn ? result.debt / result.allIn : null,
      dscr: result.dscr,
      breakEvenUnlev: breakEven(result.exitNoi, result.exitNet, result.unlevered.profit, purchaser, saleCosts, Number(s.exitCosts) || 0),
      breakEvenLev: breakEven(result.exitNoi, result.exitNet, result.levered.profit, purchaser, saleCosts, Number(s.exitCosts) || 0),
      operatorCover: operatorIncome === '' || !(result.annualRent > 0) ? null : Number(operatorIncome) / result.annualRent,
      annualLevered: annual.length ? annual : null
    };
  }
  function numOr(value, fallback) {
    if (value === '' || value == null) return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  function blankDeal() {
    const s = typeof UW !== 'undefined' && UW.state ? UW.state : {};
    const anchors = config && config.anchors ? config.anchors : {gilt: 0.05, debtCost: 0.065, exitYield: 0.06, holdYears: 3};
    const homes = (s.rows || []).reduce((sum, row) => sum + (Number(row.units) || 0), 0);
    const per = s.rows && s.rows[0] ? Number(s.rows[0].annualRent) || 0 : 0;
    return {
      schema: 'ed-deal-1',
      portfolio: {
        homes: homes || '',
        price: s.price == null ? '' : s.price,
        annualRent: homes && per ? Math.round(per * homes) : per || '',
        rentBasis: 'gross',
        leaseRoute: s.income_mode === 'lha' ? 'LHA' : 'Mack Living',
        route: 'income'
      },
      incomeHold: {leaseBreakMonths: '', landlordBreakNoticeMonths: '', operatorBreakNoticeMonths: ''},
      vacantPossession: {value: '', saleMonth: '', rentMonthsBeforeSale: '', voidMonths: ''},
      costs: {
        purchaseCostsPct: s.acqCostsPct == null ? '' : s.acqCostsPct,
        lauritoAcquisitionPct: '',
        lauritoAnnualPct: '',
        lauritoDisposalPct: '',
        saleCostsPct: s.saleCostsPct == null ? '' : s.saleCostsPct,
        runningCostsPct: s.opexMargin == null ? '' : s.opexMargin,
        handbackCapex: s.capex == null ? '' : s.capex,
        holdingVoidMonths: ''
      },
      debt: {
        ltvPct: s.ltv == null ? '' : s.ltv,
        debtRatePct: s.interest == null ? '' : s.interest,
        holdMonths: Math.round((Number(s.holdYears) || anchors.holdYears || 3) * 12)
      },
      assumptions: {
        exitYieldPct: Math.round((anchors.exitYield || 0) * 1000) / 10,
        downsideExitYieldPct: '',
        downsideRentCutPct: '',
        giltPct: Math.round((anchors.gilt || 0) * 1000) / 10,
        testDebtRatePct: Math.round((anchors.debtCost || 0) * 1000) / 10,
        tenantIncome: operatorIncome,
        cheque: cheque,
        completionMonth: s.completionMonth == null ? 0 : s.completionMonth
      },
      scenario: scenario,
      evidence: {attribution: !!evidence.attribution, bridge: !!evidence.bridge, fees: !!evidence.fees, term: !!evidence.term, cashOut: !!evidence.cashOut}
    };
  }
  function normaliseDeal(raw) {
    const base = blankDeal();
    if (!raw || typeof raw !== 'object') return base;
    ['portfolio', 'incomeHold', 'vacantPossession', 'costs', 'debt', 'assumptions', 'evidence'].forEach((group) => {
      if (raw[group] && typeof raw[group] === 'object') base[group] = Object.assign(base[group], raw[group]);
    });
    if (raw.scenario === 'down' || raw.scenario === 'base') base.scenario = raw.scenario;
    base.schema = 'ed-deal-1';
    return base;
  }
  function applyDeal(source) {
    if (typeof UW === 'undefined' || !UW.state) return;
    const file = source || deal;
    if (!file) return;
    const s = UW.state;
    const homes = Math.max(1, Math.round(numOr(file.portfolio.homes, 1)));
    const route = file.portfolio.route === 'vacant' ? 'vacant' : 'income';
    const holdMonths = Math.max(1, numOr(file.debt.holdMonths, 36));
    const saleMonth = Math.max(1, numOr(file.vacantPossession.saleMonth, holdMonths));
    const operatingMonths = route === 'vacant' ? saleMonth : holdMonths;
    let rentMonths = route === 'vacant' ? numOr(file.vacantPossession.rentMonthsBeforeSale, operatingMonths) : operatingMonths;
    const voidMonths = route === 'vacant' ? numOr(file.vacantPossession.voidMonths, 0) : numOr(file.costs.holdingVoidMonths, 0);
    const paidMonths = Math.max(0, Math.min(operatingMonths, rentMonths) - Math.max(0, voidMonths));
    const typedRent = numOr(file.portfolio.annualRent, 0);
    const modelledRent = operatingMonths > 0 ? typedRent * paidMonths / operatingMonths : 0;
    s.price = numOr(file.portfolio.price, 0);
    s.rows = [{tenure: 'Rent', units: homes, beds: '3', omv: 0, annualRent: homes ? modelledRent / homes : 0}];
    s.income_mode = file.portfolio.leaseRoute === 'LHA' ? 'lha' : 'direct';
    s.ltv = numOr(file.debt.ltvPct, 0);
    s.interest = numOr(file.debt.debtRatePct, 0);
    s.holdYears = operatingMonths / 12;
    s.completionMonth = numOr(file.assumptions.completionMonth, 0);
    s.capex = numOr(file.costs.handbackCapex, 0);
    s.capexPerUnit = 0;
    s.capexMode = 'gbp';
    s.saleCostsPct = numOr(file.costs.saleCostsPct, 0) + numOr(file.costs.lauritoDisposalPct, 0);
    s.acqCostsPct = numOr(file.costs.purchaseCostsPct, 0) + numOr(file.costs.lauritoAcquisitionPct, 0);
    s.exitYield = numOr(file.assumptions.exitYieldPct, s.exitYield);
    s.voidPct = voidMonths;
    s.leaseBreakMonths = numOr(file.incomeHold.leaseBreakMonths, 0);
    const running = file.costs.runningCostsPct;
    s.opexMargin = running === '' || running == null ? null : Number(running);
    const annualPct = numOr(file.costs.lauritoAnnualPct, 0);
    if (annualPct > 0 && modelledRent > 0 && typeof UW.tax === 'function') {
      const sdlt = UW.tax(s.price, homes, s.taxMode || 'auto');
      const allIn = s.price + sdlt + s.price * s.acqCostsPct / 100 + s.capex;
      s.opexMargin = (Number(s.opexMargin) || 0) + (allIn * annualPct / 100) / modelledRent * 100;
    }
    if (route === 'vacant' && numOr(file.vacantPossession.value, 0) > 0 && s.opexMargin != null) {
      const probe = UW.compute(s);
      if (probe && probe.exitNoi > 0) {
        const purchaser = Number(s.exitPurchaserPct) / 100 || 0;
        const yieldPct = 100 * probe.exitNoi / (numOr(file.vacantPossession.value, 0) * (1 + purchaser));
        if (Number.isFinite(yieldPct) && yieldPct > 0) s.exitYield = yieldPct;
      }
    }
    if (config && config.anchors) {
      config.anchors.gilt = numOr(file.assumptions.giltPct, config.anchors.gilt * 100) / 100;
      config.anchors.debtCost = numOr(file.assumptions.testDebtRatePct, config.anchors.debtCost * 100) / 100;
      config.anchors.exitYield = numOr(file.assumptions.exitYieldPct, config.anchors.exitYield * 100) / 100;
      config.anchors.holdYears = operatingMonths / 12;
    }
    operatorIncome = file.assumptions.tenantIncome == null ? '' : String(file.assumptions.tenantIncome);
    cheque = file.assumptions.cheque == null ? '' : String(file.assumptions.cheque);
    scenario = file.scenario === 'down' ? 'down' : 'base';
    evidence = Object.assign({attribution: false, bridge: false, fees: false, term: false, cashOut: false}, file.evidence || {});
  }
  function downsideExit(state) {
    if (engaged && deal && deal.assumptions.downsideExitYieldPct !== '' && deal.assumptions.downsideExitYieldPct != null) return numOr(deal.assumptions.downsideExitYieldPct, state.exitYield);
    return Number(state.exitYield) + (config.spreadsBp.downsideExit / 100);
  }
  function downsideCut() {
    if (engaged && deal && deal.assumptions.downsideRentCutPct !== '' && deal.assumptions.downsideRentCutPct != null) return numOr(deal.assumptions.downsideRentCutPct, 0) / 100;
    return config.downsideRentCut;
  }
  function downsideMetrics() {
    if (typeof UW === 'undefined' || !UW.state || !config) return null;
    if (engaged) applyDeal(deal);
    const copy = JSON.parse(JSON.stringify(UW.state));
    copy.exitYield = downsideExit(copy);
    const cut = downsideCut();
    copy.rows = (copy.rows || []).map((row) => Object.assign({}, row, {annualRent: Number(row.annualRent) * (1 - cut)}));
    const result = UW.compute(copy);
    const metrics = metricsFrom(result, copy);
    if (!metrics) return null;
    return {
      multiple: metrics.leveredMultiple,
      dscr: metrics.dscr,
      unleveredIrr: metrics.unleveredIrr,
      leveredIrr: metrics.leveredIrr,
      ltv: metrics.ltv
    };
  }
  function current() {
    if (typeof UW === 'undefined' || !UW.compute || !UW.state || !config) return null;
    if (engaged) applyDeal(deal);
    const base = UW.compute(UW.state);
    const metrics = metricsFrom(base, UW.state);
    if (!metrics) { lastFigures = null; return {error: (base && base.errors || []).join(' ')}; }
    if (scenario === 'down') {
      const downState = JSON.parse(JSON.stringify(UW.state));
      downState.exitYield = downsideExit(downState);
      const cut = downsideCut();
      downState.rows = (downState.rows || []).map((row) => Object.assign({}, row, {annualRent: Number(row.annualRent) * (1 - cut)}));
      const downResult = UW.compute(downState);
      const downMetrics = metricsFrom(downResult, downState);
      if (downMetrics) {
        metrics.dscr = downMetrics.dscr;
        metrics.breakEvenUnlev = downMetrics.breakEvenUnlev;
        metrics.breakEvenLev = downMetrics.breakEvenLev;
      }
    }
    metrics.downside = downsideMetrics();
    lastFigures = {
      unlevered: base.unlevered && base.unlevered.irr,
      levered: base.levered && base.levered.irr,
      multiple: base.levered && base.levered.multiple,
      yoc: base.yieldOnCost,
      dscr: base.dscr,
      downUnlevered: metrics.downside && metrics.downside.unleveredIrr,
      downLevered: metrics.downside && metrics.downside.leveredIrr,
      downMultiple: metrics.downside && metrics.downside.multiple
    };
    return G.score(metrics, evidence, config);
  }
  const PLAIN = {
    1: ['Income and sale gain shown apart', 'Official name: Return attribution. Income and the gain on sale must be shown separately.'],
    2: ['Return before the loan', 'Official name: Unlevered IRR. The yearly return if you used no debt.'],
    3: ['Rent versus total cost', 'Official name: Yield on cost and profit on cost. Rent compared with everything you spend.'],
    4: ['Return after the loan', 'Official name: Levered IRR, equity multiple and post tax. The return after interest and tax.'],
    5: ['All fees included', 'Official name: Net returns. Every fee has to be taken off before the return is counted.'],
    6: ['Cash you put in', 'Official name: Peak equity, payback and cash on cash. The most of your own money the deal needs, and how fast it comes back.'],
    7: ['Rent versus the loan cost', 'Official name: Leverage spread. The rent return has to beat the interest rate.'],
    8: ['Loan size', 'Official name: LTV and LTC. LTV is the loan as a share of the price. LTC is the loan as a share of the full cost.'],
    9: ['Rent covers the interest', 'Official name: Interest cover. Rent left after costs, divided by the interest.'],
    10: ['If the interest rate rises', 'Official name: Refinance sensitivity. The same test if the rate goes up.'],
    11: ['Room if the sale yield rises', 'Official name: Break even exit yield. How far the sale yield can rise before profit disappears.'],
    12: ['A worse case', 'Official name: Base, downside and upside. A lower rent and a higher sale yield. A better case does not help you pass.'],
    13: ['Tenant income versus rent', 'Official name: Operator rent cover. The tenant contract income compared with the rent.'],
    14: ['Years left on the lease', 'Official name: Unexpired term at exit. How long the lease still has when you sell.']
  };
  function nextStep(result) {
    if (!result || result.error) return 'Next: type the purchase price, the year one rent, and the running costs. The hurdles run after those three are filled.';
    if (result.verdict === 'PASS') return 'Next: all 14 hurdles are clear. You can take this deal to the investment committee.';
    const tips = {
      1: 'tick the first evidence box once income and the sale gain are shown apart',
      2: 'lower the price or raise the rent, because the return before the loan is short',
      3: 'lower the price or raise the rent, because the rent does not cover the full cost',
      4: 'lower the price, raise the rent, or use less debt, because the return after the loan is short',
      5: 'tick the fee box once every fee is included',
      6: 'use less of your own money, or set the most you can invest',
      7: 'use less debt, or none, because the rent does not beat the cost of the loan',
      8: 'keep the loan at or under 60% of the price',
      9: 'use a smaller loan or a lower rate, and tick that fees are already taken off',
      10: 'leave more room on the loan, because a higher interest rate is not covered',
      11: 'lower the price, because a small rise in the sale yield wipes the profit',
      12: 'leave more room on price or rent, because the worse case fails',
      13: 'type the tenant income, which needs to be at least 1.25 times the rent',
      14: 'tick the lease box once at least 7 years remain when you sell'
    };
    const n = result.binding && result.binding.n;
    const tip = tips[n] || 'fix the first hurdle that is not clear';
    if (result.maxLtv === 0) return 'Next: lower the price or raise the rent, because the rent return is too low for any loan, and ' + result.fails + ' of 14 hurdles are not clear.';
    return 'Next: ' + tip + ', and ' + result.fails + ' of 14 hurdles are not clear.';
  }
  function field(id, label, value, help, isDefault) {
    return '<label class="deal-field"><span>' + label + (isDefault ? ' <em class="deal-default">Default, you can change it</em>' : '') + '</span><input id="' + id + '" inputmode="decimal" value="' + esc(value == null ? '' : value) + '"><small class="deal-help">' + help + '</small></label>';
  }
  function bar(row) {
    const width = row.status === 'pass' ? 100 : (row.status === 'fail' ? 70 : 36);
    const plain = PLAIN[row.n] || [row.name, row.name];
    const head = row.headroom == null || !row.unit ? '' : (row.unit === 'x' ? row.headroom + 'x' : (row.headroom > 0 ? '+' : '') + row.headroom + 'bp');
    const shown = row.status === 'pass' ? 'Pass' : (row.status === 'fail' ? 'Fail' : 'Needs evidence');
    return '<button type="button" class="bd-bar ' + row.status + '" data-gate="' + row.n + '" title="' + esc(plain[1] + (head ? ' Gap ' + head + '.' : '')) + '"><span>' + row.n + ' ' + esc(plain[0]) + '</span><i><b style="width:' + width + '%"></b></i><em>' + esc(shown) + '</em></button>';
  }
  function mergeScenario(raw, id) {
    const base = normaliseDeal(raw);
    const chosen = (raw.scenarios || []).find((item) => item.id === id) || (raw.scenarios || [])[0] || null;
    if (chosen) {
      ['portfolio', 'incomeHold', 'vacantPossession', 'costs', 'debt', 'assumptions'].forEach((group) => {
        if (chosen[group]) base[group] = Object.assign({}, base[group], chosen[group]);
      });
      base.activeScenario = chosen.id;
      base.screen = chosen.screen || null;
    }
    base.title = raw.title || '';
    base.caution = raw.caution || '';
    base.notes = Array.isArray(raw.notes) ? raw.notes : [];
    base.scenario = 'base';
    return base;
  }
  function pctText(value) {
    return value == null || !Number.isFinite(Number(value)) ? 'Not ready' : (Number(value) * 100).toFixed(1) + '%';
  }
  function timesText(value) {
    return value == null || !Number.isFinite(Number(value)) ? 'Not ready' : Number(value).toFixed(2) + 'x';
  }
  function screenStatus(code) {
    if (code === 'pass') return 'Pass';
    if (code === 'fail') return 'Fail';
    if (code === 'open') return 'Open';
    return 'Not ready';
  }
  function ourStatus(code) {
    if (code === 'pass') return 'Pass';
    if (code === 'fail') return 'Fail';
    if (code === 'amber') return 'Needs evidence';
    return 'Not ready';
  }
  function sameResult(ours, screen) {
    if (ours === 'pass' && screen === 'pass') return true;
    if (ours === 'fail' && screen === 'fail') return true;
    if ((ours === 'amber' || ours === 'open') && screen === 'open') return true;
    return false;
  }
  function screenHtml(result) {
    if (!deal || !deal.screen) return '';
    const screen = deal.screen;
    const rows = (screen.gates || []).map((row) => {
      const ours = result && result.gates ? result.gates.find((gate) => gate.n === row.n) : null;
      const oursCode = ours ? ours.status : '';
      const same = sameResult(oursCode, row.result);
      return '<tr><td>' + row.n + '</td><td>' + ourStatus(oursCode) + '</td><td>' + screenStatus(row.result) + '</td><td>' + (same ? 'Same' : 'Different') + '</td></tr>';
    }).join('');
    const figures = lastFigures || {};
    return '<article class="bd-chart"><h2>Desktop screen</h2><p class="bd-src">' + esc(deal.caution || 'Example deal from a desktop screen, not Red Book, tax or legal advice.') + '</p><p>Our engine: unlevered ' + pctText(figures.unlevered) + ', levered ' + pctText(figures.levered) + ', multiple ' + timesText(figures.multiple) + '. Worse case unlevered ' + pctText(figures.downUnlevered) + ', levered ' + pctText(figures.downLevered) + ', multiple ' + timesText(figures.downMultiple) + '.</p><p>Desktop screen: unlevered ' + esc(screen.unlevered || '') + ', levered ' + esc(screen.levered || '') + ', multiple ' + esc(screen.multiple || '') + '. Worse case unlevered ' + esc(screen.downUnlevered || '') + ', levered ' + esc(screen.downLevered || '') + ', multiple ' + esc(screen.downMultiple || '') + '. ' + esc(screen.verdict || '') + '</p><div class="scroll"><table><thead><tr><th>Hurdle</th><th>This site</th><th>Desktop screen</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div><ul class="bd-take">' + (deal.notes || []).map((line) => '<li>' + esc(line) + '</li>').join('') + '</ul></article>';
  }
  function viewDeal() {
    return engaged && deal ? deal : blankDeal();
  }
  function choice(id, label, value, options, help) {
    return '<label class="deal-field"><span>' + label + '</span><select id="' + id + '">' + options.map((option) => '<option' + (option === value ? ' selected' : '') + '>' + option + '</option>').join('') + '</select><small class="deal-help">' + help + '</small></label>';
  }
  function html(result) {
    const anchors = config.anchors;
    const state = typeof UW !== 'undefined' && UW.state ? UW.state : {};
    const file = viewDeal();
    const rent = engaged ? file.portfolio.annualRent : (state.rows && state.rows[0] ? state.rows[0].annualRent : '');
    const lease = engaged ? file.portfolio.leaseRoute : (state.income_mode === 'lha' ? 'LHA' : 'Mack Living');
    const holdMonths = engaged ? file.debt.holdMonths : Math.round((Number(state.holdYears) || anchors.holdYears || 3) * 12);
    const flow = '<ol class="deal-flow"><li><b>1</b> Inputs</li><li><b>2</b> Hurdles</li><li><b>3</b> Verdict</li></ol><p class="deal-help">Fill the inputs, read the 14 hurdles, then read the verdict. A pass means every hurdle is clear. One fail stops the deal.</p>';
    const exampleOptions = '<option value="">No example</option>' + EXAMPLES.map((item) => '<option value="' + item.id + '"' + (catalogue && catalogue.id === item.id ? ' selected' : '') + '>' + esc(item.title) + '</option>').join('');
    const scenarioButtons = catalogue && catalogue.scenarios ? catalogue.scenarios.map((item) => '<button type="button" data-deal-scenario="' + esc(item.id) + '"' + (deal && deal.activeScenario === item.id ? ' class="on"' : '') + '>' + esc(item.name) + '</button>').join('') : '';
    const tools = '<div class="bd-auc"><label>Example <select id="deal-example">' + exampleOptions + '</select></label><button type="button" id="deal-load">Load a deal</button><button type="button" id="deal-save">Save this deal</button><button type="button" id="deal-clear">Clear deal</button><input id="deal-file" type="file" accept="application/json,.json" hidden></div>' + (scenarioButtons ? '<div class="bd-auc">' + scenarioButtons + '</div>' : '') + '<p class="deal-help">The file stays on this computer. Nothing is uploaded. A refresh keeps the last deal you loaded. An example is a published illustration.</p>' + (fileMessage ? '<p class="bd-src">' + esc(fileMessage) + '</p>' : '');
    const breakNote = engaged && numOr(file.incomeHold.leaseBreakMonths, 0) > 0 ? '<p class="bd-src">Lease break is ' + esc(file.incomeHold.leaseBreakMonths) + ' months. Hurdle 14 needs at least 7 years with no break. Tick it only when the paper shows that.</p>' : '';
    const step1 = '<section class="bd-chart deal-step"><p class="bd-kicker">Step 1</p><h2>Inputs</h2><p class="bd-src">Type the portfolio here, or load a deal file. A grey Default tag is a starting figure, and you can change it.</p><div class="deal-groups">'
      + '<div><h3>The portfolio</h3>'
      + field('deal-homes', 'Number of homes', file.portfolio.homes, 'How many homes are in this purchase.')
      + field('deal-price', 'Total purchase price, £', engaged ? file.portfolio.price : state.price, 'What you pay for all the homes. 0 means you have not set a price yet.')
      + field('deal-rent', 'Total year one rent, £', rent, 'Rent for the whole portfolio in the first year. Use the rent after the management fee if you choose net below.')
      + choice('deal-rent-basis', 'Rent basis', file.portfolio.rentBasis === 'net' ? 'Net of management' : 'Gross', ['Gross', 'Net of management'], 'Net means the rent you typed is already after the management fee.')
      + choice('deal-lease', 'Lease route', lease, ['Mack Living', 'LHA'], 'Mack Living is a lease to Mack. LHA is demand backed by the housing allowance.')
      + choice('deal-route', 'How you exit', file.portfolio.route === 'vacant' ? 'Sell vacant' : 'Keep the income', ['Keep the income', 'Sell vacant'], 'Keep the income holds the lease. Sell vacant uses a vacant possession price.')
      + '</div><div><h3>What you pay</h3>'
      + field('deal-fees', 'Purchase costs, %', engaged ? file.costs.purchaseCostsPct : state.acqCostsPct, 'Legal and agent costs, as a share of the price. Stamp duty is worked out from the price. You do not type it.', true)
      + field('deal-laurito-acq', 'Laurito fee on purchase, %', file.costs.lauritoAcquisitionPct, 'Laurito acquisition fee, as a share of the price. Added to the purchase costs.')
      + field('deal-laurito-annual', 'Laurito fee each year, % of all-in cost', file.costs.lauritoAnnualPct, 'Charged every year on the all-in cost. It is added to running costs.')
      + field('deal-laurito-disposal', 'Laurito fee on sale, %', file.costs.lauritoDisposalPct, 'Laurito disposal fee, as a share of the sale price. Added to the sale costs.')
      + field('deal-sale-costs', 'Sale costs, %', engaged ? file.costs.saleCostsPct : state.saleCostsPct, 'Other costs of selling, as a share of the sale price.', true)
      + field('deal-capex', 'Handback or works, £', engaged ? file.costs.handbackCapex : state.capex, 'Money for handback or works. 0 means none.')
      + '</div><div><h3>The rent and the loan</h3>'
      + field('deal-opex', 'Running costs, % of rent', engaged ? file.costs.runningCostsPct : state.opexMargin, 'Bills, management and repairs, as a share of rent. The hurdles will not run until you fill this.')
      + field('deal-void-months', 'Holding void, months', file.costs.holdingVoidMonths, 'Months with no rent while you hold. Used on the income route.')
      + field('deal-ltv', 'Loan share of the price, %', engaged ? file.debt.ltvPct : state.ltv, 'How much of the price is borrowed. This is sometimes called LTV.', true)
      + field('deal-interest', 'Interest on this loan, %', engaged ? file.debt.debtRatePct : state.interest, 'The yearly interest you expect to pay on this loan.', true)
      + field('deal-hold-months', 'Hold, months', holdMonths, 'How long you keep the homes. 15 means fifteen months. 36 is the three year starting point.', true)
      + field('deal-completion', 'Completion month', engaged ? file.assumptions.completionMonth : state.completionMonth, '0 means you complete now and rent can start at once. The full model starts at 18 months until you change this.')
      + '</div><div><h3>Exit and breaks</h3>'
      + field('gate-exit', 'Sale yield, %', engaged ? file.assumptions.exitYieldPct : anchors.exitYield * 100, 'The yield a buyer would want if you sell with the income. A higher number means a lower price.', true)
      + field('deal-down-exit', 'Worse case sale yield, %', file.assumptions.downsideExitYieldPct, 'Leave blank to use the standard test, which is 0.5 points higher than the sale yield.')
      + field('deal-down-rent', 'Worse case rent cut, %', file.assumptions.downsideRentCutPct, 'Leave blank to use the standard test, which cuts rent by 10%.')
      + field('deal-break', 'Lease break, months', file.incomeHold.leaseBreakMonths, 'Months until a break. Hurdle 14 needs 7 years with no break. This does not by itself tick that hurdle.')
      + field('deal-landlord-notice', 'Landlord break notice, months', file.incomeHold.landlordBreakNoticeMonths, 'Notice the landlord must give. Recorded on the deal file.')
      + field('deal-operator-notice', 'Operator break notice, months', file.incomeHold.operatorBreakNoticeMonths, 'Notice the operator must give. Recorded on the deal file.')
      + '</div><div><h3>Sell vacant</h3>'
      + field('deal-vp', 'Vacant possession value, £', file.vacantPossession.value, 'Used only when the exit is Sell vacant. The sale yield is set so the model matches this price.')
      + field('deal-sale-month', 'Sale month', file.vacantPossession.saleMonth, 'The month you sell, counting from completion.')
      + field('deal-rent-months', 'Months of rent before sale', file.vacantPossession.rentMonthsBeforeSale, 'How many months of rent you collect before the vacant sale.')
      + field('deal-vp-void', 'Void months before sale', file.vacantPossession.voidMonths, 'Empty months on the vacant sale route.')
      + '</div><div><h3>The test settings</h3>'
      + field('gate-gilt', 'Government bond yield, %', engaged ? file.assumptions.giltPct : anchors.gilt * 100, 'The starting point for the return hurdles. A gilt is a UK government bond.', true)
      + field('gate-debt', 'Test interest rate, %', engaged ? file.assumptions.testDebtRatePct : anchors.debtCost * 100, 'The hurdles use this rate. It is separate from the interest on this loan.', true)
      + field('gate-income', 'Tenant contract income, £', operatorIncome, 'What the tenant is contracted to receive. Leave blank if it is not on file. A blank is not a pass.')
      + field('gate-cheque', 'Most you can invest, £', cheque, 'Leave blank if this has not been set.')
      + '</div></div></section>';
    const verdictWord = result && result.verdict ? result.verdict : 'Not ready';
    const tone = verdictWord === 'PASS' ? 'pass' : (verdictWord === 'FAIL' ? 'fail' : 'wait');
    const priceShown = engaged ? file.portfolio.price : state.price;
    const loanShown = engaged ? file.debt.ltvPct : state.ltv;
    const verdictBlock = '<section class="bd-chart deal-step" id="deal-verdict"><p class="bd-kicker">Verdict</p><h2>Does this deal clear?</h2><b class="verdict-badge lg ' + tone + '">' + esc(verdictWord) + '</b><p class="deal-next">' + esc(nextStep(result)) + '</p><div class="deal-strip"><span>Price £' + esc(priceShown || 0) + '</span><span>Rent £' + esc(rent || 0) + '</span><span>Lease ' + esc(lease) + '</span><span>Loan ' + esc(loanShown || 0) + '%</span></div></section>';
    if (!result || result.error) {
      return '<div class="bd"><p class="bd-kicker">Deal</p><h1>Test a deal</h1>' + tools + flow + step1
        + '<section class="deal-step bd-chart"><p class="bd-kicker">Step 2</p><h2>Hurdles</h2><p>The 14 hurdles appear here once the purchase price, the year one rent and the running costs are filled. Until then this is not a pass.</p></section>'
        + verdictBlock + screenHtml(result) + '</div>';
    }
    const tight = PLAIN[result.binding.n] ? PLAIN[result.binding.n][0] : result.binding.name;
    const tiles = [
      ['Cleared', result.cleared + ' of 14'],
      ['Tightest hurdle', result.binding.n + ' ' + tight],
      ['Worse case', result.downside === 'PASS' ? 'Holds' : 'Fails']
    ];
    const groupPlain = {return: ['Does it make enough?', 'Return hurdles'], debt: ['Can the loan be carried?', 'Loan hurdles'], risk: ['What if it gets worse?', 'Risk hurdles']};
    const charts = result.groups.map(([id, label, nums]) => {
      const rows = result.gates.filter((gate) => nums.indexOf(gate.n) >= 0);
      const names = groupPlain[id] || [label, label];
      return '<article class="bd-chart"><h2 title="' + esc(names[1]) + '">' + esc(names[0]) + '</h2>' + rows.map(bar).join('') + '</article>';
    }).join('');
    const drill = open && result.gates.find((gate) => gate.n === open);
    const ticks = [
      ['attribution', 'Income and the sale gain are shown apart, with a flat sale yield and no house price growth'],
      ['bridge', 'Every fee is deducted, including Laurito fees'],
      ['fees', 'The rent left after costs already has Laurito fees taken off', 'NOI means rent left after running costs.'],
      ['term', 'The years left on the lease, and the valuation basis, are on file'],
      ['cashOut', 'The investment committee has approved a loan above 80% of the full cost', 'LTC means the loan as a share of the full cost.']
    ].map(([id, label, tip]) => '<label class="gn-check"' + (tip ? ' title="' + esc(tip) + '"' : '') + '><input type="checkbox" data-ev="' + id + '"' + (evidence[id] ? ' checked' : '') + '> ' + label + '</label>').join('');
    const plain = drill ? (PLAIN[drill.n] || [drill.name, drill.name]) : null;
    const worseLine = engaged && (file.assumptions.downsideExitYieldPct !== '' || file.assumptions.downsideRentCutPct !== '') ? 'The worse case uses the sale yield and the rent cut you typed. A better case does not help you pass.' : 'The worse case is a sale yield 0.5 points higher and rent 10% lower. A better case does not help you pass.';
    return '<div class="bd"><p class="bd-kicker">Deal</p><h1>Test a deal</h1>' + tools + flow + step1
      + '<section class="deal-step"><div class="bd-top"><div><p class="bd-kicker">Step 2</p><h1>Hurdles</h1></div><div class="bd-auc"><button type="button" data-scen="base"' + (scenario === 'base' ? ' class="on"' : '') + '>Expected case</button><button type="button" data-scen="down"' + (scenario === 'down' ? ' class="on"' : '') + '>Worse case</button></div></div>'
      + '<p class="bd-src">All 14 must pass. One fail stops the deal. Nothing is waived. Click a hurdle to see why.</p>' + breakNote
      + '<div class="bd-kpis">' + tiles.map((row) => '<div class="bd-tile"><span>' + esc(row[0]) + '</span><b>' + esc(row[1]) + '</b></div>').join('') + '</div>'
      + '<div class="bd-charts">' + charts + '</div>'
      + '<div class="bd-chart"><h2>Tick these when the paper is on file</h2><p class="bd-src">An unticked box keeps that hurdle as needs evidence. Needs evidence is not a pass.</p>' + ticks + '</div></section>'
      + verdictBlock
      + screenHtml(result)
      + '<article class="bd-chart"><h2>Why</h2><ul class="bd-take"><li>' + esc(G.takeaway(result)) + '</li><li>' + esc(worseLine) + '</li><li>A hurdle marked for the investment committee in December 2026 is not a pass until they sign it off.</li></ul></article>'
      + (drill ? '<section class="bd-drill"><p class="bd-kicker">Hurdle ' + drill.n + '</p><button type="button" class="btn sec" id="gate-back">Back to the hurdles</button><h2>' + esc(plain[0]) + '</h2><p class="bd-src" title="' + esc(plain[1]) + '">' + esc(plain[1]) + '</p><p>' + esc(drill.valueText) + ' against ' + esc(drill.thresholdText) + '</p><p>' + esc(drill.calc) + '</p><p class="bd-src">' + esc(drill.evidence) + '</p></section>' : '')
      + '<details class="bd-fold"><summary>Show the official hurdle names</summary><div class="scroll"><table><thead><tr><th>Hurdle</th><th>Status</th><th>Value</th><th>Test</th></tr></thead><tbody>'
      + result.gates.map((gate) => '<tr><td>' + gate.n + ' ' + esc(gate.name) + '</td><td>' + gate.status + '</td><td>' + esc(gate.valueText) + '</td><td>' + esc(gate.thresholdText) + '</td></tr>').join('')
      + '</tbody></table></div></details></div>';
  }
  function remember() {
    if (!engaged || !deal) return;
    try { localStorage.setItem(FILEKEY, JSON.stringify({catalogue: catalogue, activeScenario: deal.activeScenario || '', deal: deal})); } catch (error) { /* private mode */ }
  }
  function useParsed(parsed, scenarioId) {
    catalogue = parsed && parsed.scenarios ? parsed : null;
    deal = parsed && parsed.scenarios ? mergeScenario(parsed, scenarioId || parsed.activeScenario) : normaliseDeal(parsed);
    engaged = true;
    fileMessage = catalogue ? 'Example loaded. The hurdles have been run again.' : 'Deal loaded on this computer. The hurdles have been run again.';
    remember();
    if (typeof uwUpdate === 'function') uwUpdate();
    else schedulePaint();
  }
  // Load a published example by id. Used by the Example list here and by the list at the top of the Deal sheet.
  function loadExample(id) {
    const chosen = EXAMPLES.find((item) => item.id === id);
    if (!chosen) return false;
    fetch(chosen.file + '?v=20261118-tain', {cache: 'no-store'}).then((response) => response.json()).then((data) => useParsed(data)).catch(() => { fileMessage = 'The example did not load.'; schedulePaint(); });
    return true;
  }
  function ingest(text) {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      useParsed(parsed);
    } catch (error) {
      fileMessage = 'That file could not be read. Use a deal file with schema ed-deal-1.';
      schedulePaint();
    }
  }
  function downloadDeal() {
    const payload = engaged && deal ? deal : blankDeal();
    payload.schema = 'ed-deal-1';
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'deal.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    fileMessage = 'The deal file has been downloaded. It stays on this computer.';
    schedulePaint();
  }
  function clearDeal() {
    engaged = false;
    deal = null;
    catalogue = null;
    fileMessage = 'The deal has been cleared from this browser.';
    try { localStorage.removeItem(FILEKEY); } catch (error) { /* private mode */ }
    try { localStorage.removeItem(KEY); } catch (error) { /* private mode */ }
    try { localStorage.removeItem(CFG); } catch (error) { /* private mode */ }
    evidence = {attribution: false, bridge: false, fees: false, term: false, cashOut: false};
    operatorIncome = '';
    cheque = '';
    scenario = 'base';
    if (originalAnchors && config) config.anchors = JSON.parse(JSON.stringify(originalAnchors));
    if (typeof UW !== 'undefined' && UW.defaults) UW.state = UW.defaults();
    if (typeof uwUpdate === 'function') uwUpdate();
    else schedulePaint();
  }
  function restoreDeal() {
    try {
      const saved = JSON.parse(localStorage.getItem(FILEKEY) || 'null');
      if (!saved) return;
      if (saved.catalogue && saved.catalogue.scenarios) {
        catalogue = saved.catalogue;
        deal = mergeScenario(saved.catalogue, saved.activeScenario);
      } else if (saved.deal) deal = normaliseDeal(saved.deal);
      else deal = normaliseDeal(saved);
      engaged = true;
      fileMessage = 'The last deal loaded on this computer is still here.';
    } catch (error) {
      engaged = false;
      deal = null;
    }
  }
  let paintTimer = 0;
  function schedulePaint() {
    clearTimeout(paintTimer);
    paintTimer = setTimeout(paint, 0);
  }
  function paint() {
    const node = host();
    if (!node || !config) return;
    const result = current();
    node.innerHTML = html(result);
    node.querySelectorAll('[data-gate]').forEach((button) => button.onclick = () => { open = Number(button.dataset.gate); paint(); });
    const back = node.querySelector('#gate-back');
    if (back) back.onclick = () => { open = null; paint(); };
    node.querySelectorAll('[data-scen]').forEach((button) => button.onclick = () => {
      scenario = button.dataset.scen;
      if (engaged && deal) { deal.scenario = scenario; remember(); }
      paint();
    });
    node.querySelectorAll('[data-ev]').forEach((box) => box.onchange = () => {
      evidence[box.dataset.ev] = box.checked;
      if (engaged && deal) { deal.evidence[box.dataset.ev] = box.checked; remember(); }
      saveLocal();
      paint();
    });
    [['gate-gilt', 'gilt'], ['gate-debt', 'debtCost'], ['gate-exit', 'exitYield'], ['gate-hold', 'holdYears']].forEach(([id, key]) => {
      const input = node.querySelector('#' + id);
      if (!input) return;
      input.onchange = () => {
        const value = Number(input.value);
        if (!Number.isFinite(value)) return;
        config.anchors[key] = key === 'holdYears' ? value : value / 100;
        if (typeof UW !== 'undefined' && UW.state) {
          if (key === 'exitYield') UW.state.exitYield = value;
          if (key === 'holdYears') UW.state.holdYears = value;
        }
        if (engaged && deal) {
          if (key === 'gilt') deal.assumptions.giltPct = value;
          if (key === 'debtCost') deal.assumptions.testDebtRatePct = value;
          if (key === 'exitYield') deal.assumptions.exitYieldPct = value;
          remember();
        }
        saveLocal();
        if (typeof uwUpdate === 'function') uwUpdate();
        else schedulePaint();
      };
    });
    ['gate-income', 'gate-cheque'].forEach((id) => {
      const input = node.querySelector('#' + id);
      if (!input) return;
      input.onchange = () => {
        if (id === 'gate-income') operatorIncome = input.value.trim();
        else cheque = input.value.trim();
        if (engaged && deal) {
          if (id === 'gate-income') deal.assumptions.tenantIncome = operatorIncome;
          else deal.assumptions.cheque = cheque;
          remember();
        }
        schedulePaint();
      };
    });
    const setDeal = (id, apply) => {
      const input = node.querySelector('#' + id);
      if (!input) return;
      input.onchange = () => {
        if (typeof UW === 'undefined' || !UW.state) return;
        apply(input.value);
        if (typeof uwUpdate === 'function') uwUpdate();
        else schedulePaint();
      };
    };
    const engage = () => {
      if (!engaged) {
        deal = blankDeal();
        engaged = true;
      }
    };
    const write = (apply) => {
      engage();
      apply(deal);
      remember();
    };
    setDeal('deal-homes', (value) => { write((file) => { file.portfolio.homes = value; }); });
    setDeal('deal-price', (value) => {
      if (engaged) write((file) => { file.portfolio.price = value; });
      else UW.state.price = Number(value) || 0;
    });
    setDeal('deal-rent', (value) => {
      if (engaged) write((file) => { file.portfolio.annualRent = value; });
      else {
        if (!UW.state.rows[0]) UW.state.rows[0] = {tenure: 'Rent', units: 1, beds: '3', omv: 0, annualRent: 0};
        UW.state.rows[0].annualRent = Number(value) || 0;
        if (!UW.state.rows[0].units) UW.state.rows[0].units = 1;
      }
    });
    setDeal('deal-fees', (value) => {
      if (engaged) write((file) => { file.costs.purchaseCostsPct = value; });
      else UW.state.acqCostsPct = Number(value) || 0;
    });
    setDeal('deal-capex', (value) => {
      if (engaged) write((file) => { file.costs.handbackCapex = value; });
      else UW.state.capex = Number(value) || 0;
    });
    setDeal('deal-opex', (value) => {
      if (engaged) write((file) => { file.costs.runningCostsPct = value; });
      else UW.state.opexMargin = Number(value);
    });
    setDeal('deal-ltv', (value) => {
      if (engaged) write((file) => { file.debt.ltvPct = value; });
      else UW.state.ltv = Number(value) || 0;
    });
    setDeal('deal-interest', (value) => {
      if (engaged) write((file) => { file.debt.debtRatePct = value; });
      else UW.state.interest = Number(value) || 0;
    });
    setDeal('deal-laurito-acq', (value) => write((file) => { file.costs.lauritoAcquisitionPct = value; }));
    setDeal('deal-laurito-annual', (value) => write((file) => { file.costs.lauritoAnnualPct = value; }));
    setDeal('deal-laurito-disposal', (value) => write((file) => { file.costs.lauritoDisposalPct = value; }));
    setDeal('deal-sale-costs', (value) => write((file) => { file.costs.saleCostsPct = value; }));
    setDeal('deal-void-months', (value) => write((file) => { file.costs.holdingVoidMonths = value; }));
    setDeal('deal-hold-months', (value) => write((file) => { file.debt.holdMonths = value; }));
    setDeal('deal-completion', (value) => write((file) => { file.assumptions.completionMonth = value; }));
    setDeal('deal-down-exit', (value) => write((file) => { file.assumptions.downsideExitYieldPct = value; }));
    setDeal('deal-down-rent', (value) => write((file) => { file.assumptions.downsideRentCutPct = value; }));
    setDeal('deal-break', (value) => write((file) => { file.incomeHold.leaseBreakMonths = value; }));
    setDeal('deal-landlord-notice', (value) => write((file) => { file.incomeHold.landlordBreakNoticeMonths = value; }));
    setDeal('deal-operator-notice', (value) => write((file) => { file.incomeHold.operatorBreakNoticeMonths = value; }));
    setDeal('deal-vp', (value) => write((file) => { file.vacantPossession.value = value; }));
    setDeal('deal-sale-month', (value) => write((file) => { file.vacantPossession.saleMonth = value; }));
    setDeal('deal-rent-months', (value) => write((file) => { file.vacantPossession.rentMonthsBeforeSale = value; }));
    setDeal('deal-vp-void', (value) => write((file) => { file.vacantPossession.voidMonths = value; }));
    const bindSelect = (id, apply) => {
      const input = node.querySelector('#' + id);
      if (!input) return;
      input.onchange = () => { write(apply); if (typeof uwUpdate === 'function') uwUpdate(); else schedulePaint(); };
    };
    bindSelect('deal-rent-basis', (file) => { file.portfolio.rentBasis = node.querySelector('#deal-rent-basis').value === 'Net of management' ? 'net' : 'gross'; });
    bindSelect('deal-lease', (file) => { file.portfolio.leaseRoute = node.querySelector('#deal-lease').value; });
    bindSelect('deal-route', (file) => { file.portfolio.route = node.querySelector('#deal-route').value === 'Sell vacant' ? 'vacant' : 'income'; });
    const example = node.querySelector('#deal-example');
    if (example) example.onchange = () => {
      if (!loadExample(example.value)) clearDeal();
    };
    node.querySelectorAll('[data-deal-scenario]').forEach((button) => button.onclick = () => {
      if (!catalogue) return;
      deal = mergeScenario(catalogue, button.dataset.dealScenario);
      engaged = true;
      fileMessage = 'Scenario loaded. The hurdles have been run again.';
      remember();
      if (typeof uwUpdate === 'function') uwUpdate();
      else schedulePaint();
    });
    const loadBtn = node.querySelector('#deal-load');
    const fileInput = node.querySelector('#deal-file');
    if (loadBtn && fileInput) loadBtn.onclick = () => fileInput.click();
    if (fileInput) fileInput.onchange = () => {
      const picked = fileInput.files && fileInput.files[0];
      if (!picked) return;
      const reader = new FileReader();
      reader.onload = () => ingest(String(reader.result || ''));
      reader.readAsText(picked);
    };
    const saveBtn = node.querySelector('#deal-save');
    if (saveBtn) saveBtn.onclick = () => downloadDeal();
    const clearBtn = node.querySelector('#deal-clear');
    if (clearBtn) clearBtn.onclick = () => clearDeal();
    const body = document.getElementById('deal_body');
    if (body && !body.closest('details.deal-model')) {
      const details = document.createElement('details');
      details.className = 'bd-fold deal-model sheet-keep';
      const summary = document.createElement('summary');
      summary.textContent = 'Show the full underwriting model';
      body.parentNode.insertBefore(details, body);
      details.appendChild(summary);
      details.appendChild(body);
    }
  }
  function boot() {
    fetch('data/market-entry/gates.json?v=20261117-gates', {cache: 'no-store'}).then((response) => response.json()).then((data) => {
      config = data;
      originalAnchors = JSON.parse(JSON.stringify(config.anchors));
      loadLocal();
      restoreDeal();
      paint();
    }).catch(() => {
      const node = host();
      if (node) node.innerHTML = '<p>The gate file did not load.</p>';
    });
  }
  const previous = window.uwUpdate;
  window.uwUpdate = function () {
    const out = typeof previous === 'function' ? previous.apply(this, arguments) : undefined;
    schedulePaint();
    return out;
  };
  const previousMode = window.viewMode;
  if (typeof previousMode === 'function') {
    window.viewMode = function (mode) {
      const out = previousMode.apply(this, arguments);
      if (mode === 'deal') setTimeout(paint, 50);
      return out;
    };
  }
  boot();
  window.lcGates = {paint, current, loadExample, examples: () => EXAMPLES.map((item) => ({id: item.id, title: item.title})), exampleId: () => (engaged && catalogue && catalogue.id) || ''};
})();
