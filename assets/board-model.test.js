import assert from 'node:assert/strict';

await import('./board-model.js');
const M = globalThis.BoardModel;

const today = '2026-11-17';
const lots = [
  {id: 'a', town: 'Manchester', status: 'upcoming', auction_date: '2026-12-01', guide_price: 180000, title: '3 bedroom house', address: '1 High Street', lot_type: 'House', source_url: 'https://example.com/a'},
  {id: 'b', town: 'Manchester', status: 'upcoming', auction_date: '2026-12-15', guide_price: 90000, title: 'Flat', address: '2 High Street', lot_type: 'Flat', source_url: 'https://example.com/b'},
  {id: 'c', town: 'Manchester', status: 'sold', auction_date: '2026-12-01', guide_price: 500000, title: '4 bedroom house', address: 'Sold', lot_type: 'House'},
  {id: 'd', town: 'Manchester', status: 'upcoming', auction_date: '2026-10-01', guide_price: 250000, title: '3 bedroom house', address: 'Past', lot_type: 'House'},
  {id: 'e', town: 'Glasgow', status: 'upcoming', auction_date: '2026-12-01', guide_price: null, title: 'Shop', address: '3 Road', lot_type: 'Commercial', source_url: 'https://example.com/e'}
];
const rents = {omr: {month: 'Sep 2026', areas: {Manchester: {monthly: {'1': 1000, '2': 1200, '3': 1400, '4plus': 2000}}, 'Cheshire East': {monthly: {'3': 1115}}}}, lha: {areas: {Manchester: {monthly: {'1': 700, '2': 800, '3': 900, '4': 1200}}}}};
const comps = {places: {Manchester: {postcode_districts: {M1: {'2025': {all: {n: 10, median: 200000}}, '2026': {all: {n: 2, median: 10}}}, M2: {'2025': {all: {n: 8, median: 300000}}}}}, Glasgow: {postcode_districts: {}}}};

const screen = M.build({lots, today, area: 'Manchester', rents, comps});
assert.equal(screen.lots.length, 2);
assert.equal(screen.lots.some((lot) => lot.address === 'Sold'), false);
assert.equal(screen.lots.some((lot) => lot.address === 'Past'), false);
assert.equal(screen.medianGuide, 135000);
assert.equal(screen.types.find((row) => row.id === 'House').count, 1);
assert.equal(screen.beds.find((row) => row.id === '3').count, 1);
assert.equal(screen.beds.find((row) => row.id === 'Not stated').count, 1);
assert.equal(screen.calendar.find((row) => row.id === '2026-12').count, 2);
assert.equal(screen.rents.find((row) => row.id === '3').gap, 500);
assert.equal(screen.rents.find((row) => row.id === '4').gap, null);
assert.equal(screen.comps.year, '2025');
assert.equal(screen.comps.rows.length, 2);
assert.equal(M.matches(screen, {kind: 'type', id: 'House'}).length, 1);
assert.equal(M.matches(screen, {kind: 'price', id: 'under-100'}).length, 1);
assert.equal(screen.takeaways.length, 3);
assert.equal(screen.takeaways.join(' ').includes(';'), false);
assert.equal(screen.takeaways.join(' ').includes('—'), false);

const glasgow = M.build({lots, today, area: 'Glasgow', rents, comps});
assert.equal(glasgow.lots.length, 1);
assert.equal(glasgow.medianGuide, null);
assert.equal(glasgow.comps.rows.length, 0);
assert.equal(glasgow.takeaways.some((line) => line.includes('not in the file')), true);

const cheshire = M.build({lots: [], today, area: 'Cheshire', rents, comps});
assert.equal(cheshire.rents.every((row) => row.gap3 == null || row.gap == null), true);
assert.equal(cheshire.takeaways.some((line) => line.includes('more than one allowance')), true);
assert.equal(M.money(null), 'Not yet recorded');

console.log('board model tests passed');
