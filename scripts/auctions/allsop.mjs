/* Upcoming Allsop catalogues, from the public search the website itself calls.
   One request at a time. No login, no challenge bypass, no historical archive crawl. */
import { areaMatch, saleTag } from './core.mjs';

const PAUSE_MS = 600;
const PAGE_SIZE = 20;
const REGIONS = ['North West', 'Scotland', 'South West', 'West Midlands', 'East Midlands'];
const UA = 'Mozilla/5.0 (compatible; LauritoAuctionsBot/1.0)';

function day(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value > 1e11 ? value : value * 1000);
    if (Number.isFinite(+date)) return date.toISOString().slice(0, 10);
  }
  if (typeof value === 'string' && value) {
    const date = new Date(value);
    if (Number.isFinite(+date)) return date.toISOString().slice(0, 10);
  }
  return fallback || null;
}

function statusOf(raw) {
  const text = String(raw || '');
  if (/withdrawn/i.test(text)) return 'withdrawn';
  if (/unsold/i.test(text)) return 'unsold';
  if (/sold/i.test(text)) return 'sold';
  return 'upcoming';
}

function upcomingAuctions(body, today) {
  const rows = [];
  const add = (row, type) => {
    if (!row || typeof row !== 'object' || Array.isArray(row) || !row.allsop_auctionid) return;
    const date = day(row.allsop_auctiondate);
    if (!date || date < today) return;
    rows.push({
      id: row.allsop_auctionid,
      date,
      name: row.allsop_name || '',
      reference: row.allsop_auctionreference || '',
      type: row.auction_type || type || ''
    });
  };
  const data = (body && body.data) || {};
  add(data.next_residential_auction, 'residential');
  add(data.next_commercial_auction, 'commercial');
  add(body && body.futureResi, 'residential');
  add(body && body.futureComm, 'commercial');
  const seen = new Set();
  return rows.filter(row => (seen.has(row.id) ? false : seen.add(row.id)));
}

function commercialLot(row, auction) {
  if (row && (row.is_commercial === true || String(row.lot_type || '').toLowerCase() === 'commercial')) return true;
  return !!(auction && String(auction.type).toLowerCase() === 'commercial');
}

