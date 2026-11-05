import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const window = {};
vm.runInNewContext(fs.readFileSync('assets/reverse-irr.js', 'utf8'), { window, document: {}, console });
const api = window.lcReverse;

function example(irr) {
  return api.requiredRent({
    buy: 500000,
    exit: 650000,
    ltv: 0.70,
    interest: 0.07,
    opex: 0.25,
    years: 5,
    homes: 1,
    acqFee: 0.036,
    saleCost: 0.03,
    exitLump: 0,
    debtFee: 0.01,
    tax: 'england-extra'
  }, irr);
}

test('England additional-dwelling tax on £500,000 matches the deal model bands', () => {
  assert.equal(api.purchaseTax(500000, 1, 'england-extra'), 40000);
});

test('the example rent compounds to a 15% yearly return', () => {
  const result = example(0.15);
  assert.ok(result.monthlyRent > 0);
  assert.ok(Math.abs(result.irr - 0.15) < 0.00005);
  assert.equal(result.loan, 350000);
  assert.equal(Math.round(result.interestAnnual), 24500);
  assert.equal(Math.round(result.equityIn), 211500);
  assert.equal(Math.round(result.equityOut), 280500);
  console.log('EXAMPLE monthly', Math.round(result.monthlyRent), 'annual', Math.round(result.annualRent), 'noi', Math.round(result.noi));
});

test('a higher target return needs more rent', () => {
  const low = example(0.12).monthlyRent;
  const mid = example(0.15).monthlyRent;
  const high = example(0.18).monthlyRent;
  assert.ok(low < mid && mid < high);
  console.log('SENSITIVITY', Math.round(low), Math.round(mid), Math.round(high));
});
