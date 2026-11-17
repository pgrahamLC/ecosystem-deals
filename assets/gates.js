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
  function bar(row) {
    const width = row.status === 'pass' ? 100 : (row.status === 'fail' ? 70 : 36);
    const head = row.unit === 'x' ? row.headroom + 'x' : (row.unit === 'bp' && row.headroom != null ? (row.headroom > 0 ? '+' : '') + row.headroom + 'bp' : '');
    return '<button type="button" class="bd-bar ' + row.status + '" data-gate="' + row.n + '"><span>' + row.n + ' ' + esc(row.name) + '</span><i><b style="width:' + width + '%"></b></i><em>' + esc(head || row.valueText) + '</em></button>';
  }
  function html(result) {
    const anchors = config.anchors;
    const fields = '<div class="bd-buy-counts">'
      + '<label class="bd-src">Gilt %<input id="gate-gilt" type="number" step="0.1" value="' + (anchors.gilt * 100) + '"></label>'
      + '<label class="bd-src">Debt cost %<input id="gate-debt" type="number" step="0.1" value="' + (anchors.debtCost * 100) + '"></label>'
      + '<label class="bd-src">Exit yield %<input id="gate-exit" type="number" step="0.1" value="' + (anchors.exitYield * 100) + '"></label>'
      + '<label class="bd-src">Hold years<input id="gate-hold" type="number" step="1" value="' + anchors.holdYears + '"></label>'
      + '</div>';
    if (!result || result.error) {
      return '<div class="bd"><p class="bd-kicker">Deal</p><h1>Fourteen gates</h1>' + fields + '<p>Enter price, rent, loan and exit yield. Until then every quantitative gate is not testable yet, and that is not a pass.</p><p>' + esc(result && result.error || '') + '</p></div>';
    }
    const tiles = [
      ['Verdict', result.verdict + (result.verdict === 'FAIL' ? ' ' + result.fails : '')],
      ['Cleared', result.cleared + ' of 14'],
      ['Binding gate', result.binding.n + ' ' + result.binding.name],
      ['Downside', result.downside]
    ];
    const charts = result.groups.map(([id, label, nums]) => {
      const rows = result.gates.filter((gate) => nums.indexOf(gate.n) >= 0);
      return '<article class="bd-chart"><h2>' + label + '</h2>' + rows.map(bar).join('') + '</article>';
    }).join('');
    const drill = open && result.gates.find((gate) => gate.n === open);
    const ticks = [
      ['attribution', 'Income and capital are shown separately, with a flat exit yield and no house price growth'],
      ['bridge', 'The bridge is net of all fees, including LC fees and leakage'],
      ['fees', 'Year one NOI is after LC fees'],
      ['term', 'Unexpired term and valuation basis are on file'],
      ['cashOut', 'IC has approved a cash out above 80% LTC']
    ].map(([id, label]) => '<label class="gn-check"><input type="checkbox" data-ev="' + id + '"' + (evidence[id] ? ' checked' : '') + '> ' + label + '</label>').join('');
    return '<div class="bd"><div class="bd-top"><div><p class="bd-kicker">Deal</p><h1>Fourteen gates</h1></div><div class="bd-auc"><button type="button" data-scen="base"' + (scenario === 'base' ? ' class="on"' : '') + '>Base</button><button type="button" data-scen="down"' + (scenario === 'down' ? ' class="on"' : '') + '>Downside</button></div></div>'
      + '<p class="bd-src">Gilts ' + G.pct(anchors.gilt) + '. Debt cost ' + G.pct(anchors.debtCost) + '. These anchors are to be confirmed by the CFO. A deal must clear all 14. One fail stops it. No gate is waived.</p>'
      + fields
      + '<div class="bd-kpis">' + tiles.map((row) => '<div class="bd-tile"><span>' + esc(row[0]) + '</span><b>' + esc(row[1]) + '</b></div>').join('') + '</div>'
      + '<div class="bd-charts">' + charts + '</div>'
      + '<article class="bd-chart"><h2>Takeaways</h2><ul class="bd-take"><li>' + esc(G.takeaway(result)) + '</li><li>Downside is exit yield plus 50bp and rent minus 10%. Upside earns no credit.</li><li>Amber is not cleared. IC to ratify, December 2026, is not a pass.</li></ul></article>'
      + '<div class="bd-chart"><h2>Evidence</h2>' + ticks
      + '<label class="bd-src">Tenant contract income £<input id="gate-income" inputmode="decimal" value="' + esc(operatorIncome) + '" placeholder="Blank if not known"></label>'
      + '<label class="bd-src">Approved cheque £<input id="gate-cheque" inputmode="decimal" value="' + esc(cheque) + '" placeholder="Blank if not set"></label></div>'
      + (drill ? '<section class="bd-drill"><p class="bd-kicker">Gate ' + drill.n + '</p><button type="button" class="btn sec" id="gate-back">Back to the scorecard</button><h2>' + esc(drill.name) + '</h2><p>' + esc(drill.valueText) + ' against ' + esc(drill.thresholdText) + '</p><p>' + esc(drill.calc) + '</p><p class="bd-src">' + esc(drill.evidence) + '</p></section>' : '')
      + '<details class="bd-fold"><summary>Show detail</summary><div class="scroll"><table><thead><tr><th>Gate</th><th>Status</th><th>Value</th><th>Threshold</th></tr></thead><tbody>'
      + result.gates.map((gate) => '<tr><td>' + gate.n + ' ' + esc(gate.name) + '</td><td>' + gate.status + '</td><td>' + esc(gate.valueText) + '</td><td>' + esc(gate.thresholdText) + '</td></tr>').join('')
      + '</tbody></table></div></details></div>';
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
        saveLocal();
        paint();
      };
    });
    ['gate-income', 'gate-cheque'].forEach((id) => {
      const input = node.querySelector('#' + id);
      if (!input) return;
      input.onchange = () => {
        if (id === 'gate-income') operatorIncome = input.value.trim();
        else cheque = input.value.trim();
        paint();
      };
    });
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
    paint();
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