export async function collect({ source, now, fetchImpl = globalThis.fetch, pauseMs = PAUSE_MS } = {}) {
  const result = { lots: [], commercial_excluded: 0, errors: [], warnings: [], pages: 0, successful_pages: 0 };
  const stamp = (now instanceof Date ? now : new Date(now || Date.now())).toISOString();
  const today = stamp.slice(0, 10);
  const seen = new Set();
  let last = 0;
  async function readJson(url) {
    const wait = Math.max(0, last + pauseMs - Date.now());
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    last = Date.now();
    const response = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, redirect: 'follow' });
    if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + url);
    const type = response.headers && response.headers.get ? response.headers.get('content-type') || '' : '';
    if (/text\/html/i.test(type)) throw new Error('HTML page instead of catalogue JSON');
    return response.json();
  }
  function add(row, auction) {
    if (!row || seen.has(row.allsop_lotid)) return;
    const address = row.full_address || row.allsop_address || '';
    const postcode = row.postcode || row.allsop_propertypostcode || '';
    const area = areaMatch([address, postcode, row.town, row.allsop_propertytown].filter(Boolean).join(' '));
    if (!area) return;
    seen.add(row.allsop_lotid);
    const featureText = Array.isArray(row.features) ? row.features.map(item => item && (item.value || item)).join(' ') : row.features;
    const words = [row.property_byline, row.allsop_propertybyline, row.main_byline, featureText, row.live_addendum, row.rent_notes].filter(Boolean).join(' ');
    const tag = saleTag(words);
    const status = statusOf(row.lot_status || row.allsop_lotstatus || row.lotStatus);
    const commercial = commercialLot(row, auction);
    const version = row.website_allsop_lot_version_id || row.version_id || row.allsop_lotid;
    result.lots.push({
      title: address,
      address,
      postcode: area.postcode || postcode,
      lot_type: commercial ? 'Commercial' : (row.property_class || row.type || row.allsop_propertytype || ''),
      residential_subtype: commercial ? 'Commercial' : '',
      guide_price: Number(row.guide_price_lower) || null,
      guide_price_text: row.guide_price_text || row.price || null,
      sold_price: status === 'sold' ? Number(row.sale_price) || null : null,
      auction_date: day(row.auction_date, auction && auction.date),
      status,
      source_url: 'https://www.allsop.co.uk/lot-overview/' + version,
      allsop_lotid: row.allsop_lotid,
      source: (source && source.name) || 'Allsop',
      scraped_at: stamp,
      page_text: words,
      sale_tag: tag.tag,
      sale_tag_evidence: tag.evidence,
      forced_sale_evidence: tag.evidence,
      forced_sale_evidence_url: tag.evidence ? 'https://www.allsop.co.uk/lot-overview/' + version : ''
    });
  }
  async function catalogue(url, auction) {
    let page = 1;
    let total = Infinity;
    while ((page - 1) * PAGE_SIZE < total && page <= 40) {
      const data = await readJson(url + (url.includes('?') ? '&' : '?') + 'page=' + page + '&size=' + PAGE_SIZE + '&react');
      result.pages++;
      result.successful_pages++;
      const payload = data && data.data && !Array.isArray(data.data) ? data.data : { results: [], total: 0 };
      const rows = payload.results || [];
      total = Number(payload.total || 0);
      if (!rows.length) break;
      for (const row of rows) add(row, auction);
      page++;
    }
  }
  try {
    const calendar = await readJson('https://www.allsop.co.uk/api/auctions/current-and-past');
    result.pages++;
    result.successful_pages++;
    const auctions = upcomingAuctions(calendar, today);
    if (!auctions.length) result.warnings.push('Allsop published no upcoming auction.');
    for (const auction of auctions) {
      console.log('Allsop catalogue ' + (auction.reference || auction.id) + ' ' + auction.date);
      await catalogue('https://www.allsop.co.uk/api/search?auction_id=' + encodeURIComponent(auction.id) + '&available_only=true', auction);
    }
    for (const region of REGIONS) {
      for (const lotType of ['residential', 'commercial']) {
        await catalogue('https://www.allsop.co.uk/api/search?available_only=true&lot_type=' + encodeURIComponent(lotType) + '&region=' + encodeURIComponent(region), null);
      }
    }
  } catch (error) {
    result.errors.push(String(error.message || error));
  }
  const queue = result.lots.filter(lot => lot.allsop_lotid && (lot.status === 'upcoming' || lot.status === 'unsold'));
  for (const lot of queue) {
    try {
      const body = await readJson('https://www.allsop.co.uk/api/lot/' + lot.allsop_lotid + '?react');
      const data = body && body.data && !Array.isArray(body.data) ? body.data : null;
      if (!data) continue;
      const order = data.by_order_of ? 'By order of ' + (typeof data.by_order_of === 'string' ? data.by_order_of : '') : '';
      const words = [order, data.allsop_propertybyline, data.live_addendum].filter(Boolean).join(' ');
      const tag = saleTag(words || lot.page_text);
      lot.page_text = words || lot.page_text;
      lot.sale_tag = tag.tag;
      lot.sale_tag_evidence = tag.evidence;
      lot.forced_sale_evidence = tag.evidence;
      lot.forced_sale_evidence_url = tag.evidence ? lot.source_url : '';
    } catch (error) {
      result.warnings.push('Allsop detail ' + lot.allsop_lotid + ': ' + (error.message || error));
    }
  }
  const upcoming = result.lots.filter(lot => lot.status === 'upcoming' && day(lot.auction_date) >= today);
  if (upcoming.length) {
    const sample = upcoming.find(lot => lot.postcode) || upcoming[0];
    result.warnings.push('Spot-check: ' + sample.address.slice(0, 80) + ' from the public Allsop catalogue, page ' + sample.source_url);
  }
  const towns = ['Manchester', 'Bristol', 'Cheltenham', 'Glasgow', 'Edinburgh'];
  const counts = Object.fromEntries(towns.map(town => [town, 0]));
  for (const lot of upcoming) {
    const area = areaMatch(lot.address + ' ' + lot.postcode);
    if (area && Object.prototype.hasOwnProperty.call(counts, area.town)) counts[area.town]++;
  }
  result.warnings.unshift('Upcoming Allsop catalogues read from the public search. In-area upcoming lots: ' + towns.map(town => town + ' ' + counts[town]).join(', ') + '.');
  return result;
}
