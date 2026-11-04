/* Savills live catalogues. The upcoming calendar lists each auction; each catalogue is paged at /page-N/quantity-50 and can be filtered with /query- as the page does. */
import { addressLike, areaMatch, saleTag } from './core.mjs';

const UA = 'Mozilla/5.0 (compatible; LauritoAuctionsBot/1.0; +https://github.com/pgrahamLC/ecosystem-deals)';
const QUERIES = ['Manchester', 'Glasgow', 'Edinburgh', 'Bristol', 'Cheltenham', 'Gloucester', 'Stockport', 'Salford', 'Bolton', 'Oldham', 'Wigan', 'Warrington', 'M1', 'G1', 'EH1', 'BS1', 'GL50', 'SK1', 'OL1', 'BL1', 'WN1', 'WA1'];
const MONTHS = { january: '01', february: '02', march: '03', april: '04', may: '05', june: '06', july: '07', august: '08', september: '09', october: '10', november: '11', december: '12' };

async function text(url) {
  const response = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + url);
  return response.text();
}
function decode(value) {
  return String(value || '').replace(/&#160;|&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#163;|&pound;/gi, '£').replace(/&quot;/gi, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
function strip(html) {
  return decode(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function auctionDate(url) {
  const match = String(url).match(/\/(\d{1,2})-([a-z]+)-(\d{4})-\d+/i);
  if (!match) return null;
  const month = MONTHS[match[2].toLowerCase()];
  return month ? match[3] + '-' + month + '-' + match[1].padStart(2, '0') : null;
}
function catalogueLots(html, pageUrl, auction) {
  const lots = [];
  const pattern = /<a class="lot-name" href="([^"]+)" title="([^"]+)"[\s\S]{0,1200}?<div class="lot-details">([\s\S]*?)<\/div>/gi;
  for (const match of html.matchAll(pattern)) {
    const before = html.slice(Math.max(0, match.index - 700), match.index);
    const guide = (before.match(/<span class="value">\s*(£[\d,]+)\s*<\/span>\s*$/i) || [])[1] || null;
    const address = decode(match[2]).replace(/\s+/g, ' ').trim();
    const details = strip(match[3]);
    lots.push({
      address,
      title: address,
      guide_price_text: guide,
      page_text: details,
      source_url: decode(match[1]).replace(/^http:\/\//, 'https://'),
      auction_date: auction,
      catalogue: pageUrl
    });
  }
  return lots;
}

export async function collect({ source, now, fetchImpl } = {}) {
  const get = fetchImpl ? async url => {
    const response = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
    if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + url);
    return response.text();
  } : text;
  const result = { lots: [], commercial_excluded: 0, errors: [], warnings: [], pages: 0, successful_pages: 0, spot: [] };
  const stamp = (now instanceof Date ? now : new Date(now || Date.now())).toISOString();
  const seen = new Map();
  try {
    const calendars = ['https://auctions.savills.co.uk/upcoming-auctions', 'https://auctions.savills.co.uk/upcoming-auctions/upcoming/page-2'];
    const auctions = new Set();
    for (const url of calendars) {
      const html = await get(url);
      result.pages++;
      result.successful_pages++;
      for (const href of html.matchAll(/https?:\/\/auctions\.savills\.co\.uk\/auctions\/\d{1,2}-[a-z]+-\d{4}-\d+/gi)) auctions.add(href[0].replace(/^http:\/\//, 'https://'));
    }
    if (!auctions.size) result.warnings.push('The upcoming calendar listed no catalogue link.');
    for (const auction of auctions) {
      const dated = auctionDate(auction);
      for (let page = 1; page <= 15; page++) {
        const url = auction + '/page-' + page + '/quantity-50';
        const html = await get(url);
        result.pages++;
        result.successful_pages++;
        const rows = catalogueLots(html, url, dated);
        for (const row of rows) if (!seen.has(row.source_url)) seen.set(row.source_url, row);
        if (rows.length < 50) break;
      }
      for (const query of QUERIES) {
        const url = auction + '/page-1/quantity-50/query-' + encodeURIComponent(query);
        try {
          const html = await get(url);
          result.pages++;
          result.successful_pages++;
          for (const row of catalogueLots(html, url, dated)) if (!seen.has(row.source_url)) seen.set(row.source_url, row);
        } catch (error) {
          result.warnings.push('Location search ' + query + ' failed: ' + (error.message || error));
        }
      }
    }
    const kept = [];
    for (const row of seen.values()) {
      const area = areaMatch(row.address + ' ' + row.page_text);
      if (!area || !addressLike(row.address)) continue;
      kept.push({ ...row, postcode: area.postcode, town: area.town });
    }
    for (const lot of kept) {
      try {
        const html = await get(lot.source_url);
        result.pages++;
        result.successful_pages++;
        const words = strip(html).slice(0, 5000);
        const tag = saleTag(words);
        lot.page_text = words;
        lot.sale_tag = tag.tag;
        lot.sale_tag_evidence = tag.evidence;
        lot.forced_sale_evidence = tag.evidence;
        lot.forced_sale_evidence_url = tag.evidence ? lot.source_url : '';
        if (/\bwithdrawn\b/i.test(words)) lot.status = 'withdrawn';
        else if (/\bsold(?:\s+for|\s+prior)\b/i.test(words)) lot.status = 'sold';
      } catch (error) {
        result.warnings.push('Lot page failed ' + lot.source_url + ': ' + (error.message || error));
      }
    }
    const samples = [...seen.values()].slice(0, 3);
    for (const sample of samples) {
      try {
        const html = await get(sample.source_url);
        const page = strip(html);
        const needle = sample.address.slice(0, 28);
        const ok = page.toLowerCase().includes(needle.toLowerCase());
        result.spot.push({ url: sample.source_url, needle, ok });
        result.warnings.push((ok ? 'Spot-check found "' : 'Spot-check did not find "') + needle + '" on ' + sample.source_url);
      } catch (error) {
        result.warnings.push('Spot-check failed ' + sample.source_url + ': ' + (error.message || error));
      }
    }
    result.lots = kept.map(lot => ({
      ...lot,
      status: lot.status || 'upcoming',
      source: source?.name || 'Savills auctions',
      scraped_at: stamp,
      sale_tag: lot.sale_tag || 'Auction',
      sale_tag_evidence: lot.sale_tag_evidence || '',
      forced_sale_evidence: lot.forced_sale_evidence || '',
      forced_sale_evidence_url: lot.forced_sale_evidence_url || ''
    }));
    result.warnings.unshift('Read ' + seen.size + ' lots from ' + auctions.size + ' upcoming Savills catalogues and each catalogue location search. ' + kept.length + ' were in Manchester, Glasgow, Edinburgh, Bristol or Cheltenham. 26 January 2027 is on the calendar with no catalogue link.');
  } catch (error) {
    result.errors.push(String(error.message || error));
  }
  return result;
}
