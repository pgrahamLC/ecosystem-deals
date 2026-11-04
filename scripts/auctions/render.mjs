/* Rendered catalogue reader. Uses the site's own HTML after JavaScript runs, plus JSON responses the page requests. No login bypass. */
import { chromium } from 'playwright';
import { addressLike, areaMatch, saleTag } from './core.mjs';

const PLACES = ['Manchester', 'Glasgow', 'Edinburgh', 'Bristol', 'Cheltenham', 'Gloucester'];
let browserPromise;

async function browser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      ...(process.env.CI ? {} : { channel: 'chrome' })
    });
  }
  return browserPromise;
}
export async function closeBrowser() {
  if (!browserPromise) return;
  const current = await browserPromise;
  browserPromise = null;
  await current.close();
}

function strip(html) {
  return String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#163;|&pound;/gi, '£').replace(/\s+/g, ' ').trim();
}

function windows(text) {
  const found = [];
  const hint = /.{0,110}(?:\b(?:greater manchester|stockport|salford|bolton|oldham|wigan|warrington|manchester|glasgow|edinburgh|bristol|cheltenham|gloucestershire|gloucester)\b|\b(?:GL|EH|BS|WA|WN|SK|OL|BL|M|G)\d{1,2}[A-Z]?\s*\d[A-Z]{2})/gi;
  for (const match of String(text).matchAll(hint)) {
    const slice = match[0].replace(/\s+/g, ' ').trim();
    if (!addressLike(slice)) continue;
    const area = areaMatch(slice);
    found.push({ text: slice, postcode: area.postcode, town: area.town });
  }
  return found;
}
function jsonLots(body) {
  let data;
  try { data = JSON.parse(body); } catch { return []; }
  const found = [];
  const walk = (node, depth) => {
    if (!node || depth > 6) return;
    if (Array.isArray(node)) { for (const item of node.slice(0, 400)) walk(item, depth + 1); return; }
    if (typeof node !== 'object') return;
    const address = [node.full_address, node.address, node.displayAddress, node.addressLine1 && node.addressLine2 ? node.addressLine1 + ', ' + node.addressLine2 : node.addressLine1].find(value => typeof value === 'string' && addressLike(value));
    if (address) {
      const area = areaMatch(address);
      const words = [node.description, node.property_byline, node.by_order_of && 'By order of ' + node.by_order_of].filter(value => typeof value === 'string').join(' ');
      found.push({ text: address, postcode: area.postcode, town: area.town, words, url: node.url || node.source_url || '' });
    }
    for (const value of Object.values(node)) if (value && typeof value === 'object') walk(value, depth + 1);
  };
  walk(data, 0);
  return found;
}

