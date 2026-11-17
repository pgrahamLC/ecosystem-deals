/* Fourteen gates. One fail stops the deal. No gate is waived. */
(function (root) {
  'use strict';
  const GROUPS = [
    ['return', 'Return', [1, 2, 3, 4, 5, 6]],
    ['debt', 'Debt', [7, 8, 9, 10]],
    ['risk', 'Risk', [11, 12, 13, 14]]
  ];

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  function bp(rate) { return Math.round(rate * 10000); }
  function pct(rate) { return rate == null ? 'Not testable yet' : (rate * 100).toFixed(1) + '%'; }
  function times(value) { return value == null ? 'Not testable yet' : value.toFixed(2) + 'x'; }
  function money(value) {
    if (value == null || !Number.isFinite(value)) return 'Not testable yet';
    return '£' + Math.round(value).toLocaleString('en-GB');
  }
  function giltCompound(gilt, years) {
    return Math.pow(1 + gilt, years) - 1;
  }
  function multipleFor(hold, config) {
    const years = hold || config.anchors.holdYears;
    const row = (config.multiples || []).find((item) => years <= item.maxYears);
    return row ? row.multiple : 1.7;
  }
  function thresholds(config) {
    const a = config.anchors;
    const s = config.spreadsBp;
    const hold = a.holdYears;
    const yoc = Math.max(a.exitYield + s.yocOverExit / 10000, a.debtCost + s.yocOverDebt / 10000);
    return {
      gilt: a.gilt,
      debtCost: a.debtCost,
      exitYield: a.exitYield,
      hold,
      unleveredIrr: a.gilt + s.unleveredIrr / 10000,
      yoc,
      profitOnCost: giltCompound(a.gilt, hold),
      leveredIrr: a.gilt + s.leveredIrr / 10000,
      postTaxIrr: a.gilt + s.postTax / 10000,
      multiple: multipleFor(hold, config),
      cashOnCash: a.gilt + s.cashOnCash / 10000,
      leverageSpread: a.debtCost + s.leverageSpread / 10000,
      ltvMax: config.ltvMax,
      ltcFlag: config.ltcFlag,
      dscr: config.dscrMin,
      dscrStressRate: a.debtCost + s.leverageSpread / 10000,
      breakEven: a.exitYield + s.breakEven / 10000,
      downsideExit: a.exitYield + s.downsideExit / 10000,
      operatorCover: config.operatorCoverMin,
      concentration: config.concentrationMax,
      taxRate: config.taxRate
    };
  }
  function irr(cash) {
    if (!cash || cash.length < 2) return null;
    let rate = 0.1;
    for (let i = 0; i < 50; i++) {
      let npv = 0;
      let slope = 0;
      for (let t = 0; t < cash.length; t++) {
        const den = Math.pow(1 + rate, t);
        npv += cash[t] / den;
        if (t) slope -= t * cash[t] / Math.pow(1 + rate, t + 1);
      }
      if (!Number.isFinite(npv) || !slope) return null;
      const next = rate - npv / slope;
      if (Math.abs(next - rate) < 1e-7) return next;
      rate = next;
    }
    return Number.isFinite(rate) ? rate : null;
  }
  function postTaxIrr(metrics, config) {
    if (metrics.postTaxIrr != null) return metrics.postTaxIrr;
    const flows = metrics.annualLevered;
    if (!flows || flows.length < 2) return null;
    const tax = config.taxRate;
    const taxed = flows.map((row, index) => {
      if (!index) return row;
      const profit = row > 0 ? row : 0;
      return row - profit * tax;
    });
    return irr(taxed);
  }
  function gate(partial) {
    return Object.assign({headroom: null, unit: '', valueText: '', thresholdText: '', calc: '', evidence: ''}, partial);
  }
  function minRatio(actual, threshold) {
    if (actual == null || !threshold) return null;
    return (actual - threshold) / Math.abs(threshold);
  }
  function maxRatio(actual, threshold) {
    if (actual == null || !threshold) return null;
    return (threshold - actual) / Math.abs(threshold);
  }
  function score(metrics, evidence, config) {
    const t = thresholds(config);
    const ev = evidence || {};
    const m = metrics || {};
    const yoc = m.yieldOnCost;
    const profit = m.profitOnCost;
    const dscr = m.annualInterest > 0 ? m.noi / m.annualInterest : (m.debt ? null : null);
    const dscrUse = m.dscr != null ? m.dscr : dscr;
    const stressDebt = m.debt > 0 ? m.debt * t.dscrStressRate : 0;
    const dscrStress = stressDebt > 0 && m.noi != null ? m.noi / stressDebt : (m.debt ? null : null);
    const coc = m.cashOnCash != null ? m.cashOnCash : (m.peakEquity > 0 && m.noi != null ? (m.noi - (m.annualInterest || 0)) / m.peakEquity : null);
    const post = postTaxIrr(m, config);
    const gates = [];

    gates.push(gate({
      n: 1, group: 'return', name: 'Return attribution',
      status: ev.attribution ? 'pass' : 'amber',
      qualitative: true,
      valueText: ev.attribution ? 'Evidenced' : 'Needs evidence',
      thresholdText: 'Income and capital shown apart. Flat exit yield. No house price growth.',
      calc: 'Qualitative. Capital return uses a flat exit yield and no house price growth.',
      evidence: 'Tick only when the note shows income and capital separately on that basis.',
      headroom: ev.attribution ? 1 : -1, unit: ''
    }));

    const uIrr = m.unleveredIrr;
    gates.push(gate({
      n: 2, group: 'return', name: 'Unlevered IRR',
      status: uIrr == null ? 'amber' : (uIrr + 1e-8 >= t.unleveredIrr ? 'pass' : 'fail'),
      valueText: pct(uIrr), thresholdText: pct(t.unleveredIrr) + ' (gilts + 550bp)',
      calc: 'Asset level, net of fees, pre tax and pre debt.',
      evidence: 'Use the unlevered XIRR from the cash flow.',
      headroom: uIrr == null ? null : bp(uIrr - t.unleveredIrr), unit: 'bp',
      ratio: minRatio(uIrr, t.unleveredIrr)
    }));

    const yocOk = yoc != null && yoc + 1e-8 >= t.yoc;
    const pocOk = profit != null && profit + 1e-8 >= t.profitOnCost;
    gates.push(gate({
      n: 3, group: 'return', name: 'Yield on cost and profit on cost',
      status: yoc == null || profit == null ? 'amber' : (yocOk && pocOk ? 'pass' : 'fail'),
      valueText: pct(yoc) + ' and ' + pct(profit),
      thresholdText: pct(t.yoc) + ' yield on cost and ' + pct(t.profitOnCost) + ' profit on cost',
      calc: 'Stabilised rent over all in cost, including works. Profit on cost is unlevered profit over all in cost, net of fees.',
      evidence: 'All in cost must include the works contingency.',
      headroom: yoc == null ? null : bp(Math.min(yoc - t.yoc, (profit == null ? yoc - t.yoc : profit - t.profitOnCost))),
      unit: 'bp',
      ratio: yoc == null || profit == null ? null : Math.min(minRatio(yoc, t.yoc), minRatio(profit, t.profitOnCost))
    }));

    const levOk = m.leveredIrr != null && m.leveredIrr + 1e-8 >= t.leveredIrr;
    const taxOk = post != null && post + 1e-8 >= t.postTaxIrr;
    const mult = m.leveredMultiple;
    let g4 = 'amber';
    if ((m.leveredIrr != null && !levOk) || (post != null && !taxOk)) g4 = 'fail';
    else if (levOk && taxOk) g4 = 'amber';
    gates.push(gate({
      n: 4, group: 'return', name: 'Levered IRR, equity multiple and post tax',
      status: g4,
      ratify: true,
      valueText: pct(m.leveredIrr) + ', ' + times(mult) + ', post tax ' + pct(post),
      thresholdText: pct(t.leveredIrr) + ' levered, ' + t.multiple.toFixed(1) + 'x multiple, post tax ' + pct(t.postTaxIrr),
      calc: 'Post tax uses the 25% main rate on positive levered cash, stand alone. The multiple scale is IC to ratify, December 2026.',
      evidence: 'IRR and post tax are set. The multiple is not cleared until IC ratifies it.',
      headroom: m.leveredIrr == null ? null : bp(m.leveredIrr - t.leveredIrr), unit: 'bp',
      ratio: minRatio(m.leveredIrr, t.leveredIrr)
    }));

    gates.push(gate({
      n: 5, group: 'return', name: 'Net returns',
      status: ev.bridge ? 'pass' : 'amber',
      qualitative: true,
      valueText: ev.bridge ? 'Bridge evidenced' : 'Needs evidence',
      thresholdText: 'Gates 2 to 4 are net of all fees, including LC fees, costs and leakage.',
      calc: 'Gross rent ' + money(m.annualRent) + '. Opex ' + money(m.annualOpex) + '. NOI ' + money(m.noi) + '. Fees in all in cost ' + money(m.fees) + '.',
      evidence: 'Tick when the bridge includes LC fees and leakage, not only third party costs.',
      headroom: ev.bridge ? 1 : -1, unit: ''
    }));

    const chequeOk = m.cheque > 0 && m.peakEquity != null && m.peakEquity <= m.cheque * t.concentration && m.peakEquity <= m.cheque;
    const payOk = m.paybackYears != null && m.holdYears != null && m.paybackYears <= m.holdYears;
    const cocOk = coc != null && coc + 1e-8 >= t.cashOnCash;
    let g6 = 'amber';
    if (m.peakEquity != null && coc != null && m.paybackYears != null && (!payOk || !cocOk || (m.cheque > 0 && !chequeOk))) g6 = 'fail';
    gates.push(gate({
      n: 6, group: 'return', name: 'Peak equity, payback and cash on cash',
      status: g6,
      ratify: true,
      valueText: money(m.peakEquity) + ', payback ' + (m.paybackYears == null ? 'Not testable yet' : m.paybackYears.toFixed(1) + ' years') + ', ' + pct(coc),
      thresholdText: 'Inside the cheque and ' + pct(t.concentration) + ' concentration. Payback inside the hold. Cash on cash ' + pct(t.cashOnCash) + '.',
      calc: 'Marked IC to ratify, December 2026. A pass on the numbers is still not cleared.',
      evidence: 'Enter the approved cheque. Cash on cash is year one cash after interest, over peak equity.',
      headroom: coc == null ? null : bp(coc - t.cashOnCash), unit: 'bp',
      ratio: minRatio(coc, t.cashOnCash)
    }));

    const spreadOk = yoc != null && yoc + 1e-8 >= t.leverageSpread;
    const noDebt = !(m.debt > 0);
    gates.push(gate({
      n: 7, group: 'debt', name: 'Leverage spread',
      status: yoc == null ? 'amber' : (spreadOk || noDebt ? 'pass' : 'fail'),
      valueText: noDebt ? 'No debt' : pct(yoc),
      thresholdText: pct(t.leverageSpread) + ' (debt cost + 100bp)',
      calc: 'If this fails, the deal must clear with less debt or with none.',
      evidence: 'Test at drawdown and at each refinance. This model has the drawdown only.',
      headroom: yoc == null ? null : bp(yoc - t.leverageSpread), unit: 'bp',
      ratio: minRatio(yoc, t.leverageSpread)
    }));

    const ltv = m.ltv;
    const ltc = m.ltc;
    const ltvOk = ltv != null && ltv <= t.ltvMax + 1e-8;
    const cashOut = ltc != null && ltc > t.ltcFlag;
    gates.push(gate({
      n: 8, group: 'debt', name: 'LTV and LTC',
      status: ltv == null ? 'amber' : (ltvOk ? (cashOut && !ev.cashOut ? 'amber' : 'pass') : 'fail'),
      valueText: pct(ltv) + ' LTV, ' + pct(ltc) + ' LTC',
      thresholdText: 'LTV at most 60% on the lower of cost and value. LTC above 80% is a cash out.',
      calc: cashOut ? 'LTC is above 80% after funding. That cash out needs IC approval.' : 'Drawdown test. No refinance is modelled, so none is tested.',
      evidence: 'Tick cash out approval only if IC has approved an LTC above 80%.',
      headroom: ltv == null ? null : bp(t.ltvMax - ltv), unit: 'bp',
      ratio: maxRatio(ltv, t.ltvMax)
    }));

    const feesOk = !!ev.fees;
    gates.push(gate({
      n: 9, group: 'debt', name: 'Interest cover',
      status: !m.debt ? 'pass' : (dscrUse == null ? 'amber' : (!feesOk ? 'amber' : (dscrUse + 1e-8 >= t.dscr ? 'pass' : 'fail'))),
      valueText: !m.debt ? 'No debt' : times(dscrUse),
      thresholdText: t.dscr.toFixed(2) + 'x on year one stabilised income after LC fees',
      calc: 'NOI over year one interest. Without the fee tick this stays needs evidence.',
      evidence: 'Tick only when the NOI is after LC fees.',
      headroom: dscrUse == null ? null : Math.round((dscrUse - t.dscr) * 100) / 100, unit: 'x',
      ratio: minRatio(dscrUse, t.dscr)
    }));

    gates.push(gate({
      n: 10, group: 'debt', name: 'Refinance sensitivity',
      status: !m.debt ? 'pass' : (dscrStress == null ? 'amber' : (dscrStress + 1e-8 >= t.dscr ? 'pass' : 'fail')),
      valueText: !m.debt ? 'No debt' : times(dscrStress),
      thresholdText: t.dscr.toFixed(2) + 'x at ' + pct(t.dscrStressRate) + ' with no new equity',
      calc: 'Same debt balance. Interest reset to the debt cost plus 100bp.',
      evidence: 'No new equity is assumed.',
      headroom: dscrStress == null ? null : Math.round((dscrStress - t.dscr) * 100) / 100, unit: 'x',
      ratio: minRatio(dscrStress, t.dscr)
    }));

    const beU = m.breakEvenUnlev;
    const beL = m.breakEvenLev;
    const beOk = beU != null && beL != null && beU + 1e-8 >= t.breakEven && beL + 1e-8 >= t.breakEven;
    gates.push(gate({
      n: 11, group: 'risk', name: 'Break even exit yield',
      status: beU == null || beL == null ? 'amber' : (beOk ? 'pass' : 'fail'),
      valueText: 'Unlevered ' + pct(beU) + ', levered ' + pct(beL),
      thresholdText: pct(t.breakEven) + ' (exit yield + 100bp)',
      calc: 'Exit yield at which profit is zero. Both levered and unlevered must clear.',
      evidence: 'Uses this model exit NOI and costs. It is not a valuation.',
      headroom: beU == null || beL == null ? null : bp(Math.min(beU, beL) - t.breakEven), unit: 'bp',
      ratio: beU == null || beL == null ? null : Math.min(minRatio(beU, t.breakEven), minRatio(beL, t.breakEven))
    }));

    const down = m.downside || {};
    const downOk = down.multiple != null && down.dscr != null && down.unleveredIrr != null && down.ltv != null
      && down.multiple + 1e-8 >= config.downsideMultipleMin
      && down.dscr + 1e-8 >= config.downsideDscrMin
      && down.unleveredIrr >= -1e-8
      && down.ltv <= t.ltvMax + 1e-8;
    gates.push(gate({
      n: 12, group: 'risk', name: 'Base, downside and upside',
      status: down.multiple == null ? 'amber' : (downOk ? 'pass' : 'fail'),
      valueText: down.multiple == null ? 'Not testable yet' : times(down.multiple) + ' multiple, ' + times(down.dscr) + ' DSCR, ' + pct(down.unleveredIrr),
      thresholdText: 'Downside multiple at least 1.0x, DSCR at least 1.0x, unlevered IRR at least 0%, loan inside 60% LTV.',
      calc: 'Downside is exit yield plus 50bp and rent minus 10%. Upside earns no credit.',
      evidence: 'The base case is the other gates. This gate is the downside only.',
      headroom: down.dscr == null ? null : Math.round((down.dscr - config.downsideDscrMin) * 100) / 100, unit: 'x',
      ratio: minRatio(down.dscr, config.downsideDscrMin)
    }));

    const cover = m.operatorCover;
    gates.push(gate({
      n: 13, group: 'risk', name: 'Operator rent cover',
      status: cover == null ? 'amber' : (cover + 1e-8 >= t.operatorCover ? 'pass' : 'fail'),
      valueText: cover == null ? 'Needs evidence' : times(cover),
      thresholdText: t.operatorCover.toFixed(2) + 'x contract income over the rent',
      calc: 'Tenant contract income divided by the rent.',
      evidence: 'Enter the tenant contract income. A blank is not a pass.',
      headroom: cover == null ? null : Math.round((cover - t.operatorCover) * 100) / 100, unit: 'x',
      ratio: minRatio(cover, t.operatorCover)
    }));

    gates.push(gate({
      n: 14, group: 'risk', name: 'Unexpired term at exit',
      status: ev.term ? 'pass' : 'amber',
      qualitative: true,
      valueText: ev.term ? 'Evidenced' : 'Needs evidence',
      thresholdText: 'At least 7 years unbreakable, and never below the lower of vacant possession and short income value. A long income price needs a signed lease of 15 years or more.',
      calc: 'Qualitative. Comparable evidence is required.',
      evidence: 'Tick only when the term and the valuation basis are on file.',
      headroom: ev.term ? 1 : -1, unit: ''
    }));

    const cleared = gates.filter((row) => row.status === 'pass').length;
    const fails = gates.filter((row) => row.status !== 'pass');
    const ranked = gates.filter((row) => row.ratio != null).sort((a, b) => a.ratio - b.ratio);
    const binding = ranked[0] || gates.find((row) => row.status !== 'pass') || gates[0];
    const maxLtv = suggestLtv(m, t);
    const maxPrice = m.noi > 0 && t.yoc > 0 ? m.noi / t.yoc : null;
    return {
      thresholds: t,
      gates,
      cleared,
      fails: fails.length,
      verdict: cleared === 14 ? 'PASS' : 'FAIL',
      downside: gates[11].status === 'pass' ? 'PASS' : 'FAIL',
      binding,
      maxLtv,
      maxPrice,
      groups: GROUPS
    };
  }
  function suggestLtv(m, t) {
    if (!(m.price > 0) || !(m.noi > 0)) return null;
    if (m.yieldOnCost != null && m.yieldOnCost + 1e-8 < t.leverageSpread) return 0;
    const rate = m.interestRate > 0 ? m.interestRate : t.debtCost;
    const byDscr = m.noi / (t.dscr * m.price * rate);
    const byStress = m.noi / (t.dscr * m.price * t.dscrStressRate);
    return Math.max(0, Math.min(t.ltvMax, byDscr, byStress));
  }
  function parseRent(text) {
    const src = String(text || '');
    const year = src.match(/£\s*([0-9][0-9,]*)\s*(?:pa|p\.a\.|per annum)/i);
    if (year) return Number(year[1].replace(/,/g, ''));
    const month = src.match(/£\s*([0-9][0-9,]*)\s*(?:pcm|per month)/i);
    if (month) return Number(month[1].replace(/,/g, '')) * 12;
    return null;
  }
  function lotScreen(lot, config) {
    const price = num(lot && lot.guide_price);
    const text = ['title', 'grade_evidence', 'verification_note'].map((key) => lot && lot[key] ? String(lot[key]) : '').join(' ');
    const rent = parseRent(text);
    if (!(price > 0) || !(rent > 0)) {
      return {tag: 'untested', label: 'Not testable yet', reason: 'Guide price or rent is not on the listing. Not testable yet.'};
    }
    const gross = rent / price;
    const hurdle = thresholds(config).yoc;
    if (gross + 1e-8 < hurdle) {
      return {tag: 'out', label: 'Screens out on gate 3', reason: 'Gross yield ' + pct(gross) + ' is below the ' + pct(hurdle) + ' yield on cost hurdle, before costs.'};
    }
    return {tag: 'holds', label: 'Price screen holds', reason: 'Gross yield clears the yield on cost hurdle only. Other gates are not testable yet. This is not a pass.'};
  }
  function takeaway(result) {
    if (!result) return 'Gates are not testable yet.';
    if (result.verdict === 'PASS') return 'All 14 gates are cleared. The deal can proceed to IC.';
    const failed = result.gates.filter((row) => row.status === 'fail').map((row) => row.name);
    const amber = result.gates.filter((row) => row.status === 'amber').map((row) => row.n);
    const join = (items) => items.length <= 1 ? (items[0] || '') : items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
    let line = result.fails + ' of 14 are not cleared.';
    if (failed.length) line += ' Fails on ' + join(failed) + '.';
    if (result.maxLtv === 0) line += ' Yield on cost is below the debt hurdle, so cutting LTV does not fix it.';
    else if (result.maxLtv != null) line += ' Debt clears the cover tests at an LTV up to ' + pct(result.maxLtv) + '.';
    if (result.maxPrice) line += ' All in cost must be at most ' + money(result.maxPrice) + ' to clear yield on cost.';
    if (amber.length) line += ' Needs evidence on ' + amber.join(', ') + '.';
    return line;
  }

  root.GatesModel = Object.freeze({
    thresholds, score, lotScreen, takeaway, parseRent, irr, multipleFor, GROUPS, pct, times, money, bp
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
