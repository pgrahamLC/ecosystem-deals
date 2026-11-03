/* Allsop publishes the catalogue the page itself requests at /api/search. */
import { areaMatch, saleTag } from './core.mjs';

const REGIONS = ['North West', 'Scotland', 'South West', 'West Midlands', 'East Midlands'];
const TYPES = ['residential', 'commercial'];

async function search(fetchImpl, region, lotType, page) {
  const url = 'https://www.allsop.co.uk/api/search?available_only=false&lot_type=' + encodeURIComponent(lotType) + '&region=' + encodeURIComponent(region) + '&page=' + page + '&react';
  const response = await fetchImpl(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LauritoAuctionsBot/1.0)', Accept: 'application/json' } });
  if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + url);
  const body = await response.json();
  return body.data || { results: [], total: 0 };
}

export async function collect({ source, now, fetchImpl = globalThis.fetch }) {
  const result = { lots: [], commercial_excluded: 0, errors: [], warnings: [], pages: 0, successful_pages: 0 };
  const stamp = (now instanceof Date ? now : new Date(now || Date.now())).toISOString();
  const seen = new Set();
  for (const region of REGIONS) {
    for (const lotType of TYPES) {
      let page = 1;
      let total = Infinity;
      while ((page - 1) * 20 < total && page <= 140) {
        try {
          const data = await search(fetchImpl, region, lotType, page);
          result.pages++;
          result.successful_pages++;
          total = Number(data.total || 0);
          const rows = data.results || [];
          if (!rows.length) break;
          for (const row of rows) {
            const address = row.full_address || row.allsop_address || '';
            const area = areaMatch(address + ' ' + (row.postcode || '') + ' ' + (row.town || ''));
            if (!area || seen.has(row.allsop_lotid)) continue;
            seen.add(row.allsop_lotid);
            const featureText = Array.isArray(row.features) ? row.features.map(item => item && (item.value || item)).join(' ') : row.features;
            const words = [row.property_byline, row.allsop_propertybyline, row.main_byline, featureText, row.live_addendum, row.rent_notes].filter(Boolean).join(' ');
            const tag = saleTag(words);
            const status = /withdrawn/i.test(row.lot_status || '') ? 'withdrawn' : /sold/i.test(row.lot_status || '') ? 'sold' : 'upcoming';
            const version = row.website_allsop_lot_version_id || row.version_id || row.allsop_lotid;
            result.lots.push({
              title: address,
              address,
              postcode: area.postcode || row.postcode,
              lot_type: lotType === 'commercial' || row.is_commercial ? 'Commercial' : (row.property_class || row.type || ''),
              residential_subtype: lotType === 'commercial' || row.is_commercial ? 'Commercial' : '',
              guide_price: Number(row.guide_price_lower) || null,
              guide_price_text: row.guide_price_text || row.price || null,
              sold_price: status === 'sold' ? Number(row.sale_price) || null : null,
              auction_date: row.auction_date || null,
              status,
              source_url: 'https://www.allsop.co.uk/lot-overview/' + version,
              allsop_lotid: row.allsop_lotid,
              source: source.name || 'Allsop',
              scraped_at: stamp,
              page_text: words,
              sale_tag: tag.tag,
              sale_tag_evidence: tag.evidence,
              forced_sale_evidence: tag.evidence,
              forced_sale_evidence_url: tag.evidence ? 'https://www.allsop.co.uk/lot-overview/' + version : ''
            });
          }
          page++;
        } catch (error) {
          result.errors.push(region + ' ' + lotType + ' page ' + page + ': ' + (error.message || error));
          break;
        }
      }
    }
  }
  await enrich(result, fetchImpl);
  if (result.lots.length) {
    const sample = result.lots.find(lot => lot.postcode) || result.lots[0];
    result.warnings.push('Spot-check: ' + sample.address.slice(0, 80) + ' from Allsop /api/search and /api/lot, page ' + sample.source_url);
  }
  return result;
}

async function enrich(result, fetchImpl) {
  const queue = result.lots.filter(lot => lot.allsop_lotid);
  let cursor = 0;
  async function one(lot) {
    const response = await fetchImpl('https://www.allsop.co.uk/api/lot/' + lot.allsop_lotid + '?react', { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LauritoAuctionsBot/1.0)', Accept: 'application/json' } });
    if (!response.ok) return;
    const body = await response.json();
    const data = body && body.data && !Array.isArray(body.data) ? body.data : null;
    if (!data) return;
    const desc = Array.isArray(data.description) ? data.description.map(item => item && item.value).filter(Boolean).join(' ') : '';
    const features = Array.isArray(data.features) ? data.features.map(item => item && item.value).filter(Boolean).join(' ') : '';
    const order = data.by_order_of ? 'By order of ' + (typeof data.by_order_of === 'string' ? data.by_order_of : JSON.stringify(data.by_order_of)) : '';
    const words = [order, data.allsop_propertybyline, desc, features, data.live_addendum].filter(Boolean).join(' ');
    const tag = saleTag(words);
    lot.page_text = words.slice(0, 4000);
    lot.sale_tag = tag.tag;
    lot.sale_tag_evidence = tag.evidence;
    lot.forced_sale_evidence = tag.evidence;
    lot.forced_sale_evidence_url = tag.evidence ? lot.source_url : '';
    if (data.allsop_propertypostcode && !String(data.allsop_propertypostcode).replace(/\s+/g, '').includes(String(lot.postcode || '').replace(/\s+/g, '')) && lot.postcode) {
      result.warnings.push('Detail postcode ' + data.allsop_propertypostcode + ' differs from search postcode ' + lot.postcode);
    }
  }
  async function worker() {
    while (cursor < queue.length) {
      const lot = queue[cursor++];
      try {
        await one(lot);
        if (cursor % 500 === 0) console.log('Allsop lot pages ' + cursor + '/' + queue.length);
      }
      catch (error) { result.warnings.push('Allsop detail ' + lot.allsop_lotid + ': ' + (error.message || error)); }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
}