export async function collect({ source, now }) {
  const result = { lots: [], commercial_excluded: 0, errors: [], warnings: [], pages: 0, successful_pages: 0, spot: [] };
  const stamp = (now instanceof Date ? now : new Date(now || Date.now())).toISOString();
  if (!source.url) {
    result.errors.push(source.reason || 'No public catalogue URL. Nothing was invented.');
    return result;
  }
  const maxPages = Math.max(1, Number(source.max_pages ?? 4));
  const maxDetails = Math.max(0, Number(source.max_details ?? 20));
  const b = await browser();
  const page = await b.newPage({ userAgent: 'Mozilla/5.0 (compatible; LauritoAuctionsBot/1.0; +https://github.com/pgrahamLC/ecosystem-deals)' });
  const payloads = [];
  page.on('response', async (response) => {
    try {
      const type = response.headers()['content-type'] || '';
      if (!/json/i.test(type) || /javascript/i.test(type)) return;
      const url = response.url();
      if (/analytics|google|facebook|hotjar|segment|doubleclick|moment/i.test(url)) return;
      const body = await response.text();
      if (body && body.length < 1500000) payloads.push(body);
    } catch { /* a closed response is not a lot */ }
  });
  const seenUrls = new Set();
  const lots = new Map();

  function remember(hit, pageUrl) {
    if (!hit || !addressLike(hit.text)) return;
    const key = (hit.postcode || hit.town) + '|' + hit.text.slice(0, 80).toLowerCase();
    if (lots.has(key)) return;
    const guide = hit.text.match(/£\s*[\d,]+/);
    const tag = saleTag(hit.words || hit.text);
    lots.set(key, {
      title: hit.text,
      address: hit.text,
      postcode: hit.postcode,
      town: hit.town,
      guide_price_text: guide ? guide[0] : null,
      status: /\bsold\s+for\b|\bsold prior\b/i.test(hit.text + (hit.words || '')) ? 'sold' : 'upcoming',
      source_url: hit.url || pageUrl,
      detail: hit.url || '',
      source: source.name || source.id,
      scraped_at: stamp,
      page_text: hit.words || hit.text,
      sale_tag: tag.tag,
      sale_tag_evidence: tag.evidence,
      forced_sale_evidence: tag.evidence,
      forced_sale_evidence_url: tag.evidence ? (hit.url || pageUrl) : ''
    });
  }
  function absorb(text, pageUrl) {
    for (const hit of windows(text)) remember(hit, pageUrl);
  }

  async function readCurrent(label) {
    result.pages++;
    const html = await page.content();
    const body = await page.locator('body').innerText().catch(() => '');
    if (/just a moment|cf-turnstile|g-recaptcha|verify you are human/i.test(html) && !areaMatch(body)) {
      result.errors.push('Login or captcha at ' + page.url() + ' (' + label + ')');
      return;
    }
    result.successful_pages++;
    absorb(body, page.url());
    for (const blob of payloads) for (const hit of jsonLots(blob)) remember(hit, page.url());
    const links = await page.locator('a[href]').evaluateAll(nodes => nodes.slice(0, 400).map(node => ({ href: node.href, text: (node.innerText || '').slice(0, 240) }))).catch(() => []);
    for (const link of links) {
      if (!link.href || seenUrls.has(link.href)) continue;
      if (areaMatch(link.text + ' ' + link.href)) {
        seenUrls.add(link.href);
        absorb(link.text, link.href);
        const row = [...lots.values()].find(item => item.source_url === link.href);
        if (row) row.detail = link.href;
      }
    }
  }

  async function paginate() {
    for (let i = 0; i < maxPages; i++) {
      await readCurrent('page ' + (i + 1));
      const next = page.locator('a[rel="next"], a:has-text("Next"), button:has-text("Next"), a:has-text(">")').first();
      if (!(await next.count())) break;
      const before = page.url();
      await next.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(900);
      if (page.url() === before && i > 0) break;
    }
  }

  try {
    await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(1200);
    await paginate();
    const box = page.locator('input[type="search"], input[placeholder*="location" i], input[placeholder*="postcode" i], input[placeholder*="search" i], input[name*="search" i], input[name*="location" i]').first();
    if (await box.count()) {
      for (const place of PLACES) {
        await box.fill(place).catch(() => {});
        await box.press('Enter').catch(() => {});
        await page.waitForTimeout(900);
        await readCurrent('search ' + place);
      }
    }
    const details = [...lots.values()].map(item => item.detail).filter(Boolean).slice(0, maxDetails);
    for (const url of details) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForTimeout(600);
        const text = await page.locator('body').innerText().catch(() => '');
        if (/just a moment|g-recaptcha|verify you are human/i.test(text) && text.length < 400) {
          result.warnings.push('Detail blocked ' + url);
          continue;
        }
        result.successful_pages++;
        const tag = saleTag(text);
        const hit = lots.get([...lots.keys()].find(key => lots.get(key).detail === url));
        if (!hit) continue;
        hit.page_text = text.slice(0, 4000);
        hit.sale_tag = tag.tag;
        hit.sale_tag_evidence = tag.evidence;
        hit.forced_sale_evidence = tag.evidence;
        hit.forced_sale_evidence_url = tag.evidence ? url : '';
        const guide = text.match(/guide price[^£]{0,20}£\s*[\d,]+|£\s*[\d,]+\s*(?:guide)?/i);
        if (guide) hit.guide_price_text = guide[0].match(/£\s*[\d,]+/)[0];
        const dated = text.match(/\b(\d{1,2})[\/\s-](\d{1,2})[\/\s-](20\d{2})\b/);
        if (dated) hit.auction_date = dated[3] + '-' + dated[2].padStart(2, '0') + '-' + dated[1].padStart(2, '0');
        if (/\bsold\s+for\b/i.test(text)) hit.status = 'sold';
      } catch (error) {
        result.warnings.push('Detail failed ' + url + ': ' + (error.message || error));
      }
    }
    const sample = [...lots.values()].find(item => item.detail || item.source_url);
    if (sample) {
      const needle = (sample.address || '').replace(/£[\d,]+/g, '').trim().slice(0, 28);
      try {
        await page.goto(sample.detail || sample.source_url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        const text = await page.locator('body').innerText().catch(() => '');
        const ok = needle.length > 8 && text.toLowerCase().includes(needle.toLowerCase().slice(0, 18));
        result.spot.push({ url: page.url(), needle, ok });
        if (!ok) result.warnings.push('Spot-check did not find "' + needle.slice(0, 40) + '" on ' + page.url());
      } catch (error) {
        result.warnings.push('Spot-check failed: ' + (error.message || error));
      }
    }
  } catch (error) {
    result.errors.push(String(error.message || error));
  } finally {
    await page.close().catch(() => {});
  }
  result.lots = [...lots.values()].map(item => {
    const commercial = /\boffice\b|\bretail\b|\bshop\b|\bwarehouse\b|\bindustrial\b|\bpub\b|\bcommercial\b/i.test(item.address) && !/\bflat\b|\bhouse\b|\bapartment\b|\bhmo\b|\bresidential\b/i.test(item.address);
    return { ...item, lot_type: commercial ? 'Commercial' : '', residential_subtype: commercial ? 'Commercial' : '' };
  });
  if (!result.lots.length && result.successful_pages) result.warnings.push('Rendered pages were read. No Manchester, Glasgow, Edinburgh, Bristol or Cheltenham/Gloucestershire lot was found in the visible text or the JSON those pages requested.');
  return result;
}
