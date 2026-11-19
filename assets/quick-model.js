/* Quick model: entry price or NIY, year one rent, opex, rent growth, debt and exit. Monthly. The loan is interest only or repaid over a term. */
(function (root) {
  'use strict';

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function num(value) {
    if (value === '' || value == null) return NaN;
    const n = Number(String(value).replace(/[£,%\s]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }
  // A month is written as 2027-01. Its index counts months, so two indexes subtract to a number of months.
  function monthIndex(text) {
    const match = String(text || '').match(/^(\d{4})-(\d{1,2})$/);
    if (!match) return NaN;
    const month = Number(match[2]);
    return month >= 1 && month <= 12 ? Number(match[1]) * 12 + month - 1 : NaN;
  }
  function monthLabel(index) {
    return MONTHS[((index % 12) + 12) % 12] + ' ' + Math.floor(index / 12);
  }
  function monthText(index) {
    return Math.floor(index / 12) + '-' + String((index % 12) + 1).padStart(2, '0');
  }
  // Rate per period that discounts the flows to nil. Flows are one period apart.
  function irr(flows) {
    const npv = (rate) => flows.reduce((sum, flow, period) => sum + flow / Math.pow(1 + rate, period), 0);
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
  function yearly(monthlyRate) {
    return monthlyRate == null ? null : Math.pow(1 + monthlyRate, 12) - 1;
  }

  // Every rate comes in as a percentage, for example 6.5 for 6.5%. Rent and rates are yearly figures.
  function compute(input) {
    const basis = input.basis === 'niy' ? 'niy' : 'price';
    const rent1 = num(input.rent1);
    const opex = num(input.opexPct) / 100;
    const growth = (Number.isFinite(num(input.growthPct)) ? num(input.growthPct) : 0) / 100;
    const costs = (Number.isFinite(num(input.costsPct)) ? num(input.costsPct) : 0) / 100;
    const ltv = (Number.isFinite(num(input.ltvPct)) ? num(input.ltvPct) : 0) / 100;
    const rate = (Number.isFinite(num(input.ratePct)) ? num(input.ratePct) : 0) / 100;
    const entry = monthIndex(input.entryMonth);
    const exit = monthIndex(input.exitMonth);
    const months = exit - entry;
    const exitYield = num(input.exitYieldPct) / 100;
    const saleCosts = (Number.isFinite(num(input.saleCostsPct)) ? num(input.saleCostsPct) : 0) / 100;
    const amortising = input.loanType === 'amort' && ltv > 0;
    const termMonths = Math.round(num(input.termYears) * 12);

    const missing = [];
    if (!(rent1 > 0)) missing.push('year one rent');
    if (!(opex >= 0 && opex < 1)) missing.push('opex');
    if (basis === 'price' && !(num(input.price) > 0)) missing.push('purchase price');
    if (basis === 'niy' && !(num(input.niyPct) > 0)) missing.push('entry NIY');
    if (!Number.isFinite(entry)) missing.push('entry month');
    if (!Number.isFinite(exit)) missing.push('exit month');
    else if (Number.isFinite(entry) && !(months >= 1 && months <= 480)) missing.push('an exit month after the entry month');
    if (!(exitYield > 0)) missing.push('exit yield');
    if (!(ltv >= 0 && ltv < 1)) missing.push('loan share');
    if (amortising && !(termMonths >= 1 && termMonths <= 600)) missing.push('loan term, in years');
    if (missing.length) return {ok: false, missing};

    // Month 1 is the entry month. Rent steps up once a year, on each anniversary of entry.
    const rentIn = (month) => rent1 / 12 * Math.pow(1 + growth, Math.floor((month - 1) / 12));
    const noiIn = (month) => rentIn(month) * (1 - opex);
    const noi1 = rent1 * (1 - opex);
    const price = basis === 'niy' ? noi1 / ((num(input.niyPct) / 100) * (1 + costs)) : num(input.price);
    const allIn = price * (1 + costs);
    const niy = noi1 / allIn;
    const debt = price * ltv;
    const equity = allIn - debt;
    // Interest only: interest on the full loan each month, and the whole loan repaid from the sale.
    // Repaid over a term: one level monthly payment that clears the loan over the term. Whatever is still owed is repaid from the sale.
    const monthlyRate = rate / 12;
    const payment = !amortising ? 0 : (monthlyRate > 0 ? debt * monthlyRate / (1 - Math.pow(1 + monthlyRate, -termMonths)) : debt / termMonths);
    // Sale value rests on the twelve months of NOI after the sale.
    let exitNoi = 0;
    for (let month = months + 1; month <= months + 12; month += 1) exitNoi += noiIn(month);
    const exitValue = exitNoi / exitYield;
    const netSale = exitValue * (1 - saleCosts);

    const rows = [];
    const unlevered = [-allIn];
    const levered = [-equity];
    let balance = debt;
    for (let month = 1; month <= months; month += 1) {
      const rent = rentIn(month);
      const income = noiIn(month);
      const last = month === months;
      const interest = balance * monthlyRate;
      const principal = amortising ? Math.max(0, Math.min(balance, payment - interest)) : 0;
      balance -= principal;
      if (balance < 1e-6) balance = 0;
      const service = interest + principal;
      rows.push({month, label: monthLabel(entry + month - 1), rent, opex: rent - income, noi: income, interest, principal, balance, cash: income - service, sale: last ? netSale - balance : 0});
      unlevered.push(income + (last ? netSale : 0));
      levered.push(income - service + (last ? netSale - balance : 0));
    }
    const loanAtExit = balance;
    const years = [];
    rows.forEach((row) => {
      const index = Math.floor((row.month - 1) / 12);
      if (!years[index]) years[index] = {year: index + 1, from: row.label, to: row.label, months: 0, rent: 0, opex: 0, noi: 0, interest: 0, principal: 0, cash: 0, sale: 0, balance: 0};
      const year = years[index];
      year.to = row.label;
      year.months += 1;
      year.balance = row.balance;
      ['rent', 'opex', 'noi', 'interest', 'principal', 'cash', 'sale'].forEach((key) => { year[key] += row[key]; });
    });
    const back = levered.slice(1).reduce((sum, flow) => sum + flow, 0);
    const income = rows.reduce((sum, row) => sum + row.cash, 0);
    const firstYear = rows.slice(0, 12);
    const span = firstYear.length / 12;
    const firstNoi = firstYear.reduce((sum, row) => sum + row.noi, 0) / span;
    const firstInterest = firstYear.reduce((sum, row) => sum + row.interest, 0) / span;
    const firstService = firstYear.reduce((sum, row) => sum + row.interest + row.principal, 0) / span;
    // The sale value at which equity only just comes back, and the yield that implies.
    const neededSale = (equity - income + loanAtExit) / (1 - saleCosts);
    return {
      ok: true, basis, price, niy, allIn, purchaseCosts: allIn - price, noi1, yieldOnCost: noi1 / allIn,
      debt, equity, interest: firstInterest, debtService: firstService, months, holdYears: months / 12,
      loanType: amortising ? 'amort' : 'io', termMonths: amortising ? termMonths : null, payment, loanAtExit, loanRepaid: debt - loanAtExit,
      entryLabel: monthLabel(entry), exitLabel: monthLabel(exit - 1), saleLabel: monthLabel(exit),
      exitNoi, exitValue, netSale, saleCosts: exitValue - netSale,
      rows, years, unleveredIrr: yearly(irr(unlevered)), leveredIrr: yearly(irr(levered)),
      multiple: equity > 0 ? back / equity : null, profit: back - equity,
      cashOnCash: equity > 0 ? (firstNoi - firstService) / equity : null,
      interestCover: firstInterest > 0 ? firstNoi / firstInterest : null,
      // Cover of everything paid to the lender in year one. Equal to interest cover on an interest only loan.
      debtCover: firstService > 0 ? firstNoi / firstService : null,
      ltv, exitLtv: exitValue > 0 ? loanAtExit / exitValue : null,
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
      row(result.loanType === 'amort' ? 'Debt service cover' : 'Interest cover', result.debtCover, limits.dscr, result.debt > 0 ? atLeast(result.debtCover, limits.dscr) : true, 'times'),
      row('Break even exit yield', result.breakEvenYield, limits.breakEven, atLeast(result.breakEvenYield, limits.breakEven), 'pct')
    ];
  }

  root.QuickModel = Object.freeze({compute, screen, irr, num, monthIndex, monthLabel, monthText, MONTHS});
})(typeof globalThis !== 'undefined' ? globalThis : this);
