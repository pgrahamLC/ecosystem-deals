/* Public catalogue reader. Same-origin HTML, sitemap and PDF text. No login, no captcha bypass. */
import { saleTag } from './core.mjs';

const AREA = /\b((?:M|G|EH|BS)\d{1,2}[A-Z]?|GL5[0-4])\s*(\d[A-Z]{2})\b/i;
const LOT_HREF = /\/(?:property|properties|lot|auction|catalogue|catalog|results|listing)\//i;

function strip(html) {
  return String(html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/&#163;|&pound;/gi, '£').replace(/\s+/g, ' ').trim();
}
function abs(href, base) {
  try { const u = new URL(href, base); if (!/^https?:$/.test(u.protocol)) return ''; u.hash = ''; return u.href; } catch { return ''; }
}
function sameOrigin(href, base) {
  try { return new URL(href).origin === new URL(base).origin; } catch { return false; }
}
export async function collect({ get, source, now }) {
  const result = { lots: [], commercial_excluded: 0, errors: [], warnings: [], pages: 0, successful_pages: 0 };
  const stamp = (now instanceof Date ? now : new Date(now || Date.now())).toISOString();
  if (!source.url) {
    result.errors.push(source.reason || 'No public catalogue URL. Nothing was invented.');
    return result;
  }
  const maxPages = Math.max(1, Number(source.max_pages ?? 8));
  const maxDetails = Math.max(0, Number(source.max_details ?? 40));
  const origin = new URL(source.url).origin;
  const queue = [...new Set([...(source.entries || []), source.url].filter(Boolean))];
  queue.push(origin + '/sitemap.xml');
  const seen = new Set();
  const candidates = new Map();
  let details = 0;

  function consider(pageUrl, html) {
    const text = strip(html);
    const links = [...String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
    for (const link of links) {
      const href = abs(link[1], pageUrl);
      if (!href || !sameOrigin(href, origin) || !LOT_HREF.test(href + ' ' + strip(link[2]))) continue;
      if (!candidates.has(href)) candidates.set(href, { url: href, blurb: strip(link[2]).slice(0, 240) });
    }
    for (const match of text.matchAll(new RegExp('.{0,90}' + AREA.source + '.{0,40}', 'gi'))) {
      const window = match[0];
      const pc = (match[1] + ' ' + match[2]).toUpperCase();
      const guide = window.match(/£\s*[\d,]+/);
      const href = [...candidates.values()].find(c => window.toLowerCase().includes(strip(c.blurb).slice(0, 24).toLowerCase()) && strip(c.blurb).length > 8);
      const key = (href && href.url) || (pageUrl + '#' + pc);
      const row = candidates.get(key) || { url: pageUrl, blurb: '' };
      row.postcode = pc;
      row.address = window.replace(/£\s*[\d,]+|learn more|call now|under offer|to let|for sale|code\s+\d+/ig, ' ').replace(/\s+/g, ' ').trim();
      row.guide_price_text = guide ? guide[0] : null;
      row.page_text = window;
      candidates.set(key, row);
    }
  }

  while (queue.length && result.pages < maxPages) {
    const url = queue.shift();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.pages++;
    try {
      const html = await get(url);
      if (!html || /<title>\s*(?:Just a moment|Access denied)|cf-chl-|g-recaptcha|captcha/i.test(html)) {
        result.errors.push('Login or captcha at ' + url);
        continue;
      }
      result.successful_pages++;
      if (/<urlset|<sitemapindex/i.test(html)) {
        for (const loc of html.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)) {
          const next = abs(loc[1], url);
          if (next && sameOrigin(next, origin) && !seen.has(next) && queue.length < maxPages * 4) queue.push(next);
        }
        continue;
      }
      consider(url, html);
      for (const href of [...String(html).matchAll(/href=["']([^"']+)["']/gi)].map(m => abs(m[1], url))) {
        if (!href || !sameOrigin(href, origin) || seen.has(href) || queue.length >= maxPages) continue;
        if (LOT_HREF.test(href) && !/\.(?:css|js|png|jpe?g|svg|gif|webp|ico|woff2?)(?:$|\?)/i.test(href) && queue.length < maxPages * 3) queue.unshift(href);
      }
    } catch (error) {
      const message = String(error.message || error);
      result.errors.push(/CHALLENGE|LOGIN|captcha/i.test(message) ? 'Login or captcha at ' + url + ': ' + message : 'Page failed ' + url + ': ' + message);
    }
  }

  const inArea = [...candidates.values()].filter(c => c.postcode && AREA.test(c.postcode));
  for (const candidate of inArea) {
    if (details >= maxDetails) { result.warnings.push('Detail cap reached; further in-area lots on later pages were not opened.'); break; }
    if (candidate.url && candidate.url !== source.url && !/#/.test(candidate.url)) {
      details++;
      try {
        const html = await get(candidate.url);
        if (html && !/cf-chl-|g-recaptcha/i.test(html)) {
          candidate.page_text = strip(html).slice(0, 4000);
          result.successful_pages++;
        }
      } catch (error) {
        result.warnings.push('Detail failed ' + candidate.url + ': ' + (error.message || error));
      }
    }
    const tag = saleTag(candidate.page_text || '');
    const typeText = (candidate.blurb || '') + ' ' + (candidate.address || '');
    const commercial = /\boffice\b|\bretail\b|\bshop\b|\bwarehouse\b|\bindustrial\b|\bpub\b|commercial/i.test(typeText) && !/\bflat\b|\bhouse\b|\bapartment\b|\bhmo\b|residential/i.test(typeText);
    const status = /\bsold\s+for\b|\bsold prior\b/i.test(candidate.page_text || '') ? 'sold' : 'upcoming';
    result.lots.push({
      title: candidate.address,
      address: candidate.address,
      postcode: candidate.postcode,
      lot_type: commercial ? 'Commercial' : (candidate.blurb || ''),
      residential_subtype: commercial ? 'Commercial' : '',
      guide_price_text: candidate.guide_price_text,
      status,
      source_url: candidate.url || source.url,
      source: source.name || source.id,
      scraped_at: stamp,
      page_text: candidate.page_text || '',
      sale_tag: tag.tag,
      sale_tag_evidence: tag.evidence,
      forced_sale_evidence: tag.evidence,
      forced_sale_evidence_url: tag.evidence ? (candidate.url || source.url) : ''
    });
  }
  if (!result.lots.length && result.successful_pages) result.warnings.push('Catalogue pages were read. No in-area lot with a full postcode was printed on those pages.');
  return result;
}
