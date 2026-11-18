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
      view.insertBefore(node, view.firstChild);
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
  function downsideMetrics() {
    if (typeof UW === 'undefined' || !UW.state || !config) return null;
    const t = G.thresholds(config);
    const copy = JSON.parse(JSON.stringify(UW.state));
    copy.exitYield = Number(copy.exitYield) + (config.spreadsBp.downsideExit / 100);
    copy.rows = (copy.rows || []).map((row) => Object.assign({}, row, {annualRent: Number(row.annualRent) * (1 - config.downsideRentCut)}));
    const result = UW.compute(copy);
    const metrics = metricsFrom(result, copy);
    if (!metrics) return null;
    return {
      multiple: metrics.leveredMultiple,
      dscr: metrics.dscr,
      unleveredIrr: metrics.unleveredIrr,
      ltv: metrics.ltv
    };
  }
  function current() {
    if (typeof UW === 'undefined' || !UW.compute || !UW.state || !config) return null;
    const base = UW.compute(UW.state);
    const metrics = metricsFrom(base, UW.state);
    if (!metrics) return {error: (base && base.errors || []).join(' ')};
    if (scenario === 'down') {
      const downState = JSON.parse(JSON.stringify(UW.state));
      downState.exitYield = Number(downState.exitYield) + (config.spreadsBp.downsideExit / 100);
      downState.rows = (downState.rows || []).map((row) => Object.assign({}, row, {annualRent: Number(row.annualRent) * (1 - config.downsideRentCut)}));
      const downResult = UW.compute(downState);
      const downMetrics = metricsFrom(downResult, downState);
      if (downMetrics) {
        metrics.dscr = downMetrics.dscr;
        metrics.breakEvenUnlev = downMetrics.breakEvenUnlev;
        metrics.breakEvenLev = downMetrics.breakEvenLev;
      }
    }
    metrics.downside = downsideMetrics();
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
  function html(result) {
    const anchors = config.anchors;
    const deal = typeof UW !== 'undefined' && UW.state ? UW.state : {};
    const rent = deal.rows && deal.rows[0] ? deal.rows[0].annualRent : '';
    const lease = deal.income_mode === 'lha' ? 'LHA' : 'Mack Living';
    const flow = '<ol class="deal-flow"><li><b>1</b> Inputs</li><li><b>2</b> Hurdles</li><li><b>3</b> Verdict</li></ol><p class="deal-help">Fill the inputs, read the 14 hurdles, then read the verdict. A pass means every hurdle is clear. One fail stops the deal.</p>';
    const step1 = '<section class="bd-chart deal-step"><p class="bd-kicker">Step 1</p><h2>Inputs</h2><p class="bd-src">Type the deal here. A grey Default tag is a starting figure, and you can change it. Hover a dotted word if you want the longer name.</p><div class="deal-groups">'
      + '<div><h3>What you pay</h3>'
      + field('deal-price', 'Purchase price, £', deal.price, 'What you pay for the homes. 0 means you have not set a price yet.')
      + field('deal-fees', 'Buying fees, %', deal.acqCostsPct, 'Legal and agent fees, as a share of the price. Stamp duty is worked out from the price. You do not type it.', true)
      + field('deal-capex', 'Works budget, £', deal.capex, 'Extra spend to get the homes ready. Sometimes called capex. 0 means no works budget yet.')
      + '</div><div><h3>The rent</h3>'
      + field('deal-rent', 'Year one rent, £', rent, 'The rent you expect in the first year, before running costs.')
      + '<label class="deal-field"><span>Lease route <em class="deal-default">Default, you can change it</em></span><select id="deal-lease"><option' + (lease === 'Mack Living' ? ' selected' : '') + '>Mack Living</option><option' + (lease === 'LHA' ? ' selected' : '') + '>LHA</option></select><small class="deal-help">Mack Living is a lease to Mack. <abbr title="LHA is the Local Housing Allowance, a housing benefit benchmark.">LHA</abbr> is demand backed by that allowance.</small></label>'
      + field('deal-voids', 'Empty time, %', deal.voidPct || 0, 'The share of the year you expect the home to sit empty. This is recorded only. The hurdles still use the rent you typed.', true)
      + field('deal-opex', 'Running costs, % of rent', deal.opexMargin, 'Bills, management and repairs, as a share of rent. Sometimes called opex. The hurdles will not run until you fill this.')
      + '</div><div><h3>The loan</h3>'
      + field('deal-ltv', '<abbr title="LTV means loan to value, the loan as a share of the price.">Loan share of the price</abbr>, %', deal.ltv, 'How much of the price is borrowed.', true)
      + field('deal-interest', 'Interest on this loan, %', deal.interest, 'The yearly interest you expect to pay on this loan.', true)
      + '</div><div><h3>The test settings</h3>'
      + field('gate-gilt', '<abbr title="A gilt is a UK government bond. The return hurdles are built from this yield.">Government bond yield</abbr>, %', anchors.gilt * 100, 'The starting point for the return hurdles.', true)
      + field('gate-debt', '<abbr title="The hurdles use this rate. It is separate from the interest on this loan.">Test interest rate</abbr>, %', anchors.debtCost * 100, 'Used to test the loan. It is not the interest box above.', true)
      + field('gate-exit', '<abbr title="Exit yield is the return a buyer would want when you sell.">Sale yield</abbr>, %', anchors.exitYield * 100, 'A higher number means a lower sale price.', true)
      + field('gate-hold', 'Years you hold it', anchors.holdYears, 'How long you keep the homes.', true)
      + field('gate-income', 'Tenant contract income, £', operatorIncome, 'What the tenant is contracted to receive. Leave blank if it is not on file. A blank is not a pass.')
      + field('gate-cheque', '<abbr title="The approved cheque is the most of your own money this deal may use.">Most you can invest</abbr>, £', cheque, 'Leave blank if this has not been set.')
      + '</div></div></section>';
    const verdictWord = result && result.verdict ? result.verdict : 'Not ready';
    const tone = verdictWord === 'PASS' ? 'pass' : (verdictWord === 'FAIL' ? 'fail' : 'wait');
    const verdictBlock = '<section class="bd-chart deal-step" id="deal-verdict"><p class="bd-kicker">Verdict</p><h2>Does this deal clear?</h2><b class="verdict-badge lg ' + tone + '">' + esc(verdictWord) + '</b><p class="deal-next">' + esc(nextStep(result)) + '</p><div class="deal-strip"><span>Price £' + esc(deal.price || 0) + '</span><span>Rent £' + esc(rent || 0) + '</span><span>Lease ' + esc(lease) + '</span><span>Loan ' + esc(deal.ltv || 0) + '%</span></div></section>';
    if (!result || result.error) {
      return '<div class="bd"><p class="bd-kicker">Deal</p><h1>Test a deal</h1>' + flow + step1
        + '<section class="deal-step bd-chart"><p class="bd-kicker">Step 2</p><h2>Hurdles</h2><p>The 14 hurdles appear here once the purchase price, the year one rent and the running costs are filled. Until then this is not a pass.</p></section>'
        + verdictBlock + '</div>';
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
    return '<div class="bd"><p class="bd-kicker">Deal</p><h1>Test a deal</h1>' + flow + step1
      + '<section class="deal-step"><div class="bd-top"><div><p class="bd-kicker">Step 2</p><h1>Hurdles</h1></div><div class="bd-auc"><button type="button" data-scen="base"' + (scenario === 'base' ? ' class="on"' : '') + '>Expected case</button><button type="button" data-scen="down"' + (scenario === 'down' ? ' class="on"' : '') + '>Worse case</button></div></div>'
      + '<p class="bd-src">All 14 must pass. One fail stops the deal. Nothing is waived. Click a hurdle to see why. A dotted word has a plain explanation.</p>'
      + '<div class="bd-kpis">' + tiles.map((row) => '<div class="bd-tile"><span>' + esc(row[0]) + '</span><b>' + esc(row[1]) + '</b></div>').join('') + '</div>'
      + '<div class="bd-charts">' + charts + '</div>'
      + '<div class="bd-chart"><h2>Tick these when the paper is on file</h2><p class="bd-src">An unticked box keeps that hurdle as needs evidence. Needs evidence is not a pass.</p>' + ticks + '</div></section>'
      + verdictBlock
      + '<article class="bd-chart"><h2>Why</h2><ul class="bd-take"><li>' + esc(G.takeaway(result)) + '</li><li>The worse case is a sale yield 0.5 points higher and rent 10% lower. A better case does not help you pass.</li><li>A hurdle marked for the investment committee in December 2026 is not a pass until they sign it off.</li></ul></article>'
      + (drill ? '<section class="bd-drill"><p class="bd-kicker">Hurdle ' + drill.n + '</p><button type="button" class="btn sec" id="gate-back">Back to the hurdles</button><h2>' + esc(plain[0]) + '</h2><p class="bd-src" title="' + esc(plain[1]) + '">' + esc(plain[1]) + '</p><p>' + esc(drill.valueText) + ' against ' + esc(drill.thresholdText) + '</p><p>' + esc(drill.calc) + '</p><p class="bd-src">' + esc(drill.evidence) + '</p></section>' : '')
      + '<details class="bd-fold"><summary>Show the official hurdle names</summary><div class="scroll"><table><thead><tr><th>Hurdle</th><th>Status</th><th>Value</th><th>Test</th></tr></thead><tbody>'
      + result.gates.map((gate) => '<tr><td>' + gate.n + ' ' + esc(gate.name) + '</td><td>' + gate.status + '</td><td>' + esc(gate.valueText) + '</td><td>' + esc(gate.thresholdText) + '</td></tr>').join('')
      + '</tbody></table></div></details></div>';
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
    node.querySelectorAll('[data-scen]').forEach((button) => button.onclick = () => { scenario = button.dataset.scen; paint(); });
    node.querySelectorAll('[data-ev]').forEach((box) => box.onchange = () => { evidence[box.dataset.ev] = box.checked; saveLocal(); paint(); });
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
    setDeal('deal-price', (value) => { UW.state.price = Number(value) || 0; });
    setDeal('deal-fees', (value) => { UW.state.acqCostsPct = Number(value) || 0; });
    setDeal('deal-capex', (value) => { UW.state.capex = Number(value) || 0; });
    setDeal('deal-rent', (value) => {
      if (!UW.state.rows[0]) UW.state.rows[0] = {tenure: 'Rent', units: 1, beds: '3', omv: 0, annualRent: 0};
      UW.state.rows[0].annualRent = Number(value) || 0;
      if (!UW.state.rows[0].units) UW.state.rows[0].units = 1;
    });
    setDeal('deal-voids', (value) => { UW.state.voidPct = Number(value) || 0; });
    setDeal('deal-opex', (value) => { UW.state.opexMargin = Number(value); });
    setDeal('deal-ltv', (value) => { UW.state.ltv = Number(value) || 0; });
    setDeal('deal-interest', (value) => { UW.state.interest = Number(value) || 0; });
    const lease = node.querySelector('#deal-lease');
    if (lease) lease.onchange = () => {
      if (typeof UW === 'undefined' || !UW.state) return;
      UW.state.income_mode = lease.value === 'LHA' ? 'lha' : 'direct';
      if (typeof uwUpdate === 'function') uwUpdate();
      else schedulePaint();
    };
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
      loadLocal();
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
  window.lcGates = {paint, current};
})();
