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
    const flows = cashFlows(input, Math.max(0, annual));
    const solved = annualFromMonthly(monthlyIrr(flows));
    return {
      annualRent: annual,
      monthlyRent: annual / 12,
      noi: annual * (1 - input.opex),
      interestAnnual: pack.interestAnnual,
      loan: pack.loan,
      tax: pack.tax,
      acqFees: pack.acqFees,
      debtFee: pack.debtFee,
      equityIn: pack.equityIn,
      saleCosts: pack.saleCosts,
      equityOut: pack.equityOut,
      irr: annual > 0 ? solved : annualFromMonthly(monthlyIrr(cashFlows(input, 0))),
      months: months
    };
  }

  let state = Object.assign({}, DEFAULTS);

  function read(root) {
    root.querySelectorAll('[data-rev]').forEach(function (el) {
      const key = el.getAttribute('data-rev');
      if (key === 'tax') state.tax = el.value;
      else state[key] = num(el.value);
    });
  }
  function field(key, label, step) {
    const value = state[key];
    return '<label class="dlf"><small>' + label + '</small><input data-rev="' + key + '" inputmode="decimal" value="' + (value == null ? '' : value) + '"' + (step ? ' step="' + step + '"' : '') + '></label>';
  }
  function resultsHtml() {
    const input = {
      buy: state.buy,
      exit: state.exit,
      ltv: state.ltv / 100,
      interest: state.interest / 100,
      opex: state.opex / 100,
      years: state.years,
      homes: state.homes,
      acqFee: state.acqFee / 100,
      saleCost: state.saleCost / 100,
      exitLump: state.exitLump,
      debtFee: state.debtFee / 100,
      tax: state.tax
    };
    const main = requiredRent(input, state.irr / 100);
    const sensitivities = [12, 15, 18].map(function (rate) {
      return { rate: rate, result: requiredRent(input, rate / 100) };
    });
    let hero = '<p>Enter a buy price, an exit price and a hold of at least one year.</p>';
    if (main && main.annualRent > 0 && main.irr != null) {
      hero = '<p class="lc-kicker">Required passing rent for a ' + state.irr + '% yearly return</p>' +
        '<p class="ios-figure">' + moneyExact(main.monthlyRent) + '</p><p>a month · ' + money(main.annualRent) + ' a year</p>' +
        '<div class="ios-support"><div><b>' + money(main.noi) + '</b><span>Rent after running costs</span></div><div><b>' + money(main.interestAnnual) + '</b><span>Interest each year, interest only</span></div><div><b>' + money(main.equityIn) + '</b><span>Cash you put in</span></div><div><b>' + money(main.equityOut) + '</b><span>Cash back at the sale</span></div></div>' +
        '<p>The yearly return on these monthly cash flows is <b>' + pct(main.irr) + '</b>.</p>';
    } else if (main && main.annualRent <= 0) {
      hero = '<p>No rent is required. The sale already produces more than a ' + state.irr + '% yearly return. At no rent the return is ' + pct(main.irr) + '.</p>';
    }
    const sense = '<div class="ios-gaps">' + sensitivities.map(function (item) {
      const rent = item.result && item.result.monthlyRent > 0 ? moneyExact(item.result.monthlyRent) + ' a month' : 'No rent required';
      return '<article class="ios-gap"><p class="lc-kicker">' + item.rate + '% return</p><p class="ios-figure">' + rent + '</p></article>';
    }).join('') + '</div>';
    const costs = main ? '<p>Purchase tax ' + money(main.tax) + '. Purchase fees ' + money(main.acqFees) + '. Loan arrangement fee ' + money(main.debtFee) + '. Loan ' + money(main.loan) + ', interest only. Selling costs ' + money(main.saleCosts) + '. The loan is still ' + money(main.loan) + ' at the sale and is repaid then.</p>' : '';
    return hero + '<h2 class="ios-h">Rent at 12%, 15% and 18%</h2>' + sense +
      '<details class="ios-disc"><summary>How this rent is worked out</summary>' +
      '<p>' + taxLabel(state.tax) + '. Purchase fees start at 3.6% of the buy price, and selling costs at 3% of the sale price, the same percentages as the bid model. The loan fee starts at 1% of the loan. All of these are editable.</p>' +
      costs +
      '<p>At the start you pay the buy price, the purchase tax, the purchase fees and the loan fee, and you draw the loan. Each month after that you receive rent, pay running costs as that percentage of the rent, and pay one twelfth of the year’s interest. The loan does not reduce during the hold. In the last month you also receive the sale price, pay the selling costs, and repay the loan. Rent is flat; it does not use the 4% yearly step from the bid above. The rent shown is the one that makes this monthly series compound to the yearly return you set.</p>' +
      '<p>Running costs are a percentage of the gross rent, not of the income left after those costs.</p></details>';
  }
  function paint(root) {
    if (!root) return;
    let output = root.querySelector('[data-rev-out]');
    if (!output) {
      root.innerHTML = '<div data-rev-out></div><div class="dlgrid">' +
      field('buy', 'Buy price, £') +
      field('exit', 'Sale price at the end, £') +
      field('ltv', 'Loan, % of the buy price', '0.1') +
      field('interest', 'Interest, % a year', '0.1') +
      field('irr', 'Yearly return you want, %', '0.1') +
      field('opex', 'Running costs, % of rent', '0.1') +
      field('years', 'Years you hold it', '1') +
      field('homes', 'Homes in the purchase', '1') +
      field('acqFee', 'Purchase fees, % of the buy price', '0.1') +
      field('debtFee', 'Loan arrangement fee, % of the loan', '0.1') +
      field('saleCost', 'Selling costs, % of the sale price', '0.1') +
      field('exitLump', 'Other exit costs, £') +
      '<label class="dlf"><small>Purchase tax</small><select data-rev="tax">' +
      [['england-extra', 'England, additional dwelling'], ['england-nonres', 'England, six or more homes'], ['scotland', 'Scotland, LBTT + 8%']].map(function (pair) {
        return '<option value="' + pair[0] + '"' + (state.tax === pair[0] ? ' selected' : '') + '>' + pair[1] + '</option>';
      }).join('') + '</select></label></div>';
      output = root.querySelector('[data-rev-out]');
      root.querySelectorAll('[data-rev]').forEach(function (el) {
        const refresh = function () { read(root); paint(root); };
        el.addEventListener('input', refresh);
        el.addEventListener('change', refresh);
      });
    }
    output.innerHTML = resultsHtml();
  }
  function mount(root) {
    if (!root || root.dataset.reverse) return;
    root.dataset.reverse = '1';
    paint(root);
  }

  window.lcReverse = {
    defaults: DEFAULTS,
    purchaseTax: purchaseTax,
    requiredRent: requiredRent,
    cashFlows: cashFlows,
    annualFromMonthly: annualFromMonthly,
    monthlyIrr: monthlyIrr,
    mount: mount
  };
})();
