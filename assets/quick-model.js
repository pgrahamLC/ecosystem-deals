/* Quick model: entry price or NIY, year one rent, opex, rent growth, debt and exit. Annual, interest-only. */
(function (root) {
  'use strict';

  function num(value) {
    if (value === '' || value == null) return NaN;
    const n = Number(String(value).replace(/[£,%\s]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }
  function irr(flows) {
    const npv = (rate) => flows.reduce((sum, flow, year) => sum + flow / Math.pow(1 + rate, year), 0);
    if (!(flows[0] < 0) || !flows.slice(1).some((flow) => flow > 0)) return null;
    let low = -0.99;
    let high = 10;
    if (npv(low) < 0 || npv(high) > 0) return null;
    for (let i = 0; i < 200; i += 1) {
      const mid = (low + high) / 2;
      if (npv(mid) > 0) low = mid; else high = mid;
    }
    return (low + high) / 2;
  }

  // Every rate comes in as a percentage, for example 6.5 for 6.5%.
  function compute(input) {
    const basis = input.basis === 'niy' ? 'niy' : 'price';
    const rent1 = num(input.rent1);
    const opex = num(input.opexPct) / 100;
    const growth = (Number.isFinite(num(input.growthPct)) ? num(input.growthPct) : 0) / 100;
    const costs = (Number.isFinite(num(input.costsPct)) ? num(input.costsPct) : 0) / 100;
    const ltv = (Number.isFinite(num(input.ltvPct)) ? num(input.ltvPct) : 0) / 100;
    const rate = (Number.isFinite(num(input.ratePct)) ? num(input.ratePct) : 0) / 100;
    const hold = Math.round(num(input.holdYears));
    const exitYield = num(input.exitYieldPct) / 100;
    const saleCosts = (Number.isFinite(num(input.saleCostsPct)) ? num(input.saleCostsPct) : 0) / 100;
    // The manager fee is either yearly, or charged on the way in and out, or both. Blank means no fee.
    const feeMode = ['annual', 'entryexit', 'both'].indexOf(input.feeMode) >= 0 ? input.feeMode : 'none';
    const part = (value) => (Number.isFinite(num(value)) && num(value) > 0 ? num(value) : 0) / 100;
    const feeAnnual = feeMode === 'annual' || feeMode === 'both' ? part(input.feeAnnualPct) : 0;
    const feeEntry = feeMode === 'entryexit' || feeMode === 'both' ? part(input.feeEntryPct) : 0;
    const feeExit = feeMode === 'entryexit' || feeMode === 'both' ? part(input.feeExitPct) : 0;

    const missing = [];
    if (!(rent1 > 0)) missing.push('year one rent');
    if (!(opex >= 0 && opex < 1)) missing.push('opex');
    if (basis === 'price' && !(num(input.price) > 0)) missing.push('purchase price');
    if (basis === 'niy' && !(num(input.niyPct) > 0)) missing.push('entry NIY');
    if (!(hold >= 1 && hold <= 40)) missing.push('hold, in years');
    if (!(exitYield > 0)) missing.push('exit yield');
    if (!(ltv >= 0 && ltv < 1)) missing.push('loan share');
    if (missing.length) return {ok: false, missing};

    const noi = (year) => rent1 * Math.pow(1 + growth, year - 1) * (1 - opex);
    const noi1 = noi(1);
    const price = basis === 'niy' ? noi1 / ((num(input.niyPct) / 100) * (1 + costs)) : num(input.price);
    const entryFee = price * feeEntry;
    const allIn = price * (1 + costs) + entryFee;
    // NIY is a property figure, so it leaves the manager fee out. Yield on cost uses the full all-in cost.
    const niy = noi1 / (price * (1 + costs));
    const yearFee = allIn * feeAnnual;
    const debt = price * ltv;
    const equity = allIn - debt;
    const interest = debt * rate;
    const exitNoi = noi(hold + 1);
    const exitValue = exitNoi / exitYield;
    const exitFee = exitValue * feeExit;
    // The yearly fee comes out of cash each year. It does not lower the sale value, which rests on the property NOI.
    const netSale = exitValue * (1 - saleCosts) - exitFee;

    const years = [];
    const unlevered = [-allIn];
    const levered = [-equity];
    for (let year = 1; year <= hold; year += 1) {
      const rent = rent1 * Math.pow(1 + growth, year - 1);
      const income = noi(year);
      const last = year === hold;
      years.push({year, rent, opex: rent - income, noi: income, fee: yearFee, interest, cash: income - yearFee - interest});
      unlevered.push(income - yearFee + (last ? netSale : 0));
      levered.push(income - yearFee - interest + (last ? netSale - debt : 0));
    }
    const back = levered.slice(1).reduce((sum, flow) => sum + flow, 0);
    const income = years.reduce((sum, row) => sum + row.cash, 0);
    // The exit value at which equity only just comes back, and the yield that implies.
    const neededSale = (equity - income + debt) / (1 - saleCosts - feeExit);
    return {
      ok: true, basis, price, niy, allIn, purchaseCosts: allIn - price, noi1, yieldOnCost: noi1 / allIn,
      feeMode, fees: {entry: entryFee, yearly: yearFee, exit: exitFee, total: entryFee + yearFee * hold + exitFee},
      debt, equity, interest, hold, exitNoi, exitValue, netSale, saleCosts: exitValue * saleCosts,
      years, unleveredIrr: irr(unlevered), leveredIrr: irr(levered),
      multiple: equity > 0 ? back / equity : null, profit: back - equity,
      cashOnCash: equity > 0 ? (noi1 - yearFee - interest) / equity : null,
      interestCover: interest > 0 ? (noi1 - yearFee) / interest : null,
      ltv, exitLtv: exitValue > 0 ? debt / exitValue : null,
      breakEvenYield: neededSale > 0 ? exitNoi / neededSale : null,
      flows: {unlevered, levered}
    };
  }

  // A quick read against the numeric hurdles. The full 14 hurdle test stays on the Deal sheet.
  function screen(result, limits) {
    if (!result || !result.ok || !limits) return [];
    const row = (name, value, limit, pass, kind) => ({name, value, limit, kind, pass: value == null ? null : pass});
    const atLeast = (value, limit) => value != null && value >= limit - 1e-9;
    return [
      row('Unlevered IRR', result.unleveredIrr, limits.unleveredIrr, atLeast(result.unleveredIrr, limits.unleveredIrr), 'pct'),
      row('Yield on cost', result.yieldOnCost, limits.yoc, atLeast(result.yieldOnCost, limits.yoc), 'pct'),
      row('Levered IRR', result.leveredIrr, limits.leveredIrr, atLeast(result.leveredIrr, limits.leveredIrr), 'pct'),
      row('Equity multiple', result.multiple, limits.multiple, atLeast(result.multiple, limits.multiple), 'times'),
      row('Year one cash on cash', result.cashOnCash, limits.cashOnCash, atLeast(result.cashOnCash, limits.cashOnCash), 'pct'),
      row('Loan share of price', result.ltv, limits.ltvMax, result.ltv <= limits.ltvMax + 1e-9, 'max'),
      row('Interest cover', result.interestCover, limits.dscr, result.debt > 0 ? atLeast(result.interestCover, limits.dscr) : true, 'times'),
      row('Break even exit yield', result.breakEvenYield, limits.breakEven, atLeast(result.breakEvenYield, limits.breakEven), 'pct')
    ];
  }

  root.QuickModel = Object.freeze({compute, screen, irr, num});
})(typeof globalThis !== 'undefined' ? globalThis : this);
