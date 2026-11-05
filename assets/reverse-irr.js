/* Required rent for a target yearly return. The forward bid model is left as it is. */
(function () {
  'use strict';

  const DEFAULTS = {
    buy: 500000,
    exit: 650000,
    ltv: 70,
    interest: 7,
    irr: 15,
    opex: 25,
    years: 5,
    homes: 1,
    acqFee: 3.6,
    saleCost: 3,
    exitLump: 0,
    debtFee: 1,
    tax: 'england-extra'
  };

  function money(n) {
    if (n == null || !isFinite(+n)) return '—';
    const sign = n < 0 ? '−' : '';
    return sign + '£' + Math.abs(Math.round(n)).toLocaleString('en-GB');
  }
  function moneyExact(n) {
    if (n == null || !isFinite(+n)) return '—';
    const sign = n < 0 ? '−' : '';
    return sign + '£' + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  function pct(n) {
    if (n == null || !isFinite(+n)) return '—';
    return (n * 100).toFixed(2) + '%';
  }
  function num(value) {
    const n = Number(String(value).replace(/,/g, ''));
    return isFinite(n) ? n : null;
  }
  function bands(price, steps) {
    let tax = 0;
    let floor = 0;
    steps.forEach(function (step) {
      const slice = Math.max(0, Math.min(price, step[0]) - floor);
      tax += slice * step[1];
      floor = step[0];
    });
    return tax;
  }
  function purchaseTax(price, homes, mode) {
    if (!(price > 0)) return 0;
    if (mode === 'scotland') {
      const lbtt = bands(price, [[145000, 0], [250000, 0.02], [325000, 0.05], [750000, 0.10], [Infinity, 0.12]]);
      return lbtt + price * 0.08;
    }
    if (mode === 'england-nonres' || (mode === 'england-auto' && homes >= 6)) {
      return bands(price, [[150000, 0], [250000, 0.02], [Infinity, 0.05]]);
    }
    return bands(price, [[125000, 0.05], [250000, 0.07], [925000, 0.10], [1500000, 0.15], [Infinity, 0.17]]);
  }
  function taxLabel(mode) {
    if (mode === 'scotland') return 'Scotland: LBTT plus the 8% additional dwelling supplement';
    if (mode === 'england-nonres') return 'England: non-residential stamp duty, the deal model’s bands for six or more homes';
    return 'England: stamp duty at the higher additional-dwelling rates used by the deal model';
  }
  function annuity(monthlyRate, months) {
    if (!(months > 0)) return 0;
    if (Math.abs(monthlyRate) < 1e-14) return months;
    return (1 - Math.pow(1 + monthlyRate, -months)) / monthlyRate;
  }
  function structure(input) {
    const buy = input.buy;
    const exit = input.exit;
    const loan = buy * input.ltv;
    const tax = purchaseTax(buy, input.homes, input.tax);
    const acqFees = buy * input.acqFee;
    const debtFee = loan * input.debtFee;
    const equityIn = buy + tax + acqFees + debtFee - loan;
    const saleCosts = exit * input.saleCost + input.exitLump;
    const equityOut = exit - saleCosts - loan;
    const interestAnnual = loan * input.interest;
    return {
      loan: loan,
      tax: tax,
      acqFees: acqFees,
      debtFee: debtFee,
      equityIn: equityIn,
      saleCosts: saleCosts,
      equityOut: equityOut,
      interestAnnual: interestAnnual,
      interestMonthly: interestAnnual / 12
    };
  }
  function cashFlows(input, annualRent) {
    const months = Math.round(input.years * 12);
    const pack = structure(input);
    const netMonthly = annualRent * (1 - input.opex) / 12 - pack.interestMonthly;
    const flows = [-pack.equityIn];
    for (let month = 1; month < months; month++) flows.push(netMonthly);
    flows.push(netMonthly + pack.equityOut);
    return flows;
  }
  function monthlyIrr(flows) {
    let rate = 0.01;
    for (let pass = 0; pass < 60; pass++) {
      let value = 0;
      let slope = 0;
      for (let t = 0; t < flows.length; t++) {
        const base = Math.pow(1 + rate, t);
        value += flows[t] / base;
        if (t > 0) slope -= t * flows[t] / Math.pow(1 + rate, t + 1);
      }
      if (!isFinite(value) || Math.abs(slope) < 1e-14) return null;
      const next = rate - value / slope;
      if (!isFinite(next) || next <= -0.999) return null;
      if (Math.abs(next - rate) < 1e-14) return next;
      rate = next;
    }
    return rate;
  }
  function annualFromMonthly(monthly) {
    if (monthly == null || !isFinite(monthly) || monthly <= -1) return null;
    return Math.pow(1 + monthly, 12) - 1;
  }
  function capital(input) {
    const loan = input.buy * input.ltv;
    const tax = purchaseTax(input.buy, input.homes, input.tax);
    const acqFees = input.buy * input.acqFee;
    const debtFee = loan * input.debtFee;
    return {
      loan: loan,
      tax: tax,
      acqFees: acqFees,
      debtFee: debtFee,
      equityIn: input.buy + tax + acqFees + debtFee - loan,
      interestAnnual: loan * input.interest,
      interestMonthly: loan * input.interest / 12
    };
  }
  function finish(input, annualRent, exitPrice) {
    const copy = Object.assign({}, input, { exit: exitPrice });
    const flows = cashFlows(copy, Math.max(0, annualRent));
    const irr = annualFromMonthly(monthlyIrr(flows));
    const pack = structure(copy);
    return {
      annualRent: annualRent,
      monthlyRent: annualRent / 12,
      exit: exitPrice,
      noi: annualRent * (1 - input.opex),
      interestAnnual: pack.interestAnnual,
      loan: pack.loan,
      tax: pack.tax,
      acqFees: pack.acqFees,
      debtFee: pack.debtFee,
      equityIn: pack.equityIn,
      saleCosts: pack.saleCosts,
      equityOut: pack.equityOut,
      irr: irr,
      months: Math.round(input.years * 12)
    };
  }
  function requiredExit(input, annualIrr, annualRent) {
    const months = Math.round(input.years * 12);
    const monthlyRate = Math.pow(1 + annualIrr, 1 / 12) - 1;
    const factor = annuity(monthlyRate, months);
    const alpha = (1 - input.opex) / 12;
    const kept = 1 - input.saleCost;
    if (!(months >= 1) || !(alpha > 0) || !(factor > 0) || !(input.buy > 0) || !(annualRent > 0) || !(kept > 0)) return null;
    const base = capital(input);
    const netMonthly = annualRent * alpha - base.interestMonthly;
    const equityOut = (base.equityIn - netMonthly * factor) * Math.pow(1 + monthlyRate, months);
    const exitPrice = (equityOut + base.loan + input.exitLump) / kept;
    if (!isFinite(exitPrice)) return null;
    return finish(input, annualRent, exitPrice);
  }
  function requiredRent(input, annualIrr) {
    const months = Math.round(input.years * 12);
    const pack = structure(input);
    const monthlyRate = Math.pow(1 + annualIrr, 1 / 12) - 1;
    const factor = annuity(monthlyRate, months);
    const alpha = (1 - input.opex) / 12;
    if (!(months >= 1) || !(alpha > 0) || !(factor > 0) || !(input.buy > 0) || !(input.exit >= 0)) return null;
    const presentExit = pack.equityOut / Math.pow(1 + monthlyRate, months);
    const annual = (pack.equityIn - presentExit + pack.interestMonthly * factor) / (alpha * factor);
    if (!isFinite(annual)) return null;
    return finish(input, annual, input.exit);
  }

  const touched = { irr: false, opex: false, years: false };
  let choice = { irr: 15, opex: null, years: null };

  function passingRent(deal) {
    const rows = (deal.rows || []).filter(function (row) { return Number(row.units) > 0; });
    return rows.reduce(function (sum, row) {
      const units = Number(row.units) || 0;
      if (row.tenure === 'SO') return sum + units * (Number(row.omv) || 0) * (Number(deal.soRentPct) || 0) / 100 * (Number(deal.retainedPct) || 0) / 100;
      if (deal.income_mode === 'lha') {
        const ref = (typeof UW !== 'undefined' && UW.refs || []).find(function (item) { return item.name === deal.brma; });
        const monthly = ref && ref[String(row.beds)];
        return sum + (Number(monthly) > 0 ? units * Number(monthly) * 12 : 0);
      }
      const factor = deal.income_mode === 'market80' ? 0.8 : 1;
      return sum + units * (Number(row.annualRent) || 0) * factor;
    }, 0);
  }
  function dealSnapshot() {
    const deal = (typeof UW !== 'undefined' && UW.state) ? UW.state : null;
    if (!deal) return null;
    const homes = (deal.rows || []).reduce(function (sum, row) { return sum + (Number(row.units) || 0); }, 0);
    const city = String(deal.city || '');
    let tax = 'england-extra';
    if (/edinburgh|glasgow/i.test(city)) tax = 'scotland';
    else if (deal.taxMode === 'nonres' || (deal.taxMode !== 'residential' && homes >= 6)) tax = 'england-nonres';
    const entered = Number(deal.price) > 0 ? Number(deal.price) : 0;
    const result = (typeof UW !== 'undefined' && UW.result && !(UW.result.errors && UW.result.errors.length)) ? UW.result : null;
    const buy = entered || (result && result.price > 0 ? result.price : 0);
    return {
      buy: buy,
      buyFromBid: !entered && buy > 0,
      exitValue: result && result.exitValue > 0 ? result.exitValue : 0,
      annualRent: passingRent(deal),
      homes: homes || 1,
      homesKnown: homes > 0,
      ltv: Number(deal.ltv),
      interest: Number(deal.interest),
      years: Number(deal.holdYears),
      opex: isFinite(Number(deal.opexMargin)) ? Number(deal.opexMargin) : null,
      acqFee: Number(deal.acqCostsPct),
      debtFee: Number(deal.debtFee),
      saleCost: Number(deal.saleCostsPct),
      exitLump: Number(deal.exitCosts) || 0,
      tax: tax
    };
  }
  function inputFrom(deal) {
    const opex = choice.opex == null ? (deal.opex == null ? 25 : deal.opex) : choice.opex;
    const years = choice.years == null ? deal.years : choice.years;
    return {
      buy: deal.buy,
      exit: deal.exitValue,
      ltv: deal.ltv / 100,
      interest: deal.interest / 100,
      opex: opex / 100,
      years: years,
      homes: deal.homes,
      acqFee: deal.acqFee / 100,
      saleCost: deal.saleCost / 100,
      exitLump: deal.exitLump,
      debtFee: deal.debtFee / 100,
      tax: deal.tax,
      annualRent: deal.annualRent,
      opexPct: opex,
      target: choice.irr
    };
  }
  function column(kicker, figure, lines) {
    return '<section class="ios-scenario"><p class="lc-kicker">' + kicker + '</p><p class="ios-figure">' + figure + '</p>' + lines.map(function (line) { return '<p>' + line + '</p>'; }).join('') + '</section>';
  }
  function resultsHtml(deal) {
    if (!deal || !(deal.buy > 0)) {
      return '<p>Enter a buy price on the assumptions step. This step uses that deal; it does not ask for it again.</p>';
    }
    const input = inputFrom(deal);
    const rentSolve = deal.exitValue > 0 ? requiredRent(input, choice.irr / 100) : null;
    const exitSolve = deal.annualRent > 0 ? requiredExit(input, choice.irr / 100, deal.annualRent) : null;
    const shared = (rentSolve || exitSolve);
    let html = '<div class="ios-scenarios">';
    if (!deal.exitValue) {
      html += column('Required rent', '—', ['The bid model has no sale price yet. Enter the rent and the running costs so it can value the sale.']);
    } else if (rentSolve && rentSolve.annualRent > 0) {
      html += column('Required rent', moneyExact(rentSolve.monthlyRent), [
        'a month · ' + money(rentSolve.annualRent) + ' a year',
        'Rent after running costs ' + money(rentSolve.noi),
        'Cash back at this sale ' + money(rentSolve.equityOut),
        'Yearly return ' + pct(rentSolve.irr)
      ]);
    } else {
      html += column('Required rent', 'None', ['This sale already beats a ' + choice.irr + '% return before any rent.']);
    }
    if (!(deal.annualRent > 0)) {
      html += column('Required exit', '—', ['Enter the passing rent on the rent roll.']);
    } else if (exitSolve && exitSolve.exit > 0) {
      html += column('Required exit', money(exitSolve.exit), [
        'Sale price for a ' + choice.irr + '% return',
        'Using the rent on the deal, ' + money(deal.annualRent) + ' a year',
        'Cash back at that sale ' + money(exitSolve.equityOut),
        'Yearly return ' + pct(exitSolve.irr)
      ]);
    } else {
      html += column('Required exit', '—', ['This rent cannot be turned into a sale price at that return.']);
    }
    html += '</div>';
    if (shared) {
      html += '<div class="ios-support"><div><b>' + money(shared.interestAnnual) + '</b><span>Interest each year, interest only</span></div><div><b>' + money(shared.equityIn) + '</b><span>Cash you put in</span></div><div><b>' + money(shared.loan) + '</b><span>Loan, repaid at the sale</span></div></div>';
    }
    html += '<h2 class="ios-h">At 12%, 15% and 18%</h2><div class="ios-gaps">';
    [12, 15, 18].forEach(function (rate) {
      const rent = deal.exitValue > 0 ? requiredRent(input, rate / 100) : null;
      const exit = deal.annualRent > 0 ? requiredExit(input, rate / 100, deal.annualRent) : null;
      html += '<article class="ios-gap"><p class="lc-kicker">' + rate + '% return</p><p>Rent ' + (rent && rent.monthlyRent > 0 ? moneyExact(rent.monthlyRent) + ' a month' : '—') + '</p><p>Sale ' + (exit && exit.exit > 0 ? money(exit.exit) : '—') + '</p></article>';
    });
    html += '</div>';
    html += '<details class="ios-disc"><summary>What was taken from the deal</summary><p>Buy price ' + money(deal.buy) + (deal.buyFromBid ? ', from the yield bid because the price box is empty' : '') + '. Loan ' + deal.ltv + '% of that price. Interest ' + deal.interest + '% a year, interest only. Purchase fees ' + deal.acqFee + '%. Loan fee ' + deal.debtFee + '%. Selling costs ' + deal.saleCost + '% plus ' + money(deal.exitLump) + '. ' + taxLabel(deal.tax) + '. ' + (deal.homesKnown ? deal.homes + ' homes, which sets the tax band.' : 'No homes entered yet, so the tax is worked as one home.') + '</p>';
    html += '<p>' + (deal.opex == null ? 'Running costs are not on the deal yet, so this step uses the figure in the box. It starts at 25% of the gross rent.' : 'Running costs are the deal’s ' + deal.opex + '% of gross rent, unless you change the box.') + ' The return in the box is for this step. The deal’s entry yield is the price yield, not this return. The hold starts as the deal’s hold.</p>';
    html += '<p>Sale price used for the required rent: ' + (deal.exitValue > 0 ? money(deal.exitValue) + ', the bid model’s sale value.' : 'not available yet.') + ' Passing rent used for the required exit: ' + (deal.annualRent > 0 ? money(deal.annualRent) + ' a year from the rent roll.' : 'not entered.') + '</p>';
    if (shared) html += '<p>Purchase tax ' + money(shared.tax) + '. Purchase fees ' + money(shared.acqFees) + '. Loan arrangement fee ' + money(shared.debtFee) + '.</p>';
    html += '<p>Each month you receive the rent, pay the running-cost percentage of that rent, and pay one twelfth of the year’s interest. The loan stays the same until the sale. At the start you pay the price, tax, fees and loan fee, minus the loan. At the end you receive the sale price, pay the selling costs, and repay the loan. Rent is flat. The 4% yearly step on the bid model is not used here.</p></details>';
    return html;
  }
  function paint(root) {
    if (!root) return;
    const deal = dealSnapshot();
    if (!root.querySelector('[data-rev-out]')) {
      root.innerHTML = '<p class="lc-purpose">Given this deal, the rent that earns the return, and the sale price the rent on the deal needs for the same return.</p><div data-rev-out></div><div class="dlgrid">' +
        '<label class="dlf"><small>Yearly return for this step, %</small><input data-rev="irr" inputmode="decimal" value="' + choice.irr + '"></label>' +
        '<label class="dlf"><small>Running costs, % of rent</small><input data-rev="opex" inputmode="decimal" value="' + (deal && deal.opex != null ? deal.opex : 25) + '"></label>' +
        '<label class="dlf"><small>Years you hold it</small><input data-rev="years" inputmode="decimal" value="' + (deal && deal.years > 0 ? deal.years : 5) + '"></label></div>';
      root.querySelectorAll('[data-rev]').forEach(function (el) {
        const refresh = function () {
          touched[el.getAttribute('data-rev')] = true;
          choice[el.getAttribute('data-rev')] = num(el.value);
          paint(root);
        };
        el.addEventListener('input', refresh);
        el.addEventListener('change', refresh);
      });
    } else if (deal) {
      if (!touched.opex) {
        const box = root.querySelector('[data-rev="opex"]');
        const value = deal.opex == null ? 25 : deal.opex;
        if (box && document.activeElement !== box) box.value = value;
        choice.opex = touched.opex ? choice.opex : null;
      }
      if (!touched.years) {
        const box = root.querySelector('[data-rev="years"]');
        if (box && document.activeElement !== box && deal.years > 0) box.value = deal.years;
        choice.years = null;
      }
    }
    root.querySelector('[data-rev-out]').innerHTML = resultsHtml(deal);
  }
  function mount(root) {
    if (!root) return;
    if (!root.dataset.reverse) root.dataset.reverse = '1';
    paint(root);
  }

  window.lcReverse = {
    defaults: DEFAULTS,
    purchaseTax: purchaseTax,
    requiredRent: requiredRent,
    requiredExit: requiredExit,
    cashFlows: cashFlows,
    annualFromMonthly: annualFromMonthly,
    monthlyIrr: monthlyIrr,
    mount: mount
  };
})();
