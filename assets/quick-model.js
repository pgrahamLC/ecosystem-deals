/* Quick model: entry price or NIY, year one rent, opex, rent growth, debt and exit. Monthly.
   Lease terms, areas, capex and a second loan are optional. Left blank, they change nothing. */
(function (root) {
  'use strict';

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function num(value) {
    if (value === '' || value == null) return NaN;
    const n = Number(String(value).replace(/[£,%\s]/g, ''));
    return Number.isFinite(n) ? n : NaN;
  }
  // Blank stays blank. A typed number, including 0, is kept.
  function opt(value) {
    const n = num(value);
    return Number.isFinite(n) ? n : null;
  }
  function whole(value) {
    const n = opt(value);
    return n == null ? null : Math.round(n);
  }
  function pctOf(value) {
    const n = opt(value);
    return n == null ? null : n / 100;
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
  // Spread a total across month indexes from..to. The last month takes the remainder.
  function spread(total, from, to) {
    const out = [];
    const n = to - from + 1;
    if (!(n > 0) || !(total > 0)) return out;
    let used = 0;
    for (let m = from; m <= to; m += 1) {
      const part = m === to ? total - used : total / n;
      out[m] = part;
      used += part;
    }
    return out;
  }
  function stepped(base, month, everyMonths, uplift) {
    const steps = everyMonths > 0 ? Math.floor((month - 1) / everyMonths) : 0;
    return base * Math.pow(1 + uplift, steps);
  }

  // Every rate comes in as a percentage, for example 6.5 for 6.5%. Rent and rates are yearly figures.
  // Month 1 is the entry month. Anything left blank is off, and the cash flow matches the original model.
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
    const useAmount = (opt(input.acqAmount) || 0) > 0;
    const rolledAcq = input.acqInterest === 'rolled';
    const refiAsked = whole(input.acqRefiMonth) != null;
    const amortising = input.loanType === 'amort' && !rolledAcq && !refiAsked && (useAmount || ltv > 0);
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
    if (!useAmount && !(ltv >= 0 && ltv < 1)) missing.push('loan share');
    if (amortising && !(termMonths >= 1 && termMonths <= 600)) missing.push('loan term, in years');
    const warnings = [];
    const reviewType = input.reviewType === 'fixed' || input.reviewType === 'index' ? input.reviewType : 'off';
    const reviewYears = opt(input.reviewEvery);
    const reviewMonths = reviewType !== 'off' && reviewYears > 0 ? Math.round(reviewYears * 12) : 0;
    const reviewCap = opt(input.reviewCapPct);
    const reviewCollar = opt(input.reviewCollarPct);
    if (reviewType !== 'off' && !(reviewYears > 0)) warnings.push('Enter how many years between rent reviews, or the annual growth still applies.');
    if (reviewCap != null && reviewCollar != null && reviewCap < reviewCollar) missing.push('rent review cap below the collar');
    const rentFree = Math.max(0, whole(input.rentFreeMonths) || 0);
    if (opt(input.rentFreeMonths) != null && opt(input.rentFreeMonths) < 0) missing.push('rent-free months');
    const headOn = input.headlease === 'on';
    const headRent = Math.max(0, opt(input.headleaseRent) || 0);
    const headEvery = opt(input.headleaseEvery) > 0 ? Math.round(opt(input.headleaseEvery) * 12) : 0;
    const headUplift = (opt(input.headleaseUpliftPct) || 0) / 100;
    const headTermYears = opt(input.headleaseTerm);
    const headTerm = headOn && headTermYears != null ? Math.round(headTermYears * 12) : null;
    if (headOn && headTermYears != null && !(headTerm > 0)) missing.push('headlease term');
    if (headUplift <= -1) missing.push('headlease uplift');
    const groundBasis = input.groundBasis === 'pa' || input.groundBasis === 'pct' ? input.groundBasis : 'off';
    const groundPa = Math.max(0, opt(input.groundRent) || 0);
    const groundPct = (opt(input.groundPct) || 0) / 100;
    const groundEvery = opt(input.groundEvery) > 0 ? Math.round(opt(input.groundEvery) * 12) : 0;
    const groundUplift = (opt(input.groundUpliftPct) || 0) / 100;
    if (groundUplift <= -1) missing.push('ground rent uplift');
    if (groundBasis === 'pct' && (opt(input.groundPct) || 0) > 100) missing.push('ground rent share of rent');
    const scBasis = input.scBasis === 'psf' || input.scBasis === 'total' ? input.scBasis : 'off';
    const scRecover = opt(input.scRecoverPct);
    const scRecoverFrac = scRecover == null ? 0 : scRecover / 100;
    if (scBasis !== 'off' && scRecover != null && (scRecover < 0 || scRecover > 100)) missing.push('service charge recoverable share');
    const nia = Math.max(0, opt(input.nia) || 0);
    const gia = Math.max(0, opt(input.gia) || 0);
    const renoPsf = Math.max(0, opt(input.renoPsf) || 0);
    const renoArea = input.renoArea === 'nia' ? 'nia' : 'gia';
    const moneyNames = [['headleaseRent', 'headlease rent'], ['groundRent', 'ground rent'], ['scPsf', 'service charge'], ['scTotal', 'service charge'], ['capexAmount', 'capex'], ['capexPct', 'capex'], ['renoPsf', 'renovation cost'], ['acqAmount', 'purchase loan'], ['acqFeePct', 'arrangement fee'], ['acqExitFeePct', 'exit fee'], ['devAmount', 'construction loan'], ['devLtcPct', 'loan to cost'], ['devFeePct', 'construction arrangement fee'], ['devExitFeePct', 'construction exit fee'], ['acqRefiAmount', 'refinance loan'], ['nia', 'net internal area'], ['gia', 'gross internal area']];
    moneyNames.forEach(([key, label]) => { if (opt(input[key]) != null && opt(input[key]) < 0) missing.push(label); });
    if (missing.length) return {ok: false, missing};

    // Rent path. A review, once a frequency is set, replaces the annual growth. Cap and collar are optional.
    let reviewUplift = 0;
    if (reviewMonths >= 1) {
      if (reviewType === 'fixed') {
        reviewUplift = (opt(input.reviewUpliftPct) || 0) / 100;
        if (reviewCap != null) reviewUplift = Math.min(reviewUplift, reviewCap / 100);
        if (reviewCollar != null) reviewUplift = Math.max(reviewUplift, reviewCollar / 100);
      } else {
        let annual = (opt(input.reviewUpliftPct) || 0) / 100;
        if (reviewCap != null) annual = Math.min(annual, reviewCap / 100);
        if (reviewCollar != null) annual = Math.max(annual, reviewCollar / 100);
        reviewUplift = Math.pow(1 + annual, reviewMonths / 12) - 1;
      }
      if (reviewUplift <= -1) missing.push('rent review uplift');
      if (opt(input.reviewUpliftPct) == null) warnings.push(reviewType === 'index' ? 'Enter the assumed RPI or CPI, or the review leaves the rent unchanged.' : 'Enter the uplift, or the review leaves the rent unchanged.');
    }
    if (missing.length) return {ok: false, missing};
    const reviewApplied = reviewMonths >= 1;
    function passingRent(month) {
      if (rentFree > 0 && month <= rentFree) return 0;
      const annual = reviewApplied ? rent1 * Math.pow(1 + reviewUplift, Math.floor((month - 1) / reviewMonths)) : rent1 * Math.pow(1 + growth, Math.floor((month - 1) / 12));
      return annual / 12;
    }
    function incomeAt(month) {
      const rent = passingRent(month);
      const op = rent * opex;
      const head = headOn && headRent > 0 && !(headTerm != null && month > headTerm) ? stepped(headRent, month, headEvery, headUplift) / 12 : 0;
      let ground = 0;
      if (groundBasis === 'pa' && groundPa > 0) ground = stepped(groundPa, month, groundEvery, groundUplift) / 12;
      if (groundBasis === 'pct' && groundPct > 0) ground = Math.min(1, groundPct * Math.pow(1 + groundUplift, groundEvery > 0 ? Math.floor((month - 1) / groundEvery) : 0)) * rent;
      const scAnnual = scBasis === 'psf' ? (opt(input.scPsf) || 0) * nia : scBasis === 'total' ? (opt(input.scTotal) || 0) : 0;
      const service = scBasis === 'off' ? 0 : Math.max(0, scAnnual) / 12 * (1 - Math.min(1, Math.max(0, scRecoverFrac)));
      return {rent, opex: op, headlease: head, ground, service, noi: rent - op - head - ground - service};
    }
    const plainIncome = !reviewApplied && !(rentFree > 0) && !(headOn && headRent > 0) && groundBasis === 'off' && scBasis === 'off';
    let exitNoi = 0;
    for (let month = months + 1; month <= months + 12; month += 1) exitNoi += incomeAt(month).noi;
    const yCount = Math.min(12, months);
    let ySum = 0;
    for (let month = 1; month <= yCount; month += 1) ySum += incomeAt(month).noi;
    const noi1 = plainIncome ? rent1 * (1 - opex) : ySum / (yCount / 12);
    if (basis === 'niy' && !(noi1 > 0)) return {ok: false, missing: ['year one income is not positive, so a yield cannot price the deal']};
    if (!(exitNoi > 0)) return {ok: false, missing: ['exit income is not positive']};

    const price = basis === 'niy' ? noi1 / ((num(input.niyPct) / 100) * (1 + costs)) : num(input.price);
    const purchaseCosts = price * costs;
    const capexBasis = input.capexBasis === 'pct' ? 'pct' : 'amount';
    const capexLump = capexBasis === 'pct' ? price * Math.max(0, opt(input.capexPct) || 0) / 100 : Math.max(0, opt(input.capexAmount) || 0);
    const renoBase = renoArea === 'nia' ? nia : gia;
    if (renoPsf > 0 && !(renoBase > 0)) warnings.push(renoArea === 'nia' ? 'Renovation cost per sq ft needs a net internal area, so it was not added.' : 'Renovation cost per sq ft needs a gross internal area, so it was not added.');
    if (scBasis === 'psf' && (opt(input.scPsf) || 0) > 0 && !(nia > 0)) warnings.push('Service charge per sq ft needs a net internal area, so nothing was deducted.');
    const totalCapex = capexLump + (renoBase > 0 ? renoPsf * renoBase : 0);
    const capFrom = whole(input.capexFrom);
    const capTo = whole(input.capexTo);
    let capexAt = [];
    if (totalCapex > 0 && capFrom != null && capTo != null && !(capFrom === 0 && capTo === 0)) {
      if (capFrom < 1 || capTo > months || capTo < capFrom) return {ok: false, missing: ['capex spend months']};
      capexAt = spread(totalCapex, capFrom, capTo);
    } else if (totalCapex > 0) capexAt[0] = totalCapex;
    const allIn = price + purchaseCosts + totalCapex;

    const acqDrawRaw = whole(input.acqDraw);
    const acqDrawMonth = acqDrawRaw == null ? 0 : acqDrawRaw;
    const acqPrincipal = useAmount ? opt(input.acqAmount) : price * ltv;
    if (useAmount && !(acqPrincipal < price)) return {ok: false, missing: ['purchase loan below the price']};
    if (acqDrawMonth < 0 || acqDrawMonth > months) return {ok: false, missing: ['purchase loan drawdown month']};
    const acqRepayRaw = whole(input.acqRepay);
    if (acqRepayRaw != null && (acqRepayRaw < 1 || acqRepayRaw > months || acqRepayRaw <= acqDrawMonth)) return {ok: false, missing: ['purchase loan repayment month']};
    const acqFeePct = Math.max(0, opt(input.acqFeePct) || 0) / 100;
    const acqExitPct = Math.max(0, opt(input.acqExitFeePct) || 0) / 100;
    const acqFee = acqPrincipal * acqFeePct;
    const refiMonth = whole(input.acqRefiMonth);
    let refiPrincipal = 0;
    let refiRate = rate;
    let refiFee = 0;
    if (refiMonth != null) {
      if (refiMonth < 1 || refiMonth >= months || refiMonth <= acqDrawMonth) return {ok: false, missing: ['refinance month']};
      if (acqRepayRaw != null && refiMonth >= acqRepayRaw) return {ok: false, missing: ['refinance month before repayment']};
      refiPrincipal = (opt(input.acqRefiAmount) || 0) > 0 ? opt(input.acqRefiAmount) : price * Math.max(0, opt(input.acqRefiLtvPct) || 0) / 100;
      if (!(refiPrincipal > 0)) return {ok: false, missing: ['refinance loan']};
      refiRate = (Number.isFinite(num(input.acqRefiRatePct)) ? num(input.acqRefiRatePct) : 0) / 100;
      refiFee = refiPrincipal * Math.max(0, opt(input.acqRefiFeePct) || 0) / 100;
    }
    const devBasis = input.devBasis === 'amount' || input.devBasis === 'ltc' ? input.devBasis : 'off';
    const devRolled = input.devInterest !== 'serviced';
    let devPrincipal = 0;
    if (devBasis === 'amount') devPrincipal = Math.max(0, opt(input.devAmount) || 0);
    if (devBasis === 'ltc') {
      if (!(totalCapex > 0) && (opt(input.devLtcPct) || 0) > 0) warnings.push('Loan to cost needs capex, so the construction loan was left at zero.');
      const ltcPct = opt(input.devLtcPct) || 0;
      if (ltcPct < 0 || ltcPct > 100) return {ok: false, missing: ['loan to cost']};
      devPrincipal = totalCapex * ltcPct / 100;
    }
    const devRate = (Number.isFinite(num(input.devRatePct)) ? num(input.devRatePct) : 0) / 100;
    const devFeePct = Math.max(0, opt(input.devFeePct) || 0) / 100;
    const devExitPct = Math.max(0, opt(input.devExitFeePct) || 0) / 100;
    const devFee = devPrincipal * devFeePct;
    let devFrom = whole(input.devDrawFrom);
    let devTo = whole(input.devDrawTo);
    const devRepayRaw = whole(input.devRepay);
    if (devPrincipal > 0) {
      if ((devFrom == null) !== (devTo == null)) return {ok: false, missing: ['construction loan drawdown months']};
      if (devFrom == null) {
        if (capexAt[0] > 0 && !capexAt.slice(1).some((part) => part > 0)) { devFrom = 0; devTo = 0; }
        else {
          const first = capexAt.findIndex((part, index) => index > 0 && part > 0);
          const last = capexAt.reduce((found, part, index) => (index > 0 && part > 0 ? index : found), 0);
          devFrom = first > 0 ? first : 1;
          devTo = last > 0 ? last : devFrom;
        }
      }
      if (devFrom < 0 || devTo > months || devTo < devFrom) return {ok: false, missing: ['construction loan drawdown months']};
      if (devRepayRaw != null && (devRepayRaw < 1 || devRepayRaw > months || devRepayRaw < devTo)) return {ok: false, missing: ['construction loan repayment month']};
    }
    // Draws follow the capex in the window. With no capex in the window, they are equal.
    const devDraw = [];
    if (devPrincipal > 0) {
      let weight = 0;
      const weights = [];
      for (let m = devFrom; m <= devTo; m += 1) { weights[m] = capexAt[m] || 0; weight += weights[m]; }
      if (!(weight > 0)) {
        for (let m = devFrom; m <= devTo; m += 1) weights[m] = 1;
        weight = devTo - devFrom + 1;
      }
      let used = 0;
      for (let m = devFrom; m <= devTo; m += 1) {
        const part = m === devTo ? devPrincipal - used : devPrincipal * weights[m] / weight;
        devDraw[m] = part;
        used += part;
      }
    }

    const doAmort = amortising && acqPrincipal > 0 && acqDrawMonth === 0 && refiMonth == null;
    if (input.loanType === 'amort' && acqPrincipal > 0 && !doAmort) warnings.push('The repayment schedule applies to a purchase loan drawn at purchase, with interest serviced and no refinance. This one is interest only.');
    const monthlyRate = rate / 12;
    const payment = !doAmort ? 0 : (monthlyRate > 0 ? acqPrincipal * monthlyRate / (1 - Math.pow(1 + monthlyRate, -termMonths)) : acqPrincipal / termMonths);
    const exitValue = exitNoi / exitYield;
    const netSale = exitValue * (1 - saleCosts);

    const rows = [];
    const unlevered = [-(price + purchaseCosts + (capexAt[0] || 0))];
    const levered = [unlevered[0] + (acqDrawMonth === 0 ? acqPrincipal : 0) + (devDraw[0] || 0) - (acqDrawMonth === 0 ? acqFee : 0) - (devFrom === 0 ? devFee : 0)];
    let acqBal = acqDrawMonth === 0 ? acqPrincipal : 0;
    let devBal = devDraw[0] || 0;
    let acqRateM = monthlyRate;
    let acqExitBase = acqPrincipal;
    let paymentsLeft = doAmort ? termMonths : 0;
    let acqClosed = false;
    let devClosed = false;
    let acqInterest = 0;
    let devInterest = 0;
    let acqFees = (acqDrawMonth === 0 ? acqFee : 0);
    let devFees = devFrom === 0 ? devFee : 0;
    let loanAtExit = 0;
    let saleFeePaid = 0;
    for (let month = 1; month <= months; month += 1) {
      const inc = incomeAt(month);
      const last = month === months;
      let draw = 0;
      let fee = 0;
      let bullet = 0;
      if (refiMonth === month && !acqClosed) {
        const exitFee = acqBal > 0 ? acqExitPct * acqExitBase : 0;
        bullet += acqBal;
        fee += exitFee;
        acqFees += exitFee;
        acqBal = refiPrincipal;
        draw += refiPrincipal;
        fee += refiFee;
        acqFees += refiFee;
        acqExitBase = refiPrincipal;
        acqRateM = refiRate / 12;
        paymentsLeft = 0;
      }
      if (month === acqDrawMonth && acqDrawMonth > 0) { acqBal += acqPrincipal; draw += acqPrincipal; fee += acqFee; acqFees += acqFee; }
      if (!devClosed && devDraw[month]) { devBal += devDraw[month]; draw += devDraw[month]; if (month === devFrom && devFrom > 0) { fee += devFee; devFees += devFee; } }
      const acqInt = acqClosed ? 0 : acqBal * acqRateM;
      const devInt = devClosed ? 0 : devBal * (devRate / 12);
      acqInterest += acqInt;
      devInterest += devInt;
      if (rolledAcq && !acqClosed) acqBal += acqInt;
      if (devRolled && !devClosed && devPrincipal > 0) devBal += devInt;
      let amortPrin = 0;
      if (paymentsLeft > 0 && acqBal > 0) {
        amortPrin = Math.max(0, Math.min(acqBal, payment - acqInt));
        acqBal -= amortPrin;
        paymentsLeft -= 1;
      }
      if (acqBal < 1e-6) acqBal = 0;
      if (devBal < 1e-6) devBal = 0;
      const repayAcq = acqRepayRaw != null && acqRepayRaw < months && month === acqRepayRaw;
      const repayDev = devRepayRaw != null && devRepayRaw < months && month === devRepayRaw;
      if (repayAcq && acqBal > 0) { const exitFee = acqExitPct * acqExitBase; bullet += acqBal; fee += exitFee; acqFees += exitFee; acqBal = 0; acqClosed = true; }
      if (repayDev && devBal > 0) { const exitFee = devExitPct * devPrincipal; bullet += devBal; fee += exitFee; devFees += exitFee; devBal = 0; devClosed = true; }
      let saleFee = 0;
      let sale = 0;
      if (last) {
        if (acqBal > 0) { const exitFee = acqExitPct * acqExitBase; saleFee += exitFee; acqFees += exitFee; }
        if (devBal > 0) { const exitFee = devExitPct * devPrincipal; saleFee += exitFee; devFees += exitFee; }
        loanAtExit = acqBal + devBal;
        sale = netSale - loanAtExit - saleFee;
        saleFeePaid = saleFee;
      }
      const interestPaid = (rolledAcq ? 0 : acqInt) + (devPrincipal > 0 && devRolled ? 0 : devInt);
      const principal = amortPrin + bullet;
      const capex = capexAt[month] || 0;
      // Cover uses the recurring payment. A bullet repayment is in the cash flow, not in the cover ratio.
      const debtService = interestPaid + amortPrin;
      const cash = inc.noi + draw - interestPaid - principal - fee;
      rows.push({
        month, label: monthLabel(entry + month - 1), rent: inc.rent, opex: inc.opex, headlease: inc.headlease, ground: inc.ground, service: inc.service,
        noi: inc.noi, capex, interest: acqInt + devInt, acqInterest: acqInt, devInterest: devInt, interestPaid, principal, debtService, draw, fee, balance: acqBal, devBalance: devBal, cash, sale
      });
      unlevered.push(inc.noi - capex + (last ? netSale : 0));
      levered.push(cash - capex + (last ? sale : 0));
    }

    const loanAtExitAcq = rows.length ? rows[rows.length - 1].balance : 0;
    const years = [];
    rows.forEach((row) => {
      const index = Math.floor((row.month - 1) / 12);
      if (!years[index]) years[index] = {year: index + 1, from: row.label, to: row.label, months: 0, rent: 0, opex: 0, headlease: 0, ground: 0, service: 0, noi: 0, capex: 0, interest: 0, acqInterest: 0, devInterest: 0, principal: 0, fee: 0, draw: 0, cash: 0, sale: 0, balance: 0, devBalance: 0};
      const year = years[index];
      year.to = row.label;
      year.months += 1;
      year.balance = row.balance;
      year.devBalance = row.devBalance;
      ['rent', 'opex', 'headlease', 'ground', 'service', 'noi', 'capex', 'interest', 'acqInterest', 'devInterest', 'principal', 'fee', 'draw', 'cash', 'sale'].forEach((key) => { year[key] += row[key]; });
    });
    const laterEquity = levered.slice(1).some((flow) => flow < -0.01);
    const back = levered.slice(1).reduce((sum, flow) => sum + flow, 0);
    const equity = levered[0] < 0 ? -levered[0] : 0;
    const invested = laterEquity ? levered.reduce((sum, flow) => sum + (flow < -0.01 ? -flow : 0), 0) : equity;
    const returned = laterEquity ? levered.reduce((sum, flow) => sum + (flow > 0.01 ? flow : 0), 0) : back;
    const firstYear = rows.slice(0, 12);
    const span = firstYear.length / 12;
    const firstNoi = firstYear.reduce((sum, row) => sum + row.noi, 0) / span;
    const firstInterest = firstYear.reduce((sum, row) => sum + row.interest, 0) / span;
    const firstService = firstYear.reduce((sum, row) => sum + row.debtService, 0) / span;
    const covered = levered[0] + rows.reduce((sum, row) => sum + row.cash - row.capex, 0);
    const neededSale = saleCosts < 1 ? (-covered + loanAtExit + saleFeePaid) / (1 - saleCosts) : null;
    const flags = {
      review: reviewApplied && (Math.abs(reviewUplift) > 1e-12 || Math.abs(growth) > 1e-12),
      rentFree: rentFree > 0,
      headlease: headOn && headRent > 0,
      ground: groundBasis !== 'off' && (groundBasis === 'pa' ? groundPa > 0 : groundPct > 0),
      service: scBasis !== 'off' && rows.some((row) => row.service > 0.005),
      areas: nia > 0 || gia > 0,
      capex: totalCapex > 0.5,
      dev: devPrincipal > 0.5,
      rolled: (rolledAcq && acqPrincipal > 0) || (devPrincipal > 0 && devRolled),
      fees: acqFees + devFees > 0.5,
      refi: refiMonth != null && refiPrincipal > 0,
      timing: acqDrawMonth > 0 || (acqRepayRaw != null && acqRepayRaw < months)
    };
    flags.any = flags.review || flags.rentFree || flags.headlease || flags.ground || flags.service || flags.capex || flags.dev || flags.rolled || flags.fees || flags.refi || flags.timing;
    return {
      ok: true, basis, price, niy: noi1 / (price + purchaseCosts), allIn, purchaseCosts, totalCapex, capexLump, noi1, yieldOnCost: noi1 / allIn,
      debt: acqPrincipal, devDebt: devPrincipal, equity, equityTotal: invested, interest: firstInterest, debtService: firstService, months, holdYears: months / 12,
      loanType: doAmort ? 'amort' : 'io', termMonths: doAmort ? termMonths : null, payment, loanAtExit, loanAtExitAcq, loanRepaid: acqPrincipal - loanAtExitAcq,
      entryLabel: monthLabel(entry), exitLabel: monthLabel(exit - 1), saleLabel: monthLabel(exit),
      exitNoi, exitValue, netSale, saleCosts: exitValue - netSale,
      rows, years, unleveredIrr: yearly(irr(unlevered)), leveredIrr: yearly(irr(levered)),
      multiple: invested > 0 ? returned / invested : null, profit: returned - invested,
      profitOnCost: allIn > 0 ? unlevered.reduce((sum, flow) => sum + flow, 0) / allIn : null,
      cashOnCash: equity > 0 ? (firstNoi - firstService) / equity : null,
      interestCover: firstInterest > 0 ? firstNoi / firstInterest : null,
      debtCover: firstService > 0 ? firstNoi / firstService : null,
      ltv: price > 0 ? acqPrincipal / price : null,
      ltc: totalCapex > 0 && devPrincipal > 0 ? devPrincipal / totalCapex : null,
      exitLtv: exitValue > 0 ? loanAtExit / exitValue : null,
      breakEvenYield: neededSale > 0 ? exitNoi / neededSale : null,
      finance: {
        acqInterest, devInterest, acqFees, devFees,
        total: acqInterest + devInterest + acqFees + devFees
      },
      areas: (nia > 0 || gia > 0) ? {
        nia, gia, efficiency: nia > 0 && gia > 0 ? nia / gia : null,
        rentPsf: nia > 0 ? rent1 / nia : null, pricePsf: nia > 0 ? price / nia : null,
        giaPricePsf: gia > 0 ? price / gia : null, noiPsf: nia > 0 ? noi1 / nia : null,
        capexPsf: nia > 0 ? totalCapex / nia : null, allInPsf: nia > 0 ? allIn / nia : null
      } : null,
      flags, warnings,
      flows: {unlevered, levered}
    };
  }

  // A quick read against the numeric hurdles. The full 14 hurdle test stays on the Deal sheet.
  function screen(result, limits) {
    if (!result || !result.ok || !limits) return [];
    const row = (name, value, limit, pass, kind) => ({name, value, limit, kind, pass: value == null ? null : pass});
    const atLeast = (value, limit) => value != null && value >= limit - 1e-9;
    const geared = (result.debt || 0) + (result.devDebt || 0) > 0;
    return [
      row('Unlevered IRR', result.unleveredIrr, limits.unleveredIrr, atLeast(result.unleveredIrr, limits.unleveredIrr), 'pct'),
      row('Yield on cost', result.yieldOnCost, limits.yoc, atLeast(result.yieldOnCost, limits.yoc), 'pct'),
      row('Levered IRR', result.leveredIrr, limits.leveredIrr, atLeast(result.leveredIrr, limits.leveredIrr), 'pct'),
      row('Equity multiple', result.multiple, limits.multiple, atLeast(result.multiple, limits.multiple), 'times'),
      row('Year one cash on cash', result.cashOnCash, limits.cashOnCash, atLeast(result.cashOnCash, limits.cashOnCash), 'pct'),
      row('Loan share of price', result.ltv, limits.ltvMax, result.ltv <= limits.ltvMax + 1e-9, 'max'),
      row(result.loanType === 'amort' ? 'Debt service cover' : 'Interest cover', result.debtCover, limits.dscr, geared ? atLeast(result.debtCover, limits.dscr) : true, 'times'),
      row('Break even exit yield', result.breakEvenYield, limits.breakEven, atLeast(result.breakEvenYield, limits.breakEven), 'pct')
    ];
  }

  root.QuickModel = Object.freeze({compute, screen, irr, num, monthIndex, monthLabel, monthText, MONTHS});
})(typeof globalThis !== 'undefined' ? globalThis : this);
