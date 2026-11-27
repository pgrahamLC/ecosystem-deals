/* UK lease and area terms for the deal underwriting model.
   Every default is off or zero. With those defaults the rent path, NOI,
   capex and returns match the previous model. */
(function (root) {
  'use strict';

  const DEFAULTS = {
    reviewType: 'off',
    reviewYears: 0,
    reviewUpliftPct: 0,
    reviewIndexPct: 0,
    reviewCapPct: null,
    reviewCollarPct: null,
    rentFreeMonths: 0,
    headlease: 'no',
    headleaseRentPa: 0,
    headleaseReviewYears: 0,
    headleaseUpliftPct: 0,
    headleaseTermYears: 0,
    groundMode: 'off',
    groundRentPa: 0,
    groundRentPct: 0,
    groundReviewYears: 0,
    groundReviewType: 'fixed',
    groundUpliftPct: 0,
    groundIndexPct: 0,
    groundCapPct: null,
    groundCollarPct: null,
    scMode: 'off',
    scPsf: 0,
    scTotalPa: 0,
    scRecoverablePct: 0,
    niaSqft: 0,
    giaSqft: 0,
    capexMode: 'gbp',
    capexPct: 0,
    renoPsf: 0,
    renoArea: 'gia'
  };

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function optionalPct(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function whole(value) {
    const n = num(value);
    return Number.isInteger(n) ? n : NaN;
  }

  // Year index 0 is the first twelve months after completion: no review has fallen yet.
  // A review every N years first applies at year index N (the start of the next year).
  function reviewsElapsed(yearIndex, frequency) {
    const n = Math.floor(num(frequency));
    if (!(n >= 1)) return 0;
    return Math.floor(Math.max(0, Math.floor(num(yearIndex))) / n);
  }

  // One review. Fixed is a single percentage on the rent then passing.
  // Index compounds an annual rate over the frequency. Cap and collar are annual
  // rates; blank means that limit is not set. If both are set and the cap is
  // below the collar, the cap wins and validate() reports the range.
  function periodFactor(kind, frequency, upliftPct, indexPct, capPct, collarPct) {
    const years = Math.max(1, Math.floor(num(frequency)));
    if (kind === 'fixed') return 1 + num(upliftPct) / 100;
    let annual = num(indexPct) / 100;
    const collar = optionalPct(collarPct);
    const cap = optionalPct(capPct);
    if (collar != null) annual = Math.max(annual, collar / 100);
    if (cap != null) annual = Math.min(annual, cap / 100);
    return Math.pow(1 + annual, years);
  }

  function rentMultiplier(state, yearIndex) {
    const s = state || {};
    if (s.reviewType !== 'fixed' && s.reviewType !== 'index') return 1;
    const freq = Math.floor(num(s.reviewYears));
    if (!(freq >= 1)) return 1;
    const steps = reviewsElapsed(yearIndex, freq);
    if (!steps) return 1;
    const factor = periodFactor(s.reviewType, freq, s.reviewUpliftPct, s.reviewIndexPct, s.reviewCapPct, s.reviewCollarPct);
    return Math.pow(factor, steps);
  }

  function affectsRent(state) {
    const s = state || {};
    return s.reviewType === 'fixed' || s.reviewType === 'index' || num(s.rentFreeMonths) > 0 || s.headlease === 'yes';
  }

  function affectsCosts(state) {
    const s = state || {};
    return s.headlease === 'yes' || s.groundMode === 'gbp' || s.groundMode === 'pct' || s.scMode === 'psf' || s.scMode === 'total';
  }

  function affectsCapex(state) {
    const s = state || {};
    return s.capexMode === 'pct' || num(s.renoPsf) > 0;
  }

  // Monthly occupational rent. grownMonth is the existing model rent for that
  // month (annual growth, or an uploaded tenancy schedule). A review that is
  // switched on replaces annual growth. It is not added on top of an uploaded schedule.
  function occupationalMonth(state, ctx) {
    const s = state || {};
    const grown = num(ctx && ctx.grownMonth);
    const headline = num(ctx && ctx.headlineAnnual);
    const yearIndex = num(ctx && ctx.yearIndex);
    const operating = num(ctx && ctx.month) - num(ctx && ctx.completion);
    const reviewOn = (s.reviewType === 'fixed' || s.reviewType === 'index') && Math.floor(num(s.reviewYears)) >= 1;
    let rent = reviewOn && !(ctx && ctx.leaseDriven) ? headline / 12 * rentMultiplier(s, yearIndex) : grown;
    const free = Math.max(0, Math.floor(num(s.rentFreeMonths)));
    if (free && operating >= 1 && operating <= free) rent = 0;
    if (s.headlease === 'yes') {
      const termMonths = Math.round(num(s.headleaseTermYears) * 12);
      if (termMonths > 0 && operating > termMonths) rent = 0;
    }
    return rent;
  }

  function headleaseMonth(state, operatingMonth) {
    const s = state || {};
    if (s.headlease !== 'yes') return 0;
    const termMonths = Math.round(num(s.headleaseTermYears) * 12);
    if (termMonths > 0 && operatingMonth > termMonths) return 0;
    const base = num(s.headleaseRentPa) / 12;
    const freq = Math.floor(num(s.headleaseReviewYears));
    if (!(freq >= 1)) return base;
    const steps = reviewsElapsed(Math.floor((Math.max(1, operatingMonth) - 1) / 12), freq);
    if (!steps) return base;
    return base * Math.pow(1 + num(s.headleaseUpliftPct) / 100, steps);
  }

  function groundMonth(state, operatingMonth, occupationalRent) {
    const s = state || {};
    if (s.groundMode === 'pct') return Math.max(0, num(occupationalRent)) * num(s.groundRentPct) / 100;
    if (s.groundMode !== 'gbp') return 0;
    const base = num(s.groundRentPa) / 12;
    const freq = Math.floor(num(s.groundReviewYears));
    const kind = s.groundReviewType === 'index' ? 'index' : 'fixed';
    if (!(freq >= 1)) return base;
    const yearIndex = Math.floor((Math.max(1, operatingMonth) - 1) / 12);
    const steps = reviewsElapsed(yearIndex, freq);
    if (!steps) return base;
    const factor = periodFactor(kind, freq, s.groundUpliftPct, s.groundIndexPct, s.groundCapPct, s.groundCollarPct);
    return base * Math.pow(factor, steps);
  }

  function serviceAnnual(state) {
    const s = state || {};
    if (s.scMode === 'psf') return num(s.scPsf) * num(s.niaSqft);
    if (s.scMode === 'total') return num(s.scTotalPa);
    return 0;
  }

  function serviceShortfallMonth(state) {
    const recoverable = Math.min(100, Math.max(0, num((state || {}).scRecoverablePct)));
    return serviceAnnual(state) * (1 - recoverable / 100) / 12;
  }

  function deductions(state, ctx) {
    const operating = num(ctx && ctx.month) - num(ctx && ctx.completion);
    if (!(operating >= 1)) return {headlease: 0, ground: 0, service: 0, total: 0};
    const s = state || {};
    if (s.headlease === 'yes') {
      const termMonths = Math.round(num(s.headleaseTermYears) * 12);
      if (termMonths > 0 && operating > termMonths) return {headlease: 0, ground: 0, service: 0, total: 0};
    }
    const headlease = headleaseMonth(s, operating);
    const ground = groundMonth(s, operating, ctx && ctx.grossRent);
    const service = serviceShortfallMonth(s);
    return {headlease, ground, service, total: headlease + ground + service};
  }

  function expiredAtExit(state, exitMonth, completion) {
    const s = state || {};
    if (s.headlease !== 'yes') return false;
    const termMonths = Math.round(num(s.headleaseTermYears) * 12);
    if (!(termMonths > 0)) return false;
    return num(exitMonth) - num(completion) > termMonths;
  }

  function lumpCapex(state, price) {
    const s = state || {};
    if (s.capexMode === 'pct') return num(price) * num(s.capexPct) / 100;
    return num(s.capex);
  }

  function renoCapex(state) {
    const s = state || {};
    const area = s.renoArea === 'nia' ? num(s.niaSqft) : num(s.giaSqft);
    return num(s.renoPsf) * area;
  }

  function totalCapex(state, price, units) {
    return lumpCapex(state, price) + num(state && state.capexPerUnit) * num(units) + renoCapex(state);
  }

  function perSqft(amount, area) {
    return area > 0 && Number.isFinite(amount) ? amount / area : null;
  }

  function areas(state, figures) {
    const s = state || {};
    const f = figures || {};
    const nia = num(s.niaSqft);
    const gia = num(s.giaSqft);
    return {
      nia: nia,
      gia: gia,
      efficiency: nia > 0 && gia > 0 ? nia / gia : null,
      rentPsf: perSqft(f.headlineRent, nia),
      noiPsf: perSqft(f.noi, nia),
      pricePsfNia: perSqft(f.price, nia),
      pricePsfGia: perSqft(f.price, gia),
      capexPsf: perSqft(f.capex, gia > 0 ? gia : nia),
      allInPsf: perSqft(f.allIn, nia)
    };
  }

  function limitOrder(capPct, collarPct, label) {
    const cap = optionalPct(capPct);
    const collar = optionalPct(collarPct);
    if (cap != null && collar != null && cap < collar) return label + ' cap must be at least the collar.';
    if (cap != null && cap <= -100) return label + ' cap must be above -100%.';
    if (collar != null && collar <= -100) return label + ' collar must be above -100%.';
    return '';
  }

  function validate(state) {
    const s = state || {};
    const errors = [];
    const notes = [];
    const reviewOn = s.reviewType === 'fixed' || s.reviewType === 'index';
    if (reviewOn && !(whole(s.reviewYears) >= 1)) errors.push('Enter a rent review frequency of at least 1 year, or set the review to off.');
    if (s.reviewType === 'fixed' && num(s.reviewUpliftPct) <= -100) errors.push('Fixed rent review uplift must be above -100%.');
    if (s.reviewType === 'index' && num(s.reviewIndexPct) <= -100) errors.push('Assumed RPI/CPI must be above -100%.');
    const reviewLimit = limitOrder(s.reviewCapPct, s.reviewCollarPct, 'Rent review');
    if (reviewOn && reviewLimit) errors.push(reviewLimit);
    if (num(s.rentFreeMonths) < 0 || !Number.isInteger(num(s.rentFreeMonths))) errors.push('Rent-free period must be a whole number of months, or 0.');
    if (s.headlease === 'yes') {
      if (num(s.headleaseRentPa) < 0) errors.push('Headlease rent cannot be negative.');
      if (!(num(s.headleaseTermYears) > 0)) errors.push('Enter the unexpired headlease term in years.');
      if (num(s.headleaseReviewYears) < 0 || (num(s.headleaseReviewYears) > 0 && !Number.isInteger(num(s.headleaseReviewYears)))) errors.push('Headlease review frequency must be a whole number of years, or 0 for no review.');
      if (num(s.headleaseUpliftPct) <= -100) errors.push('Headlease review uplift must be above -100%.');
      notes.push('Headlease rent is deducted while the unexpired term remains. After it ends, occupational rent, headlease rent, ground rent and the service charge shortfall stop. An exit after expiry is valued at nil.');
    }
    if (s.groundMode === 'gbp' && num(s.groundRentPa) < 0) errors.push('Ground rent cannot be negative.');
    if (s.groundMode === 'pct' && (num(s.groundRentPct) < 0 || num(s.groundRentPct) > 100)) errors.push('Ground rent percentage of rent must be between 0 and 100.');
    if (s.groundMode === 'gbp' && num(s.groundReviewYears) > 0 && !Number.isInteger(num(s.groundReviewYears))) errors.push('Ground rent review frequency must be a whole number of years, or 0 for no review.');
    const groundLimit = limitOrder(s.groundCapPct, s.groundCollarPct, 'Ground rent');
    if (s.groundMode === 'gbp' && s.groundReviewType === 'index' && groundLimit) errors.push(groundLimit);
    if (s.scMode === 'psf') {
      if (num(s.scPsf) < 0) errors.push('Service charge £ per sq ft cannot be negative.');
      if (!(num(s.niaSqft) > 0)) errors.push('Enter net internal area (sq ft) to apply a service charge per sq ft.');
    }
    if (s.scMode === 'total' && num(s.scTotalPa) < 0) errors.push('Service charge cannot be negative.');
    if (num(s.scRecoverablePct) < 0 || num(s.scRecoverablePct) > 100) errors.push('Service charge recoverable share must be between 0 and 100%.');
    if (num(s.niaSqft) < 0 || num(s.giaSqft) < 0) errors.push('Areas cannot be negative.');
    if (s.capexMode === 'pct' && num(s.capexPct) < 0) errors.push('Capex percentage of the purchase price cannot be negative.');
    if (num(s.renoPsf) < 0) errors.push('Renovation cost per sq ft cannot be negative.');
    if (num(s.renoPsf) > 0) {
      const area = s.renoArea === 'nia' ? num(s.niaSqft) : num(s.giaSqft);
      if (!(area > 0)) errors.push(s.renoArea === 'nia' ? 'Enter net internal area (sq ft) to apply renovation cost per sq ft.' : 'Enter gross internal area (sq ft) to apply renovation cost per sq ft.');
    }
    if (s.leaseDriven && reviewOn) notes.push('An uploaded rent schedule is driving the rent, so the rent review above is not applied on top. Rent-free months entered here still apply.');
    return {errors: errors, notes: notes};
  }

  // Full underwriting. UW supplies tax, bid, date, xirr and the optional monthRent hook.
  // When none of the new switches are on, year-one rent, NOI, capex and the monthly
  // cash flows follow the previous formulas, including the same rounding.
  function compute(UW, raw, refs) {
    const s = Object.assign({}, DEFAULTS, {capexPerUnit: 0}, raw || {});
    const errors = [];
    const numericFields = {
      price: 'purchase price (enter 0 explicitly for a target-yield bid)',
      entryYield: 'entry yield',
      exitYield: 'exit yield',
      opexMargin: 'OPEX margin (% of rent)',
      ltv: 'debt LTV',
      interest: 'interest rate',
      depositPct: 'deposit percentage',
      retainedPct: 'retained SO stake',
      saleCostsPct: 'selling costs',
      capex: 'additional scheme-level works',
      capexPerUnit: 'capex per unit',
      exitCosts: 'exit costs',
      debtFee: 'debt arrangement fee',
      acqCostsPct: 'acquisition fees',
      exitPurchaserPct: 'exit purchaser adjustment',
      soRentPct: 'SO rent percentage',
      rentGrowth: 'rent growth',
      completionMonth: 'completion month',
      holdYears: 'operating hold'
    };
    for (const [k, label] of Object.entries(numericFields)) {
      if (s[k] === null || s[k] === undefined || String(s[k]).trim() === '' || !Number.isFinite(Number(s[k]))) errors.push('Enter a valid number for ' + label + '. Enter 0 explicitly if intended.');
    }
    for (const [i, row] of (s.rows || []).entries()) {
      for (const k of ['units', 'omv', 'annualRent']) {
        if (row[k] === null || row[k] === undefined || String(row[k]).trim() === '' || !Number.isFinite(Number(row[k]))) errors.push('Unit row ' + (i + 1) + ': ' + k + ' must be a finite number.');
      }
    }
    if (errors.length) return {errors: errors};
    const rows = (s.rows || []).filter(r => num(r.units) > 0);
    const units = rows.reduce((a, r) => a + num(r.units), 0);
    const rentedUnits = rows.filter(r => r.tenure !== 'SO').reduce((a, r) => a + num(r.units), 0);
    const soUnits = units - rentedUnits;
    const ref = (refs || []).find(r => r.name === s.brma);
    const rowRent = r => r.tenure === 'SO'
      ? num(r.units) * num(r.omv) * num(s.soRentPct) / 100 * num(s.retainedPct) / 100
      : s.income_mode === 'lha'
        ? num(r.units) * num(ref && ref[String(r.beds)]) * 12
        : num(r.units) * num(r.annualRent) * (s.income_mode === 'market80' ? 0.8 : 1);
    const annualRent = rows.reduce((a, r) => a + rowRent(r), 0);
    const omv = rows.reduce((a, r) => a + num(r.omv) * num(r.units), 0);
    const soOmv = rows.filter(r => r.tenure === 'SO').reduce((a, r) => a + num(r.omv) * num(r.units), 0);
    const plainMonth = (m, yr) => typeof UW.monthRent === 'function'
      ? UW.monthRent(s, m, annualRent, yr)
      : annualRent / 12 * (1 + num(s.rentGrowth) / 100) ** yr;
    const rentAdjusted = affectsRent(s);
    const costAdjusted = affectsCosts(s);
    const adjusted = rentAdjusted || costAdjusted;
    const monthGross = (m, yr) => {
      const grown = plainMonth(m, yr);
      if (!adjusted) return grown;
      return occupationalMonth(s, {month: m, completion: num(s.completionMonth), yearIndex: yr, headlineAnnual: annualRent, grownMonth: grown, leaseDriven: !!s.leaseDriven});
    };
    const yearCash = function (y) {
      let rent = 0, head = 0, ground = 0, service = 0;
      const cm = num(s.completionMonth);
      for (let i = 0; i < 12; i++) {
        const m = cm + 1 + y * 12 + i;
        const gross = monthGross(m, y);
        rent += gross;
        if (costAdjusted) {
          const d = deductions(s, {month: m, completion: cm, grossRent: gross});
          head += d.headlease;
          ground += d.ground;
          service += d.service;
        }
      }
      const opex = rent * num(s.opexMargin) / 100;
      return {rent: rent, opex: opex, headlease: head, ground: ground, service: service, deductions: head + ground + service, noi: rent - opex - head - ground - service};
    };
    const scheduledYear = function (y) {
      if (typeof UW.monthRent !== 'function') return annualRent * Math.pow(1 + num(s.rentGrowth) / 100, y);
      let t = 0;
      const cm = num(s.completionMonth);
      for (let i = 0; i < 12; i++) t += UW.monthRent(s, cm + 1 + y * 12 + i, annualRent, y);
      return t;
    };
    const y1 = adjusted ? yearCash(0) : null;
    const modelRent = adjusted ? y1.rent : scheduledYear(0);
    const annualOpex = adjusted ? y1.opex : modelRent * num(s.opexMargin) / 100;
    const yearDeductions = adjusted
      ? {headlease: y1.headlease, ground: y1.ground, service: y1.service, total: y1.deductions}
      : {headlease: 0, ground: 0, service: 0, total: 0};
    if (!units) errors.push('Enter at least one unit.');
    if (rows.some(r => !Number.isInteger(+r.units) || +r.units < 0)) errors.push('Unit counts must be whole positive numbers.');
    if ((s.rows || []).some(r => ['units', 'omv', 'annualRent'].some(k => num(r[k]) < 0))) errors.push('Units, values and rents cannot be negative.');
    if (num(s.opexMargin) < 0 || num(s.opexMargin) > 100) errors.push('OPEX margin must be between 0 and 100% of rent.');
    if (s.income_mode === 'lha' && (!ref || rows.some(r => r.tenure !== 'SO' && !Number.isFinite(+(ref && ref[String(r.beds)]))))) errors.push('Select a valid BRMA and bedroom category for LHA benchmarking.');
    if (rows.some(r => r.tenure === 'SO' && num(r.omv) <= 0)) errors.push('Shared-ownership rows need OMV per unit.');
    if (annualRent <= 0) errors.push('Enter positive annual rent per unit, or choose a valid LHA benchmark.');
    if (!/^\d{4}-\d{2}-01$/.test(s.startDate || '') || isNaN(Date.parse(s.startDate))) errors.push('Choose a valid start date on the first of a month.');
    if (!Number.isInteger(+s.completionMonth) || +s.completionMonth < 0 || +s.completionMonth > 60) errors.push('Completion must be a whole month from 0 to 60.');
    if (!(Number.isFinite(+s.holdYears) && +s.holdYears >= 1 / 12 && +s.holdYears <= 30)) errors.push('Operating hold must be between 1 month and 30 years.');
    for (const k of ['ltv', 'depositPct', 'retainedPct', 'saleCostsPct']) if (num(s[k]) < 0 || num(s[k]) > 100) errors.push(k + ' must be between 0 and 100%.');
    for (const k of ['price', 'capex', 'capexPerUnit', 'exitCosts', 'interest', 'debtFee', 'acqCostsPct', 'exitPurchaserPct', 'soRentPct']) if (num(s[k]) < 0) errors.push(k + ' cannot be negative.');
    if (num(s.rentGrowth) <= -100) errors.push('Rent growth must exceed -100%.');
    if (num(s.entryYield) <= 0 || num(s.exitYield) <= 0) errors.push('Entry and exit yields must be positive.');
    const cashNoi = adjusted ? y1.noi : modelRent - annualOpex;
    if (cashNoi <= 0) errors.push(adjusted ? 'Year-one cash NOI must be positive for yield-based valuation. Rent-free months, headlease rent, ground rent or an unrecovered service charge can reduce it.' : 'Year-one NOI must be positive for yield-based valuation.');
    const check = validate(s);
    check.errors.forEach(e => errors.push(e));
    if (errors.length) return {errors: errors};
    const noi = cashNoi;
    const bid = UW.bid(noi, num(s.entryYield) / 100, units, num(s.acqCostsPct) / 100, s.taxMode);
    const price = num(s.price) > 0 ? num(s.price) : bid;
    const sdlt = UW.tax(price, units, s.taxMode);
    const acqFees = price * num(s.acqCostsPct) / 100;
    const capexTotal = affectsCapex(s) ? totalCapex(s, price, units) : num(s.capex) + num(s.capexPerUnit) * units;
    const allIn = price + sdlt + acqFees + capexTotal;
    const debt = price * num(s.ltv) / 100;
    const debtFee = debt * num(s.debtFee) / 100;
    const annualInterest = debt * num(s.interest) / 100;
    const exitMonth = num(s.completionMonth) + num(s.holdYears) * 12;
    const soProceeds = soOmv * (1 - num(s.retainedPct) / 100);
    const exitPower = Math.floor((exitMonth - num(s.completionMonth) - 1) / 12);
    const exitExpired = expiredAtExit(s, exitMonth, num(s.completionMonth));
    let exitNoi = adjusted ? yearCash(exitPower).noi : scheduledYear(exitPower) * (1 - num(s.opexMargin) / 100);
    if (exitExpired) exitNoi = 0;
    else if (exitNoi <= 0) return {errors: [adjusted ? 'Exit NOI is not positive under these rent, review and cost assumptions.' : 'Exit NOI is not positive under these rent/OPEX growth assumptions.']};
    const exitValue = exitNoi > 0 ? exitNoi / (num(s.exitYield) / 100) / (1 + num(s.exitPurchaserPct) / 100) : 0;
    const exitNet = exitValue * (1 - num(s.saleCostsPct) / 100) - num(s.exitCosts);
    if (![annualRent, noi, bid, price, sdlt, acqFees, allIn, debt, debtFee, annualInterest, exitNoi, exitValue, exitNet, soProceeds].every(Number.isFinite)) return {errors: ['These assumptions overflow the calculation. Enter smaller finite values.']};
    const schedule = [];
    let cu = 0, cl = 0;
    for (let m = 0; m <= exitMonth; m++) {
      const x = {m: m, date: UW.date(s.startDate, m), deposit: 0, balance: 0, tax: 0, fees: 0, capex: 0, rent: 0, opex: 0, headlease: 0, ground: 0, service: 0, noi: 0, soSale: 0, exitSale: 0, saleCosts: 0, exitCosts: 0, unlev: 0, draw: 0, debtFee: 0, interest: 0, repay: 0, lev: 0, cumUnlev: 0, cumLev: 0};
      if (m === 0) x.deposit = -price * num(s.depositPct) / 100;
      if (m === num(s.completionMonth)) {
        x.balance = -price * (1 - num(s.depositPct) / 100);
        x.tax = -sdlt;
        x.fees = -acqFees;
        x.capex = -capexTotal;
        x.draw = debt;
        x.debtFee = -debtFee;
      }
      if (m > num(s.completionMonth)) {
        const yr = Math.floor((m - num(s.completionMonth) - 1) / 12);
        x.rent = monthGross(m, yr);
        x.opex = -x.rent * num(s.opexMargin) / 100;
        if (costAdjusted) {
          const d = deductions(s, {month: m, completion: num(s.completionMonth), grossRent: x.rent});
          x.headlease = -d.headlease || 0;
          x.ground = -d.ground || 0;
          x.service = -d.service || 0;
        }
        x.interest = -annualInterest / 12;
      }
      x.noi = x.rent + x.opex + x.headlease + x.ground + x.service;
      if (m === num(s.completionMonth) + 1) x.soSale = soProceeds;
      if (m === exitMonth) {
        x.exitSale = exitValue;
        x.saleCosts = -exitValue * num(s.saleCostsPct) / 100;
        x.exitCosts = -num(s.exitCosts);
        x.repay = -debt;
      }
      x.unlev = x.deposit + x.balance + x.tax + x.fees + x.capex + x.noi + x.soSale + x.exitSale + x.saleCosts + x.exitCosts;
      x.lev = x.unlev + x.draw + x.debtFee + x.interest + x.repay;
      cu += x.unlev;
      cl += x.lev;
      x.cumUnlev = cu;
      x.cumLev = cl;
      schedule.push(x);
    }
    if (schedule.some(x => Object.values(x).some(v => typeof v === 'number' && !Number.isFinite(v)))) return {errors: ['Cash flow exceeds the supported numeric range. Check the assumptions.']};
    const returns = (k, cum) => {
      const f = schedule.map(x => x[k]);
      const neg = -f.filter(x => x < 0).reduce((a, x) => a + x, 0);
      const pos = f.filter(x => x > 0).reduce((a, x) => a + x, 0);
      const profit = f.reduce((a, x) => a + x, 0);
      return {
        equity: neg,
        peakEquity: Math.max(0, ...schedule.map(x => -x[cum])),
        irr: UW.xirr(f, schedule.map(x => x.date)),
        multiple: neg ? pos / neg : null,
        profit: profit,
        capitalProfit: profit - schedule.reduce((a, x) => a + x.noi + (k === 'lev' ? x.interest : 0), 0)
      };
    };
    const notes = check.notes.slice();
    if (exitExpired) notes.push('The headlease expires before the exit, so the exit value is nil. Income and the headlease rent stop when the term ends.');
    return {
      errors: [],
      units: units,
      rentedUnits: rentedUnits,
      soUnits: soUnits,
      omv: omv,
      soOmv: soOmv,
      annualRent: modelRent,
      headlineRent: annualRent,
      annualOpex: annualOpex,
      noi: noi,
      yearDeductions: yearDeductions,
      bid: bid,
      price: price,
      sdlt: sdlt,
      acqFees: acqFees,
      totalCapex: capexTotal,
      capexLump: lumpCapex(s, price),
      renoCapex: renoCapex(s),
      allIn: allIn,
      discount: omv ? 1 - price / omv : null,
      debt: debt,
      debtFee: debtFee,
      annualInterest: annualInterest,
      dscr: annualInterest ? noi / annualInterest : null,
      cashAfterInterest: noi - annualInterest,
      entryNiy: noi / (price + sdlt + acqFees),
      yieldOnCost: noi / allIn,
      soProceeds: soProceeds,
      exitNoi: exitNoi,
      exitValue: exitValue,
      exitNet: exitNet,
      exitEquity: exitNet - debt,
      exitExpired: exitExpired,
      areas: areas(s, {headlineRent: annualRent, noi: noi, price: price, capex: capexTotal, allIn: allIn}),
      notes: notes,
      unlevered: returns('unlev', 'cumUnlev'),
      levered: returns('lev', 'cumLev'),
      schedule: schedule
    };
  }

  root.UwProperty = {
    defaults: function () { return Object.assign({}, DEFAULTS); },
    num: num,
    optionalPct: optionalPct,
    reviewsElapsed: reviewsElapsed,
    periodFactor: periodFactor,
    rentMultiplier: rentMultiplier,
    affectsRent: affectsRent,
    affectsCosts: affectsCosts,
    affectsCapex: affectsCapex,
    occupationalMonth: occupationalMonth,
    deductions: deductions,
    headleaseMonth: headleaseMonth,
    groundMonth: groundMonth,
    serviceAnnual: serviceAnnual,
    serviceShortfallMonth: serviceShortfallMonth,
    expiredAtExit: expiredAtExit,
    lumpCapex: lumpCapex,
    renoCapex: renoCapex,
    totalCapex: totalCapex,
    areas: areas,
    validate: validate,
    compute: compute
  };
})(typeof window !== 'undefined' ? window : globalThis);
