import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

globalThis.window = globalThis;
globalThis.lcDataRoot = '../';
globalThis.document = {getElementById: function () { return null; }, addEventListener: function () {}};
await import('../assets/quick-model.js');
await import('../assets/gates-model.js');
await import('../assets/current-lots.js');
await import('../assets/rent-gap.js');
await import('./match-model.js');

const M = globalThis.MatchModel;
const read = (path) => JSON.parse(readFileSync(new URL('../' + path, import.meta.url)));
const frameworks = read('frameworks.json');
const partners = read('partners.json');
const offers = read('provider_offers.json');
const presence = read('presence.json');
const lots = read('data/auctions/lots.json');
const prices = read('prices.json');
const gates = read('data/market-entry/gates.json');
const current = globalThis.lcCurrentLot.currentLot;
const requirements = M.buildRequirements(frameworks, partners, presence, offers);
const auctions = M.auctionSupply(lots.lots, current);
const matches = M.rank(requirements, auctions, 8);

function named(title) {
  const found = M.featured(matches).filter((item) => item.key === title)[0];
  assert.ok(found && found.match, title + ' is not in the ranked matches');
  return found.match;
}

test('three recorded framework-to-lot matches keep their evidence', () => {
  const bristol = named('bristol-ea');
  assert.match(bristol.supply.address, /13 Hanover Street/);
  assert.equal(bristol.supply.beds, 3);
  assert.equal(bristol.supply.form, 'house');
  assert.equal(bristol.supply.guide, 150000);
  assert.equal(bristol.townLevel, true);
  assert.ok(bristol.requirement.holders.some((holder) => /Housing Network/i.test(holder.name)));
  assert.ok(bristol.requirement.evidence.some((row) => row.code === 'framework' || row.code === 'contract' || row.code === 'block contract'));
  assert.equal(bristol.requirement.annualRent, null);
  assert.match(bristol.parts.find((part) => part.key === 'rent').reason, /not recorded|not the rent paid/i);
  assert.equal(bristol.supply.band, '');

  const manchester = named('manchester-ta');
  assert.match(manchester.supply.address, /Fenchurch Avenue/);
  assert.equal(manchester.supply.postcode, 'M40 2RH');
  assert.equal(manchester.requirement.termYears, 10);
  assert.equal(manchester.supply.town, 'Manchester');

  const wigan = named('wigan-lease');
  assert.equal(wigan.supply.town, 'Wigan');
  assert.equal(wigan.requirement.termYears, 5);
  assert.match(wigan.requirement.rentNote, /share/);
  assert.ok(wigan.requirement.spec.forms.includes('house'));
  assert.equal(wigan.requirement.spec.bedsMin, 1);
  assert.equal(wigan.requirement.spec.bedsMax, 4);
});

test('a commercial lot is not offered against a houses requirement', () => {
  const wigan = requirements.find((row) => /Wigan Council Lease/.test(row.name));
  const commercial = auctions.find((lot) => lot.postcode === 'WN4 8AE');
  assert.equal(M.score(wigan, commercial), null);
});

test('sold prices for the Bristol example are the recorded district median', () => {
  const bristol = named('bristol-ea');
  const line = M.soldLine(prices, bristol.supply);
  assert.match(line.value, /£355,000/);
  assert.match(line.value, /n=365/);
});

test('rent and term parsers do not invent a landlord rent', () => {
  const bristol = M.parseRent('AST service max market rent pcm: room £800, 1-bed £975, 2-bed £1,340');
  assert.equal(bristol.annual, null);
  assert.equal(bristol.ceiling['2'], 1340);
  const wigan = M.parseRent('LHA or Affordable Rent (up to 80% market); council keeps a share for management/maintenance, lease rent paid to owner');
  assert.equal(wigan.annual, null);
  assert.match(wigan.note, /share/);
  assert.equal(M.parseTerm('10 years plus 1 day (provider leases)').years, 10);
  assert.equal(M.parseTerm('Usually 5 years').years, 5);
  assert.equal(M.parseTerm('Spot purchase 1 day to several months; block contracts 6 months').years, null);
});

test('the monthly model and the 14 gates run when rent and opex are supplied', () => {
  const bristol = named('bristol-ea');
  const blank = M.runUnderwrite(M.sheetInput(bristol, '2026-11'), gates);
  assert.equal(blank.ok, false);
  assert.ok(blank.missing.includes('year one rent'));
  const filled = M.runUnderwrite(M.sheetInput(bristol, '2026-11', {rent1: '12000', opexPct: '25'}), gates);
  assert.equal(filled.ok, true);
  assert.ok(filled.result.yieldOnCost > 0);
  assert.ok(Number.isFinite(filled.result.leveredIrr));
  assert.ok(filled.result.interestCover > 0);
  assert.equal(filled.gates.verdict, 'FAIL');
  assert.ok(filled.gates.cleared < 14);
  const scored = M.withGates(bristol, filled);
  assert.equal(scored.parts.find((part) => part.key === 'gates').points, Math.round(filled.gates.cleared / 14 * 15));
});

test('live lots use the same current-lot test as the deals site', () => {
  const past = {stale: false, status: 'unsold', auction_date: '2026-10-14', sale_status: ''};
  assert.equal(current(past, '2026-11-24'), false);
  assert.equal(auctions.some((lot) => lot.date && lot.date < '2026-11-24'), false);
});
