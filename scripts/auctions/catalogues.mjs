/* Public catalogue readers. HTML the site serves, and the JSON those pages request. No login or captcha bypass. */
import { addressLike, areaMatch, cleanAddress, saleTag } from './core.mjs';
import { collect as renderCollect } from './render.mjs';

const STREET = /\b(?:street|road|rd|avenue|ave|lane|drive|close|crescent|terrace|way|place|court|gardens|square|mews|grove|row|quay|walk|house|flat|apartment|land|plot|cottage|bungalow)\b/i;
const MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

function empty() {
  return { lots: [], commercial_excluded: 0, errors: [], warnings: [], pages: 0, successful_pages: 0, spot: [] };
}
function decode(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/&#160;|&nbsp;|\u00a0/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#163;|&pound;/gi, '£')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/gi, '"');
}
function strip(html) {
  return decode(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function abs(href, base) {
  try {
    const url = new URL(String(href || '').replace(/&amp;/g, '&'), base);
    if (!/^https?:$/.test(url.protocol)) return '';
    url.hash = '';
    return url.href;
  } catch { return ''; }
}
function ukDate(text) {
  const match = String(text || '').match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d{2})\b/i);
  if (!match) return null;
  const month = MONTHS[match[2].slice(0, 3).toLowerCase()];
  return month ? match[3] + '-' + month + '-' + match[1].padStart(2, '0') : null;
}
function statusFrom(text) {
  const value = String(text || '');
  if (/withdrawn/i.test(value)) return 'withdrawn';
  if (/\bsold(?:\s+(?:for|prior|after|before))?\b/i.test(value)) return 'sold';
  return 'upcoming';
}
function commercialType(text) {
  const value = String(text || '');
  const commercial = /\boffice\b|\bretail\b|\bshop\b|\bwarehouse\b|\bindustrial\b|\bpub\b|\bcommercial\b|\bgarage\b/i.test(value);
  const home = /\bflat\b|\bhouse\b|\bapartment\b|\bbungalow\b|\bmaisonette\b|\bhmo\b|\bresidential\b|\bbedroom\b/i.test(value);
  return commercial && !home ? 'Commercial' : '';
}
function nearestLink(html, index, base) {
  const around = html.slice(Math.max(0, index - 900), index + 900);
  const links = [...around.matchAll(/href="([^"]+)"/gi)].map(match => abs(match[1], base)).filter(Boolean);
  return links.find(href => /\/(?:lot|property|properties|product)\b|property_details|property-details/i.test(href) && !/favicon|\/wp-json|\/oembed\//i.test(href)) || links.find(href => !/logo|facebook|linkedin|twitter|mailto:|javascript:|favicon|\/wp-json|\/oembed\//i.test(href)) || '';
}

export function cardsFromHtml(html, pageUrl) {
  const decoded = decode(html);
  const found = [];
  const seen = new Set();
  function add(address, index, extra = '') {
    const text = cleanAddress(strip(address));
    if (!text || !addressLike(text)) return;
    const area = areaMatch(text);
    const key = (area.postcode || area.town) + '|' + text.toLowerCase().slice(0, 90);
    if (seen.has(key)) return;
    if (/340 deansgate/i.test(text)) return;
    seen.add(key);
    const around = strip(decoded.slice(Math.max(0, index - 1800), index + 1800));
    const guide = around.match(/£\s*[\d,]+(?:\s*[-–]\s*£?\s*[\d,]+)?\+?/);
    const href = nearestLink(decoded, index, pageUrl);
    const type = commercialType(text + ' ' + around);
    found.push({
      title: text,
      address: text,
      postcode: area.postcode,
      town: area.town,
      guide_price_text: guide ? guide[0] : null,
      auction_date: ukDate(around),
      status: statusFrom(around),
      source_url: href && /lot|property|product|details/i.test(href) ? href : pageUrl,
      detail: href && href !== pageUrl ? href : '',
      lot_type: type,
      residential_subtype: type,
      page_text: (text + ' ' + extra).trim()
    });
  }
  const classes = /class="[^"]*(?:lot-address|list-address|property-gallery__address|c__property__address)[^"]*"[^>]*>([\s\S]*?)<\//gi;
  for (const match of decoded.matchAll(classes)) add(match[1], match.index);
  for (const match of decoded.matchAll(/href="(https?:\/\/www\.pugh-auctions\.com\/property\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) add(match[2], match.index);
  for (const match of decoded.matchAll(/href="(\/property-details\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    if (addressLike(strip(match[2]))) add(match[2], match.index);
  }
  if (!found.length) {
    const plain = strip(decoded);
    for (const match of plain.matchAll(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\s+(\d[A-Z]{2})\b/g)) {
      const start = Math.max(0, match.index - 110);
      const slice = plain.slice(start, match.index + match[0].length);
      const around = plain.slice(Math.max(0, match.index - 160), match.index + 80);
      if (!/guide|£|\blot\b|auction|bed(?:room)?|for sale/i.test(around)) continue;
      add(slice, start);
    }
  }
  return found;
}

async function read(get, result, url) {
  result.pages++;
  const html = await get(url);
  result.successful_pages++;
  return html;
}

async function enrich(get, result, lots) {
  const pending = lots.filter(lot => lot.detail && lot.detail !== lot.source_url);
  if (pending.length > 220) result.warnings.push('Opened the first 220 of ' + pending.length + ' lot pages for receiver, LPA or mortgagee wording.');
  const targets = pending.slice(0, 220);
  for (const lot of targets) {
    try {
      const html = await read(get, result, lot.detail);
      const text = strip(html).slice(0, 5000);
      if (/just a moment|g-recaptcha|verify you are human/i.test(text) && text.length < 500) {
        result.warnings.push('Detail blocked ' + lot.detail);
        continue;
      }
      const tag = saleTag(text);
      lot.page_text = text;
      lot.sale_tag = tag.tag;
      lot.sale_tag_evidence = tag.evidence;
      lot.forced_sale_evidence = tag.evidence;
      lot.forced_sale_evidence_url = tag.evidence ? lot.detail : '';
      lot.source_url = lot.detail;
      const guide = text.match(/guide price[^£]{0,30}£\s*[\d,]+|£\s*[\d,]+\s*\+/i);
      if (guide) lot.guide_price_text = guide[0].match(/£\s*[\d,]+/)[0];
      const dated = ukDate(text);
      if (dated) lot.auction_date = dated;
      if (/\bwithdrawn\b/i.test(text)) lot.status = 'withdrawn';
      else if (/\bsold(?:\s+for|\s+prior)\b/i.test(text)) lot.status = 'sold';
      const type = commercialType(text.slice(0, 500));
      if (type) { lot.lot_type = type; lot.residential_subtype = type; }
    } catch (error) {
      result.warnings.push('Detail failed ' + lot.detail + ': ' + (error.message || error));
    }
  }
}

function stampLots(lots, source, now) {
  const stamp = (now instanceof Date ? now : new Date(now || Date.now())).toISOString();
  return lots.map(lot => ({
    ...lot,
    source: source.name || source.id,
    scraped_at: stamp,
    sale_tag: lot.sale_tag || saleTag(lot.page_text).tag,
    sale_tag_evidence: lot.sale_tag_evidence || saleTag(lot.page_text).evidence || '',
    forced_sale_evidence: lot.forced_sale_evidence || saleTag(lot.page_text).evidence || '',
    forced_sale_evidence_url: lot.forced_sale_evidence_url || ''
  }));
}

async function followPages(get, result, firstUrl, nextOf) {
  const lots = [];
  let url = firstUrl;
  const seen = new Set();
  for (let page = 0; page < 20 && url && !seen.has(url); page++) {
    seen.add(url);
    let html = '';
    try { html = await read(get, result, url); }
    catch (error) { result.errors.push(String(error.message || error)); break; }
    lots.push(...cardsFromHtml(html, url));
    const next = nextOf(html, url, page);
    if (!next || next === url) break;
    url = next;
  }
  return lots;
}

async function httpText(url) {
  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LauritoAuctionsBot/1.0; +https://github.com/pgrahamLC/ecosystem-deals)', Accept: 'text/html,application/json' } });
  if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + url);
  return response.text();
}
async function barnard(get, result, source) {
  const html = await httpText(source.url);
  result.pages++;
  result.successful_pages++;
  const endpoint = html.match(/\/umbraco\/Api\/SearchApi\/Search\?auctionHouseId=\d+&(?:amp;)?auctionId=\d+/i);
  if (!endpoint) {
    result.warnings.push('Barnard Marcus page had no SearchApi endpoint.');
    return cardsFromHtml(html, source.url);
  }
  const origin = new URL(source.url).origin;
  const base = origin + endpoint[0].replace(/&amp;/g, '&');
  const lots = [];
  let pages = 1;
  for (let page = 1; page <= pages && page <= 40; page++) {
    const payload = JSON.parse(await httpText(base + '&page=' + page + '&sortBy=LotAsc'));
    result.pages++;
    result.successful_pages++;
    pages = Number(payload.pagination && payload.pagination.pageCount) || pages;
    for (const item of payload.items || []) {
      const address = [item.addressLine1, item.addressLine2].filter(Boolean).join(', ');
      const area = areaMatch(address);
      if (!area || !addressLike(address)) continue;
      const words = strip(item.description || '') + ' ' + strip(item.priceDescriptor || '') + ' ' + strip(item.statusName || '');
      const tag = saleTag(words);
      const type = commercialType(address + ' ' + words);
      lots.push({
        title: address,
        address,
        postcode: area.postcode,
        town: area.town,
        guide_price_text: item.price || null,
        auction_date: ukDate(strip(item.auctionDate || '')),
        status: /withdrawn/i.test(item.statusName || '') ? 'withdrawn' : /sold/i.test(item.statusName || '') ? 'sold' : 'upcoming',
        source_url: abs(item.url, origin) || source.url,
        detail: abs(item.url, origin),
        lot_type: type,
        residential_subtype: type,
        page_text: words,
        sale_tag: tag.tag,
        sale_tag_evidence: tag.evidence,
        forced_sale_evidence: tag.evidence,
        forced_sale_evidence_url: tag.evidence ? abs(item.url, origin) : ''
      });
    }
  }
  return lots;
}

async function countrywide(get, result) {
  const lots = [];
  for (const location of ['SK', 'SW']) {
    for (let page = 1; page <= 12; page++) {
      const url = 'https://www.countrywidepropertyauctions.co.uk/search.php?auction_date=current&auction_location=' + location + '&page=' + page;
      let html = '';
      try { html = await read(get, result, url); }
      catch (error) { result.errors.push(String(error.message || error)); break; }
      if (!/property-gallery__address/i.test(html)) break;
      lots.push(...cardsFromHtml(html, url));
    }
  }
  return lots;
}

async function braveheart(get, result) {
  const xml = await read(get, result, 'https://braveheartauctions.co.uk/product-sitemap.xml');
  const locs = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map(match => match[1].trim());
  const lots = [];
  for (const url of locs) {
    if (!/glasgow|edinburgh|manchester|bristol|cheltenham|stockport|salford|bolton|oldham|wigan|warrington/i.test(url)) continue;
    if (/port-glasgow/i.test(url)) continue;
    try {
      const html = await read(get, result, url);
      const cards = cardsFromHtml(html, url);
      if (cards.length) lots.push(...cards.map(card => ({ ...card, source_url: url, detail: url })));
      else {
        const text = strip(html);
        const area = areaMatch(text);
        const title = (text.match(/\b\d[^.]{8,80}/) || [])[0] || '';
        if (area && addressLike(title + ' ' + (area.postcode || ''))) {
          lots.push({ title, address: title, postcode: area.postcode, town: area.town, status: statusFrom(text), source_url: url, detail: url, page_text: text.slice(0, 2000), guide_price_text: (text.match(/£\s*[\d,]+/) || [])[0] || null });
        }
      }
    } catch (error) { result.warnings.push(url + ': ' + (error.message || error)); }
  }
  return lots;
}

async function clive(get, result, source) {
  const index = await read(get, result, source.url);
  const regions = [...index.matchAll(/href="(\/properties\/[a-z0-9-]+\/)"/gi)].map(match => abs(match[1], source.url));
  const lots = [];
  for (const region of [...new Set(regions)].slice(0, 14)) {
    let html = '';
    try { html = await read(get, result, region); }
    catch (error) { result.warnings.push(String(error.message || error)); continue; }
    const pairs = [...html.matchAll(/href="(\/properties\/\d+\/\d+\/)"[\s\S]{0,500}?class="LotLocation">([^<]+)/gi)];
    for (const pair of pairs) {
      const where = strip(pair[2]);
      if (!areaMatch(where) && !/bristol|cheltenham|gloucester|manchester|glasgow|edinburgh|stockport|salford|bolton|oldham|wigan|warrington/i.test(where)) continue;
      const url = abs(pair[1], region);
      try {
        const page = await read(get, result, url);
        const text = strip(page);
        const cards = cardsFromHtml(page, url);
        if (cards.length) lots.push(...cards.map(card => ({ ...card, source_url: url, detail: url, page_text: text.slice(0, 3000) })));
        else if (addressLike(text.slice(0, 240)) || areaMatch(text)) {
          const heading = (page.match(/class="LotHeading">([^<]+)/i) || [])[1] || where;
          const address = strip(heading + ', ' + where + ' ' + ((text.match(/\b(?:GL|BS|M|G|EH|SK|OL|BL|WN|WA)\d{1,2}[A-Z]?\s*\d[A-Z]{2}\b/i) || [])[0] || ''));
          if (addressLike(address)) {
            const area = areaMatch(address);
            lots.push({ title: strip(heading), address, postcode: area.postcode, town: area.town, status: statusFrom(text), guide_price_text: (text.match(/£\s*[\d,]+/) || [])[0] || null, auction_date: ukDate(text), source_url: url, detail: url, page_text: text.slice(0, 3000) });
          }
        }
      } catch (error) { result.warnings.push(url + ': ' + (error.message || error)); }
    }
  }
  return lots;
}

async function bondWolfe(get, result, source) {
  const html = await read(get, result, source.url);
  const nonce = (html.match(/ajaxnonce["']?\s*[:=]\s*["']([a-f0-9]+)/i) || [])[1];
  const ajax = abs((html.match(/ajaxurl["']?\s*[:=]\s*["']([^"']+)/i) || [])[1] || '/wp-admin/admin-ajax.php', source.url);
  if (!nonce || !ajax) return cardsFromHtml(html, source.url);
  const lots = [];
  for (let page = 1; page <= 8; page++) {
    const body = new URLSearchParams({ action: 'get_properties', page: String(page), postsperpage: '48', location: '', security: nonce, get_map: 'false', status: '' });
    const response = await fetch(ajax, { method: 'POST', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LauritoAuctionsBot/1.0; +https://github.com/pgrahamLC/ecosystem-deals)', 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    result.pages++;
    if (!response.ok) { result.errors.push('Bond Wolfe search HTTP ' + response.status); break; }
    result.successful_pages++;
    const payload = await response.json();
    const fragment = payload && payload.data && payload.data.html || '';
    if (!fragment) break;
    lots.push(...cardsFromHtml(fragment, source.url));
    if (page >= Number(payload.data.total_pages || page)) break;
  }
  return lots;
}

async function town(get, result) {
  return followPages(get, result, 'https://www.townandcountrypropertyauctions.co.uk/search?auctionOpen=true', (html, url) => {
    const current = Number((url.match(/[?&]page=(\d+)/) || [])[1] || 1);
    const higher = [...html.matchAll(/[?&]page=(\d+)/g)].map(match => Number(match[1])).filter(page => page > current).sort((a, b) => a - b)[0];
    if (!higher) return '';
    const link = html.match(new RegExp('href="([^"]*[?&]page=' + higher + '[^"]*)"', 'i'));
    return link ? abs(link[1], url) : '';
  });
}

async function pugh(get, result) {
  return followPages(get, result, 'https://www.pugh-auctions.com/property-search?page=1', (html, url, page) => {
    if (!/property-search\?page=/.test(html) && page > 0 && !html.includes('pugh-auctions.com/property/')) return '';
    const current = Number((url.match(/page=(\d+)/) || [])[1] || 1);
    return current < 15 ? 'https://www.pugh-auctions.com/property-search?page=' + (current + 1) : '';
  });
}

async function hollis(get, result, source) {
  const html = await read(get, result, source.url);
  const lots = cardsFromHtml(html, source.url);
  const search = html.match(/href="(\/search-auction\/[^"]+)"/i);
  if (search) {
    try {
      const more = await read(get, result, abs(search[1], source.url));
      lots.push(...cardsFromHtml(more, abs(search[1], source.url)));
    } catch (error) { result.warnings.push(String(error.message || error)); }
  }
  return lots;
}

async function opa(get, result) {
  return followPages(get, result, 'https://www.opagroup.co.uk/future-auctions', (html, url) => {
    const next = html.match(/href="(\/future-auctions\?[^"]*page=\d+[^"]*)"/i);
    return next ? abs(next[1], url) : '';
  });
}

async function generic(get, result, source) {
  const urls = [...new Set([source.url, ...(source.entries || [])].filter(Boolean))];
  const lots = [];
  for (const url of urls.slice(0, 6)) {
    try {
      const html = await read(get, result, url);
      lots.push(...cardsFromHtml(html, url));
    } catch (error) { result.errors.push(String(error.message || error)); }
  }
  return lots;
}

async function spot(get, result) {
  const sample = result.lots.find(lot => lot.detail || lot.source_url);
  if (!sample) return;
  const needle = (sample.postcode || sample.address || '').slice(0, 24);
  const url = sample.detail || sample.source_url;
  try {
    const text = strip(await get(url));
    const ok = needle.length > 4 && text.toLowerCase().includes(needle.toLowerCase().replace(/\s+/g, ' ').slice(0, 18));
    result.spot.push({ url, needle, ok });
    if (!ok) result.warnings.push('Spot-check did not find "' + needle + '" on ' + url);
    else result.warnings.push('Spot-check found "' + needle + '" on ' + url);
  } catch (error) { result.warnings.push('Spot-check failed: ' + (error.message || error)); }
}

export async function collect({ get, source, now }) {
  const result = empty();
  if (!source.url) {
    result.errors.push(source.reason || 'No public catalogue URL. Nothing was invented.');
    return result;
  }
  const readers = {
    barnard_marcus: () => barnard(get, result, source),
    countrywide_property_auctions: () => countrywide(get, result),
    braveheart: () => braveheart(get, result),
    clive_emson: () => clive(get, result, source),
    bond_wolfe: () => bondWolfe(get, result, source),
    town_and_country: () => town(get, result),
    pugh: () => pugh(get, result),
    hollis_morgan: () => hollis(get, result, source),
    opa: () => opa(get, result)
  };
  try {
    const lots = await (readers[source.id] || (() => generic(get, result, source)))();
    result.lots = stampLots(lots, source, now);
    await enrich(get, result, result.lots);
    await spot(get, result);
  } catch (error) {
    result.errors.push(String(error.message || error));
  }
  if (!result.lots.length) {
    const rendered = await renderCollect({ source, now });
    result.pages += rendered.pages || 0;
    result.successful_pages += rendered.successful_pages || 0;
    result.errors.push(...(rendered.errors || []));
    result.warnings.push(...(rendered.warnings || []));
    result.spot.push(...(rendered.spot || []));
    if (rendered.lots && rendered.lots.length) result.lots = rendered.lots;
    else if (result.successful_pages) result.warnings.push('Public pages were read. No in-area lot with a street address or full postcode was on them.');
  }
  return result;
}
