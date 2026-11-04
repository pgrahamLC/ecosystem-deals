import test from 'node:test';
import assert from 'node:assert/strict';
import { collect } from './allsop.mjs';

const calendar = {
  data: {
    next_residential_auction: { allsop_auctionid: 'resi', allsop_auctiondate: '2026-11-18T00:00:00.000Z', allsop_auctionreference: 'R261118', allsop_name: 'Residential November', auction_type: 'residential' },
    next_commercial_auction: { allsop_auctionid: 'comm', allsop_auctiondate: '2026-11-11T00:00:00.000Z', allsop_auctionreference: 'C261111', allsop_name: 'Commercial November', auction_type: 'commercial' }
  },
  futureResi: { allsop_auctionid: 'later', allsop_auctiondate: '2026-10-01T00:00:00.000Z', auction_type: 'residential' },
  futureComm: null
};

const lots = {
  resi: [
    { allsop_lotid: 'm1', version_id: 'ver-m1', full_address: '1 High Street, Manchester', postcode: 'M1 1AA', town: 'Manchester', lot_status: 'Available', auction_date: Date.parse('2026-11-18T00:00:00Z'), property_class: 'house', allsop_propertybyline: 'Freehold house', guide_price_lower: 120000, guide_price_text: '£120,000+' },
    { allsop_lotid: 'lon', version_id: 'ver-lon', full_address: '9 King Street, London', postcode: 'SW1A 1AA', town: 'London', lot_status: 'Available', auction_date: Date.parse('2026-11-18T00:00:00Z'), property_class: 'flat' }
  ],
  comm: [
    { allsop_lotid: 'g1', version_id: 'ver-g1', full_address: '4 Merchant Street, Glasgow', postcode: 'G1 1AA', town: 'Glasgow', lot_status: 'Available', is_commercial: true, auction_date: Date.parse('2026-11-11T00:00:00Z'), guide_price_text: '£80,000+', allsop_propertybyline: 'Shop' }
  ]
};

function jsonResponse(body) {
  return { ok: true, json: async () => body };
}

test('upcoming Allsop catalogues keep in-area lots and tag commercial stock', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('/api/auctions/current-and-past')) return jsonResponse(calendar);
    if (url.includes('auction_id=resi')) return jsonResponse({ data: { results: lots.resi, total: 2 } });
    if (url.includes('auction_id=comm')) return jsonResponse({ data: { results: lots.comm, total: 1 } });
    if (url.includes('auction_id=later')) return jsonResponse({ data: { results: [], total: 0 } });
    if (url.includes('available_only=true&lot_type=')) return jsonResponse({ data: [] });
    if (url.includes('/api/lot/m1')) return jsonResponse({ data: { by_order_of: 'the LPA Receiver', allsop_propertybyline: 'Freehold house' } });
    if (url.includes('/api/lot/')) return jsonResponse({ data: { allsop_propertybyline: 'Lot' } });
    throw new Error('unexpected ' + url);
  };
  const result = await collect({ source: { name: 'Allsop' }, now: '2026-11-04T12:00:00.000Z', fetchImpl, pauseMs: 0 });
  assert.equal(result.errors.length, 0);
  assert.equal(result.lots.length, 2);
  const manchester = result.lots.find(lot => lot.allsop_lotid === 'm1');
  const glasgow = result.lots.find(lot => lot.allsop_lotid === 'g1');
  assert.equal(manchester.status, 'upcoming');
  assert.equal(manchester.sale_tag, 'Receiver');
  assert.equal(manchester.residential_subtype, '');
  assert.equal(glasgow.residential_subtype, 'Commercial');
  assert.equal(glasgow.lot_type, 'Commercial');
  assert.equal(glasgow.sale_tag, 'Auction');
  assert.equal(result.warnings.some(item => /written permission|commercial use/i.test(item)), false);
});
