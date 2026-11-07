import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const window = {};
vm.runInNewContext(fs.readFileSync('assets/niy.js', 'utf8'), { window });
const api = window.lcNiy;

test('Whiteladies Road mixed-use uses non-residential SDLT, not additional-dwelling rates', () => {
  const row = {
    city: 'Bristol',
    address: 'Whiteladies Road, Clifton (retail + flats)',
    type: 'Mixed use (retail, 2 bed flat, 3 bed maisonette)',
    sold_price: 715000,
    sold_date: '2026-05',
    rent_pa: 67540,
    rent_text: '£67,540 pa',
    rent_basis: 'passing',
    auctioneer: 'Hollis Morgan',
    url: 'https://www.hollismorgan.co.uk/property-details/34525721'
  };
  const comp = api.book(null, { rows: [row] })[0];
  // 0% to £150,000, 2% on the next £100,000, 5% on £465,000 = £25,250. Fees 1.8% = £12,870.
  // £67,540 / (£715,000 + £25,250 + £12,870) = 8.97%.
  assert.equal(comp.asset, 'Mixed-use');
  assert.equal(comp.pct, 8.97);
  assert.equal(comp.average, false);
  assert.match(comp.note, /non-residential/);
  assert.match(comp.note, /not in the residential averages|Kept out of the residential averages/);
  const residential = api.derive(715000, 67540, 'Bristol', '2 bed flat');
  assert.equal(residential.pct, 8.56);
  assert.notEqual(comp.pct, residential.pct);
});

test('mixed-use and commercial comps stay out of residential averages', () => {
  const comps = api.book(null, { rows: [
    { city: 'Bristol', address: '1 House Street, Bristol, BS1 1AA', type: 'house', sold_price: 200000, sold_date: '2026-01-01', rent_pa: 12000, rent_text: '£12,000 pa', rent_basis: 'passing', url: 'https://example.test/h' },
    { city: 'Bristol', address: '2 House Street, Bristol, BS1 1AB', type: 'house', sold_price: 210000, sold_date: '2026-02-01', rent_pa: 12600, rent_text: '£12,600 pa', rent_basis: 'passing', url: 'https://example.test/h2' },
    { city: 'Bristol', address: '3 House Street, Bristol, BS1 1AC', type: 'house', sold_price: 220000, sold_date: '2026-03-01', rent_pa: 13200, rent_text: '£13,200 pa', rent_basis: 'passing', url: 'https://example.test/h3' },
    { city: 'Bristol', address: 'Whiteladies Road', type: 'Mixed use (retail, 2 bed flat)', sold_price: 715000, sold_date: '2026-05', rent_pa: 67540, rent_text: '£67,540 pa', rent_basis: 'passing', url: 'https://example.test/m' },
    { city: 'Bristol', address: 'Shop Only', type: 'retail shop', sold_price: 300000, sold_date: '2026-04-01', rent_pa: 24000, rent_text: '£24,000 pa', rent_basis: 'passing', url: 'https://example.test/s' }
  ]});
  const mixed = comps.find(row => row.address === 'Whiteladies Road');
  const shop = comps.find(row => row.address === 'Shop Only');
  assert.equal(mixed.average, false);
  assert.equal(shop.average, false);
  assert.ok(comps.filter(row => row.asset === 'Houses' && row.average).length >= 3);
  const avgs = api.averages(comps);
  assert.equal(avgs.some(row => row.asset === 'Mixed-use' && row.stat), false);
  const houses = avgs.find(row => row.city === 'Bristol' && row.asset === 'Houses');
  assert.equal(houses.rows.some(row => /Whiteladies|Shop Only/.test(row.address)), false);
});

test('a Scottish mixed-use comp is not charged additional dwelling supplement on the whole price', () => {
  const mixed = api.derive(400000, 28000, 'Edinburgh', 'mixed use shop and flat');
  const house = api.derive(400000, 28000, 'Edinburgh', 'house');
  assert.ok(mixed.tax < house.tax);
  assert.match(mixed.taxLabel, /non-residential/);
  assert.match(house.taxLabel, /additional dwelling supplement/);
});
