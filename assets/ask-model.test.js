import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

globalThis.window = globalThis;
await import('./current-lots.js');
await import('./rent-gap.js');
await import('./ask-model.js');
const Ask = globalThis.AskDealsModel;
const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));

const lots = [
  {address: '1 Test Street', city: 'Manchester', residential_subtype: 'Flats', title: '2 bed flat', guide_price: 60000, status: 'upcoming', source: 'House A', source_url: 'https://example.org/1'},
  {address: '2 Test Street', city: 'Manchester', residential_subtype: 'Houses', title: '3 bed house', guide_price: 120000, guide_price_text: '£120,000', status: 'upcoming', source: 'House A', source_url: 'https://example.org/2'},
  {address: '3 Test Street', city: 'Liverpool', residential_subtype: 'Flats', title: '1 bed flat', guide_price: 45000, status: 'upcoming', source: 'House B', source_url: 'https://example.org/3'},
  {address: '4 Test Street', city: 'Liverpool', residential_subtype: 'Flats', title: 'Flat', status: 'upcoming', source: 'House B', source_url: 'https://example.org/4'}
];
const ctx = {
  lots,
  lotsUpdated: '2026-11-17T10:26:13.062Z',
  rentGap: globalThis.lcRentGap.build(read('../data/rent-scenarios.json')),
  prices: read('../prices.json'),
  contracts: read('../contracts.json'),
  demand: read('../demand.json')
};

test('counts current lots for an area and reports the median guide', () => {
  const out = Ask.answer('How many current lots in Manchester?', ctx);
  assert.match(out.text, /^2 current lots for Manchester/);
  assert.match(out.text, /Median guide £90,000 from the 2 that publish one/);
  assert.deepEqual(out.trace, ['search_current_lots']);
});

test('filters lots by type and guide cap, and never counts a lot with no guide as under the cap', () => {
  const out = Ask.answer('Cheapest flats in Liverpool under £80k', ctx);
  assert.match(out.text, /^1 current lot for Liverpool, flats, guide at or under £80,000/);
  assert.match(out.text, /3 Test Street/);
  assert.doesNotMatch(out.text, /4 Test Street/);
  assert.equal(out.citations[0].href, 'https://example.org/3');
});

test('uses the numeric guide only, as the Board does', () => {
  assert.equal(Ask.guideOf(lots[1]), 120000);
  assert.equal(Ask.guideOf({guide_price_text: '£145,000'}), null);
  assert.equal(Ask.guideOf(lots[3]), null);
  assert.equal(Ask.priceCap('under £1.5m'), 1500000);
});

test('rent gap comes from the site rent table, not an estimate', () => {
  const row = ctx.rentGap.ranked.find((item) => item.area === 'Bristol' && item.beds === '3');
  const out = Ask.answer('Rent gap for 3 bed in Bristol', ctx);
  assert.ok(row, 'Bristol 3 bed row exists in the rent table');
  assert.ok(out.text.includes('gap £' + Math.round(row.gap).toLocaleString('en-GB')));
  assert.match(out.text, /benefit cap, not an offered rent/);
});

test('contracts, demand and sold prices answer from their files and say when an area is not on file', () => {
  assert.match(Ask.answer('Which contracts are on file for Bristol?', ctx).text, /^3 contract routes on file for Bristol/);
  assert.match(Ask.answer('contracts in Glasgow', ctx).text, /No contract route is on file for Glasgow/);
  const total = ctx.demand.cities.Manchester.stats.ta_total.value.toLocaleString('en-GB');
  assert.ok(Ask.answer('Temporary accommodation in Manchester', ctx).text.includes('Households in temporary accommodation: ' + total));
  assert.match(Ask.answer('sold prices in Glasgow', ctx).text, /No city sold median is on file for Glasgow/);
  assert.match(Ask.answer('median sold price Manchester', ctx).text, /^Manchester, sales from/);
});

test('declines to estimate and does not guess on an unmatched question', () => {
  assert.deepEqual(Ask.answer('What yield will I get on this?', ctx).trace, ['decline_estimate']);
  const miss = Ask.answer('Tell me a joke', ctx);
  assert.deepEqual(miss.trace, ['no_match']);
  assert.match(miss.text, /I will not guess/);
});

test('the hurdle names match the gates model', () => {
  const source = readFileSync(new URL('./gates-model.js', import.meta.url), 'utf8');
  const names = [...source.matchAll(/n: (\d+), group: '\w+', name: '([^']+)'/g)].map((match) => match[2]);
  assert.deepEqual(Ask.HURDLES, names);
  assert.match(Ask.answer('What are the 14 hurdles?', ctx).text, /14\. Unexpired term at exit/);
});

test('answers carry no long dash and every tab named can be opened', () => {
  for (const question of ['help', 'lots in Glasgow', 'rent gap', 'demand in Edinburgh']) assert.doesNotMatch(Ask.answer(question, ctx).text, /[—–]/);
  assert.ok(Ask.TABS.every((tab) => tab[0] && tab[1]));
});
