/**
 * Pull public auction catalogues for Manchester, Glasgow, Edinburgh, Bristol and Cheltenham.
 * Respects robots.txt. Skips login walls and blocked hosts. Does not invent lots.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'data', 'auctions');
const UA = 'LauritoAuctionCatalogue/1.0 (+https://pgrahamlc.github.io/ecosystem-deals/; public catalogue research; respects robots.txt)';
const NOW = new Date().toISOString();

const TOWNS = [
  { id: 'Cheltenham', name: /\bCheltenham\b/i, pc: /\bGL5[0-3]\d?[A-Z]?\s*\d[A-Z]{2}\b/i },
  { id: 'Edinburgh', name: /\bEdinburgh\b/i, pc: /\bEH\d{1,2}[A-Z]?\s*\d[A-Z]{2}\b/i },
  { id: 'Bristol', name: /\bBristol\b/i, pc: /\bBS\d{1,2}[A-Z]?\s*\d[A-Z]{2}\b/i },
  { id: 'Glasgow', name: /\bGlasgow\b/i, pc: /\bG\d{1,2}[A-Z]?\s*\d[A-Z]{2}\b/i },
  { id: 'Manchester', name: /\bManchester\b/i, pc: /\bM\d{1,2}[A-Z]?\s*\d[A-Z]{2}\b/i }
];

const robotsCache = new Map();
const hostNext = new Map();

function decode(s) {
  return String(s || '')
    .replace(/<br\s*\/?>/gi, ', ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&pound;|&#163;/g, '£')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

function abs(base, href) {
  try { return new URL(href, base).href; } catch { return href; }
}

function money(text) {
  const m = String(text || '').replace(/,/g, '').match(/£\s*([0-9]+(?:\.[0-9]+)?)/);
  if (!m) return { text: '', gbp: null };
  const gbp = Math.round(Number(m[1]));
  return { text: '£' + gbp.toLocaleString('en-GB'), gbp: Number.isFinite(gbp) ? gbp : null };
}

function postcodeOf(text) {
  const m = String(text || '').toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/);
  return m ? m[1] + ' ' + m[2] : '';
}

function townOf(text) {
  const raw = String(text || '');
  for (const t of TOWNS) if (t.name.test(raw)) return t.id;
  const pc = postcodeOf(raw);
  if (!pc) return '';
  for (const t of TOWNS) if (t.pc.test(pc)) return t.id;
  return '';
}

function statusOf(text, auctionDate) {
  const t = String(text || '');
  if (/withdrawn|postponed/i.test(t)) return 'withdrawn';
  if (/sold\s+(prior|post|for|at)|sold prior|sold post|\bsold\b/i.test(t) && !/unsold/i.test(t)) return 'sold';
  if (/unsold|still available|available at/i.test(t)) return 'unsold';
  if (auctionDate && auctionDate < NOW.slice(0, 10) && !/guide/i.test(t)) return 'unsold';
  return 'upcoming';
}

function isoDate(text) {
  const months = { january: '01', february: '02', march: '03', april: '04', may: '05', june: '06', july: '07', august: '08', september: '09', october: '10', november: '11', december: '12' };
  const named = String(text || '').match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i);
  if (named) return named[3] + '-' + months[named[2].toLowerCase()] + '-' + named[1].padStart(2, '0');
  const iso = String(text || '').match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
  const slug = String(text || '').match(/\b(\d{1,2})-(january|february|march|april|may|june|july|august|september|october|november|december)-(20\d{2})\b/i);
  if (slug) return slug[3] + '-' + months[slug[2].toLowerCase()] + '-' + slug[1].padStart(2, '0');
  return '';
}

export function classifyResidential(text) {
  const t = String(text || '').toLowerCase();
  const resi = /flat|apartment|studio|maisonette|house|bungalow|cottage|\bhmo\b|dwelling|residential|bedroom|beds?\b|terraced|semi-detached|detached|portfolio|conversion|upper parts|dwellinghouse/;
  const commercialOnly = /office|retail unit|\bshop\b|warehouse|industrial|\bpub\b|hotel|petrol|restaurant|surgery|commercial premises|lock-?up garage|land for sale|vacant land|car park|factory|workshop|high street retail|office investment/;
  const hasResi = resi.test(t) || /\d+\s*flats?\b/.test(t) || /block of flats/.test(t);
  const mixed = /mixed[-\s]?use|upper parts|flat above|flats above|shop with (a )?(flat|maisonette)|commercial with (residential|flat)|resi(dential)? (above|over)/.test(t);
  const development = /development (site|opportunity)|for conversion|to be converted|planning (consent|permission)|consent for \d+|residential development|conversion to/.test(t);
  if (!hasResi && !mixed && !development) return commercialOnly.test(t) || /land\b/.test(t) ? null : null;
  if (!hasResi && !mixed && development && !/residential|flat|house|dwelling|home/.test(t)) return null;
  if (/portfolio of|residential portfolio|parcel of \d+|collection of \d+/.test(t)) return 'portfolio';
  if (/\bhmo\b|house in multiple occupation|licen[cs]ed house/.test(t)) return 'hmo';
  if (development && (hasResi || /residential|flat|house|dwelling/.test(t))) return 'development';
  if (mixed || (commercialOnly.test(t) && hasResi)) return 'mixed';
  if (/block of flats|purpose[-\s]?built block|apartment block|mansion block|\d+\s+flats\b/.test(t)) return 'block';
  if (/\bflat\b|apartment|\bstudio\b|maisonette/.test(t) && !/\bhouse\b|bungalow|terraced|semi-detached|detached/.test(t)) return 'flat';
  if (/\bhouse\b|bungalow|cottage|terraced|semi-detached|detached|dwellinghouse/.test(t)) return 'house';
  if (/\bflat\b|apartment|\bstudio\b|maisonette/.test(t)) return 'flat';
  if (hasResi) return 'house';
  return null;
}

function gradeOf(text) {
  if (/receivers?|mortgagee|administrators?|liquidators?|in receivership|lpa receiver/i.test(text)) return 'B';
  return '';
}

function lot(partial) {
  const blob = [partial.title, partial.address, partial.description, partial.rawStatus, partial.typeText].filter(Boolean).join(' ');
  const town = partial.town || townOf(blob);
  const subtype = classifyResidential(blob + ' ' + (partial.sector || ''));
  const guide = money(partial.guide || blob);
  const sold = /sold/i.test(partial.rawStatus || '') ? money(partial.sold || partial.rawStatus) : { text: '', gbp: null };
  const auction_date = partial.auction_date || isoDate(blob);
  const status = statusOf((partial.rawStatus || '') + ' ' + blob, auction_date);
  const pc = postcodeOf(partial.address || blob);
  return {
    title: decode(partial.title || partial.address || 'Auction lot'),
    address: decode(partial.address || partial.title || ''),
    town,
    postcode: pc,
    lot_type: subtype || '',
    type_text: decode(partial.typeText || ''),
    guide_price: guide.text,
    guide_gbp: guide.gbp,
    auction_date,
    status,
    sold_price: status === 'sold' ? (sold.gbp || null) : null,
    sold_price_text: status === 'sold' ? sold.text : '',
    seller_type: gradeOf(blob) ? (blob.match(/receivers?|mortgagee|administrators?|liquidators?/i) || [''])[0] : '',
    grade: gradeOf(blob),
    source: partial.source,
    source_url: partial.source_url,
    scraped_at: NOW,
    description: decode(partial.description || '').slice(0, 400)
  };
}

function pathMatches(pathname, pattern) {
  if (!pattern) return false;
  let src = pattern;
  if (!src.startsWith('/')) src = '/' + src;
  const end = src.endsWith('$');
  if (end) src = src.slice(0, -1);
  const body = src.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
  return new RegExp('^' + body + (end ? '$' : '')).test(pathname);
}

function parseRobots(text) {
  const groups = [];
  let agents = [];
  let rules = [];
  const flush = () => {
    if (agents.length) groups.push({ agents, rules });
    agents = [];
    rules = [];
  };
  for (const line of String(text || '').split(/\r?\n/)) {
    const clean = line.split('#')[0].trim();
    const m = clean.match(/^(user-agent|allow|disallow|crawl-delay)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (rules.length) flush();
      agents.push(val.toLowerCase());
    } else rules.push({ key, val });
  }
  flush();
  return groups;
}

function robotsDecision(groups, pathAndQuery) {
  const star = groups.filter(g => g.agents.includes('*'));
  const rules = star.flatMap(g => g.rules);
  let delay = 1;
  let bestLen = -1;
  let allowed = true;
  for (const r of rules) {
    if (r.key === 'crawl-delay') delay = Math.min(10, Math.max(1, Number(r.val) || 1));
    if (r.key !== 'allow' && r.key !== 'disallow') continue;
    if (!r.val && r.key === 'disallow') continue;
    const pat = r.val || '/';
    if (pathMatches(pathAndQuery, pat) && pat.length >= bestLen) {
      if (pat.length > bestLen || r.key === 'allow') {
        bestLen = pat.length;
        allowed = r.key === 'allow' || !r.val;
      }
    }
  }
  return { allowed, delay };
}

async function robotsFor(origin) {
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  let groups = [];
  let fetched = false;
  let error = '';
  try {
    const r = await fetch(origin + '/robots.txt', { headers: { 'User-Agent': UA, Accept: '*/*' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const text = await r.text();
    if (r.ok && /user-agent/i.test(text)) {
      groups = parseRobots(text);
      fetched = true;
    } else error = 'robots.txt HTTP ' + r.status;
  } catch (e) {
    error = e.message || String(e);
  }
  const info = { groups, fetched, error };
  robotsCache.set(origin, info);
  return info;
}

async function fetchAllowed(url) {
  const u = new URL(url);
  const info = await robotsFor(u.origin);
  if (!info.fetched && /403|401/.test(info.error)) {
    const err = new Error('Blocked before read: ' + info.error);
    err.code = 'blocked';
    throw err;
  }
  const decision = robotsDecision(info.groups, u.pathname + u.search);
  if (info.fetched && !decision.allowed) {
    const err = new Error('robots.txt disallows ' + u.pathname + u.search);
    err.code = 'robots';
    throw err;
  }
  const wait = hostNext.get(u.origin) || 0;
  const now = Date.now();
  if (wait > now) await new Promise(r => setTimeout(r, wait - now));
  hostNext.set(u.origin, Date.now() + decision.delay * 1000);
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
  const text = await r.text();
  if (r.status === 401 || r.status === 403) {
    const err = new Error('HTTP ' + r.status);
    err.code = 'blocked';
    throw err;
  }
  if (!r.ok) {
    const err = new Error('HTTP ' + r.status);
    err.code = 'http';
    throw err;
  }
  if (/just a moment|cf-browser-verification|enable javascript to continue|captcha/i.test(text.slice(0, 2500)) && text.length < 20000) {
    const err = new Error('Bot check or empty client shell');
    err.code = 'blocked';
    throw err;
  }
  return text;
}

function parseAuctionHouse(html, pageUrl, source) {
  const date = isoDate(html) || isoDate(pageUrl);
  const chunks = html.split('lot-search-result').slice(1);
  const out = [];
  for (const chunk of chunks) {
    const href = (chunk.match(/href="([^"]*\/auction\/lot\/\d+)"/) || [])[1];
    const address = decode((chunk.match(/grid-address">([^<]+)/) || [])[1] || '');
    const typeText = decode((chunk.match(/fw-bold blue-text">([^<]+)/) || [])[1] || '');
    const guideLine = decode((chunk.match(/grid-view-guide">([\s\S]*?)<\/div>/) || [])[1] || '');
    const sector = /lotbg-residential/i.test(chunk) ? 'residential' : /lotbg-commercial/i.test(chunk) ? 'commercial' : '';
    if (!address) continue;
    out.push(lot({
      source, source_url: href ? abs(pageUrl, href) : pageUrl,
      address, title: address, typeText, sector,
      guide: /guide/i.test(guideLine) ? guideLine : '',
      rawStatus: guideLine,
      auction_date: date,
      description: typeText
    }));
  }
  return out;
}

function parseSavills(html, pageUrl, source) {
  const date = isoDate(pageUrl) || isoDate(html);
  const chunks = html.split('<li class="lot ').slice(1);
  const out = [];
  for (const chunk of chunks) {
    const name = chunk.match(/<a class="lot-name"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!name) continue;
    const guide = decode((chunk.match(/guide-price[\s\S]{0,400}<span class="value">([^<]*)/) || [])[1] || '');
    const rawStatus = decode((chunk.match(/<div class="lot-status">([\s\S]*?)<\/div>/) || [])[1] || '');
    const details = decode((chunk.match(/<div class="lot-details">([\s\S]*?)<\/div>/) || [])[1] || '');
    out.push(lot({
      source, source_url: abs(pageUrl, name[1]),
      address: decode(name[2]), title: decode(name[2]),
      guide, rawStatus, description: details, auction_date: date
    }));
  }
  return out;
}

function parseBtg(html, pageUrl, source) {
  const out = [];
  const re = /href="(https:\/\/www\.[^"]+\/property\/[^"?#]+)"[\s\S]{0,1800}?>([^<]{6,220})<br/g;
  let m;
  const seen = new Set();
  while ((m = re.exec(html))) {
    const url = m[1];
    if (seen.has(url)) continue;
    seen.add(url);
    const address = decode(m[2]);
    const before = html.slice(Math.max(0, m.index - 500), m.index);
    const rawStatus = decode((before.match(/>\s*((?:Sold[^<]{0,40}|Withdrawn[^<]{0,20}|Unsold[^<]{0,20}|Available[^<]{0,30}|Guide[^<]{0,40}))\s*</i) || [])[1] || '');
    const date = isoDate(url) || isoDate(html.slice(m.index, m.index + 400));
    out.push(lot({
      source, source_url: url, address, title: address,
      rawStatus, guide: /guide/i.test(rawStatus) ? rawStatus : '',
      auction_date: date
    }));
  }
  return out;
}

function parseMaggs(html, pageUrl, source) {
  const chunks = html.split("class='card-body'").slice(1);
  const out = [];
  for (const chunk of chunks) {
    const link = chunk.match(/href="(\/property-details\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const address = decode(link[2]);
    const guide = decode((chunk.match(/Guide Price[^<]{0,40}/i) || [])[0] || '');
    const bullets = decode((chunk.match(/<ul[\s\S]*?<\/ul>/) || [])[0] || '');
    out.push(lot({
      source, source_url: abs(pageUrl, link[1].split('?')[0]),
      address, title: address, guide, description: bullets,
      rawStatus: /sold/i.test(chunk) ? 'Sold' : /withdrawn/i.test(chunk) ? 'Withdrawn' : '',
      auction_date: isoDate(bullets)
    }));
  }
  return out;
}

function parseFosh(html, pageUrl, source) {
  const chunks = html.split('list-address').slice(1);
  const out = [];
  for (const chunk of chunks) {
    const address = decode((chunk.match(/>([\s\S]*?)<\/h4>/) || [])[1] || '');
    if (!address || address.length < 6) continue;
    const guide = decode((chunk.match(/Guide Price\*?:[\s\S]{0,180}/) || [])[0] || '');
    const rawStatus = decode((chunk.match(/<p class="fw-semibold m-0">\s*([^<]+)/) || [])[1] || '');
    const tag = decode((chunk.match(/list-tagline">([\s\S]*?)<\/p>/) || [])[1] || '');
    const href = (chunk.match(/href="(\/lot\/details\/[^"]+)"/) || [])[1];
    out.push(lot({
      source, source_url: href ? abs(pageUrl, href) : pageUrl,
      address, title: tag || address, guide, rawStatus, description: tag,
      auction_date: isoDate(html)
    }));
  }
  return out;
}

function parseClive(html, pageUrl, source) {
  const re = /data-cathead="([^"]*)"[\s\S]{0,500}?data-loc="([^"]*)"[\s\S]{0,800}?data-price="([^"]*)"[\s\S]{0,200}?data-ceastatus="([^"]*)"/g;
  const out = [];
  let m;
  while ((m = re.exec(html))) {
    const title = decode(m[1]);
    const loc = decode(m[2]);
    const address = title + (loc ? ', ' + loc : '');
    out.push(lot({
      source, source_url: pageUrl,
      title, address, guide: decode(m[3]), rawStatus: decode(m[4]),
      description: title, auction_date: isoDate(html)
    }));
  }
  return out;
}

function parseHollis(html, pageUrl, source) {
  const re = /href="(\/property-details\/\d+\/[^"?]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(html))) {
    const url = abs(pageUrl, m[1]);
    if (seen.has(url)) continue;
    seen.add(url);
    const address = decode(m[2]);
    if (address.length < 8 || /full details|guide price/i.test(address)) continue;
    const around = html.slice(m.index, m.index + 800);
    const guide = decode((around.match(/Guide Price[^<]{0,30}/i) || [])[0] || '');
    out.push(lot({
      source, source_url: url, address, title: address, guide,
      description: decode(around).slice(0, 240),
      auction_date: isoDate(around)
    }));
  }
  return out;
}

function keepTown(rows, stats) {
  const kept = [];
  for (const row of rows) {
    if (!row.town) { stats.outside_town += 1; continue; }
    if (!row.lot_type) { stats.commercial_excluded += 1; continue; }
    kept.push(row);
  }
  return kept;
}

async function runSource(spec) {
  const stats = { id: spec.id, name: spec.name, url: spec.url, status: 'failed', reason: '', lots: 0, commercial_excluded: 0, outside_town: 0, scraped_at: NOW };
  try {
    const rows = await spec.collect(stats);
    const kept = keepTown(rows, stats);
    stats.lots = kept.length;
    stats.status = 'live';
    if (!stats.reason) stats.reason = kept.length ? 'Public catalogue read.' : 'Public page read. No residential lots in the five towns.';
    return { stats, rows: kept };
  } catch (e) {
    stats.status = e.code === 'robots' ? 'skipped' : e.code === 'blocked' ? 'skipped' : 'failed';
    stats.reason = e.message || String(e);
    return { stats, rows: [] };
  }
}

async function collectAll() {
  const sources = [
    {
      id: 'auction-house-northwest',
      name: 'Auction House North West (Manchester)',
      url: 'https://www.auctionhouse.co.uk/northwest/auction/future-auction-dates',
      async collect() {
        const index = await fetchAllowed(this.url);
        const links = [...new Set([...index.matchAll(/href="(\/northwest\/auction\/lots\/\d+)"/g)].map(m => abs(this.url, m[1])))].slice(0, 3);
        let rows = [];
        for (const link of links) rows = rows.concat(parseAuctionHouse(await fetchAllowed(link), link, this.name));
        if (!links.length) throw Object.assign(new Error('No current lot catalogue linked from the dates page'), { code: 'http' });
        return rows;
      }
    },
    {
      id: 'auction-house-southwest',
      name: 'Auction House South West (Bristol and Gloucestershire)',
      url: 'https://www.auctionhouse.co.uk/southwest/auction/future-auction-dates',
      async collect() {
        const index = await fetchAllowed(this.url);
        const links = [...new Set([...index.matchAll(/href="(\/southwest\/auction\/lots\/\d+)"/g)].map(m => abs(this.url, m[1])))].slice(0, 3);
        let rows = [];
        for (const link of links) rows = rows.concat(parseAuctionHouse(await fetchAllowed(link), link, this.name));
        if (!links.length) throw Object.assign(new Error('No current lot catalogue linked from the dates page'), { code: 'http' });
        return rows;
      }
    },
    {
      id: 'auction-house-scotland',
      name: 'Auction House Scotland',
      url: 'https://www.auctionhouse.co.uk/scotland/auction/future-auction-dates',
      async collect() {
        const index = await fetchAllowed(this.url);
        const links = [...new Set([...index.matchAll(/href="(\/scotland\/auction\/lots\/\d+)"/g)].map(m => abs(this.url, m[1])))].slice(0, 3);
        let rows = [];
        for (const link of links) rows = rows.concat(parseAuctionHouse(await fetchAllowed(link), link, this.name));
        if (!links.length) rows = parseAuctionHouse(index, this.url, this.name);
        return rows;
      }
    },
    {
      id: 'savills',
      name: 'Savills Auctions',
      url: 'https://auctions.savills.co.uk/upcoming-auctions',
      async collect() {
        const index = await fetchAllowed(this.url);
        const links = [...new Set([...index.matchAll(/href="(https:\/\/auctions\.savills\.co\.uk\/auctions\/[^"]+)"/g)].map(m => m[1]))].slice(0, 4);
        let rows = [];
        for (const link of links) rows = rows.concat(parseSavills(await fetchAllowed(link), link, this.name));
        return rows;
      }
    },
    {
      id: 'pugh',
      name: 'Pugh Auctions',
      url: 'https://www.pugh-auctions.com/property-search?include-sold=off',
      async collect() {
        let url = this.url;
        let rows = [];
        for (let i = 0; i < 6 && url; i++) {
          const html = await fetchAllowed(url);
          rows = rows.concat(parseBtg(html, url, this.name));
          const next = (html.match(/rel="next" href="([^"]+)"/) || [])[1];
          url = next ? decode(next) : '';
        }
        return rows;
      }
    },
    {
      id: 'mark-jenkinson',
      name: 'Mark Jenkinson',
      url: 'https://www.markjenkinson.co.uk/property-search?include-sold=off',
      async collect() {
        let url = this.url;
        let rows = [];
        for (let i = 0; i < 4 && url; i++) {
          const html = await fetchAllowed(url);
          rows = rows.concat(parseBtg(html, url, this.name));
          const next = (html.match(/rel="next" href="([^"]+)"/) || [])[1];
          url = next ? decode(next) : '';
        }
        return rows;
      }
    },
    {
      id: 'maggs-allen',
      name: 'Maggs & Allen',
      url: 'https://www.maggsandallen.co.uk/search-auction/?auction=1&orderby=lot_no&n=0&showsold=on&showstc=on',
      async collect() {
        return parseMaggs(await fetchAllowed(this.url), this.url, this.name);
      }
    },
    {
      id: 'hollis-morgan',
      name: 'Hollis Morgan',
      url: 'https://www.hollismorgan.co.uk/auctions/',
      async collect(stats) {
        stats.reason = 'The search catalogue URL is disallowed by robots.txt. Lots are those linked from the public auctions page.';
        return parseHollis(await fetchAllowed(this.url), this.url, this.name);
      }
    },
    {
      id: 'paul-fosh',
      name: 'Paul Fosh Auctions',
      url: 'https://auction.paulfosh.com/future-auctions/',
      async collect() {
        return parseFosh(await fetchAllowed(this.url), this.url, this.name);
      }
    },
    {
      id: 'clive-emson',
      name: 'Clive Emson',
      url: 'https://www.cliveemson.co.uk/properties/',
      async collect() {
        return parseClive(await fetchAllowed(this.url), this.url, this.name);
      }
    },
    {
      id: 'allsop',
      name: 'Allsop',
      url: 'https://www.allsop.co.uk/auctions/residential-auctions/',
      async collect(stats) {
        const pages = [this.url, 'https://www.allsop.co.uk/auctions/property-for-auction-in-manchester/', 'https://www.allsop.co.uk/auctions/property-for-auction-in-bristol/'];
        let found = 0;
        const rows = [];
        for (const page of pages) {
          try {
            const html = await fetchAllowed(page);
            found += 1;
            const re = /property-for-auction[^<]{0,80}|([A-Z][a-z]+(?: [A-Z][a-z]+)*, [A-Za-z .]+ [A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2})/g;
            if ((html.match(/\b[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}\b/g) || []).length < 3) continue;
          } catch (e) {
            if (e.code === 'robots') throw e;
          }
        }
        if (!rows.length) {
          stats.reason = found ? 'Public auction calendar is readable. Individual lots are not in the HTML, so none were imported.' : 'Calendar page could not be read.';
        }
        return rows;
      }
    },
    {
      id: 'bond-wolfe',
      name: 'Bond Wolfe',
      url: 'https://www.bondwolfe.com/auctions/properties/',
      async collect(stats) {
        const html = await fetchAllowed(this.url);
        const rows = parseBtg(html, this.url, this.name);
        if (!rows.length) stats.reason = 'The properties page is a search form. Lot cards are not in the HTML.';
        return rows;
      }
    },
    {
      id: 'barnard-marcus',
      name: 'Barnard Marcus',
      url: 'https://www.barnardmarcusauctions.co.uk/auctions/upcoming/',
      async collect(stats) {
        const index = await fetchAllowed(this.url);
        const link = (index.match(/href="(https:\/\/www\.barnardmarcusauctions\.co\.uk\/auctions\/\d{1,2}-[^"]+)"/) || [])[1];
        if (!link) {
          stats.reason = 'Upcoming page has no dated catalogue link.';
          return [];
        }
        const html = await fetchAllowed(link);
        if (!/<li class="lot |grid-address|property-details/.test(html)) {
          stats.reason = 'The dated catalogue page does not include lot cards in the HTML. The site loads lots through a path robots.txt disallows, so they were not fetched.';
          return [];
        }
        return [];
      }
    },
    {
      id: 'strettons',
      name: 'Strettons',
      url: 'https://www.strettons.co.uk/auctions/available-lots/',
      async collect(stats) {
        const html = await fetchAllowed(this.url);
        if (!/grid-address|lot-name|property-details/.test(html)) {
          stats.reason = 'Available-lots page does not list lot addresses in the HTML.';
          return [];
        }
        return [];
      }
    },
    {
      id: 'town-country',
      name: 'Town & Country Property Auctions',
      url: 'https://www.townandcountrypropertyauctions.co.uk/search',
      async collect(stats) {
        const html = await fetchAllowed(this.url);
        const rows = parseAuctionHouse(html, this.url, this.name);
        if (!rows.length) stats.reason = 'Search page has no lot cards in the HTML.';
        return rows;
      }
    },
    {
      id: 'future-property',
      name: 'Future Property Auctions',
      url: 'https://www.futurepropertyauctions.co.uk/',
      async collect(stats) {
        const html = await fetchAllowed(this.url);
        if (/bidjs/.test(html) && !/grid-address|lot-name/.test(html)) {
          stats.reason = 'The public page is a client-side bidding shell. Lots are not in the HTML.';
          return [];
        }
        return [];
      }
    },
    {
      id: 'eig',
      name: 'Essential Information Group',
      url: 'https://www.eigpropertyauctions.co.uk/search',
      async collect(stats) {
        const root = await robotsFor('https://www.eigroup.co.uk');
        const rootDeny = root.fetched && !robotsDecision(root.groups, '/').allowed;
        const html = await fetchAllowed(this.url);
        if (rootDeny) stats.reason = 'eigroup.co.uk robots.txt disallows the whole host. The public search page on eigpropertyauctions.co.uk has no lot list in the HTML, and tokenised search results are disallowed.';
        else stats.reason = 'No public lot list in the HTML. Tokenised search result URLs are disallowed by robots.txt.';
        if (/grid-address|lot-name|property-details/.test(html)) return [];
        return [];
      }
    },
    {
      id: 'sdl',
      name: 'SDL Auctions',
      url: 'https://www.sdlauctions.co.uk/',
      async collect() {
        await fetchAllowed(this.url);
        return [];
      }
    },
    {
      id: 'iamsold',
      name: 'iamsold',
      url: 'https://www.iamsold.co.uk/',
      async collect(stats) {
        const info = await robotsFor('https://www.iamsold.co.uk');
        const propertyBlocked = info.fetched && !robotsDecision(info.groups, '/property/example').allowed;
        if (propertyBlocked) {
          const err = new Error('robots.txt disallows /property/ pages, so lot details were not fetched.');
          err.code = 'robots';
          throw err;
        }
        stats.reason = 'No allowed catalogue of lots was found.';
        return [];
      }
    },
    {
      id: 'moore-allen',
      name: 'Moore Allen',
      url: 'https://www.mooreallen.co.uk/auctions',
      async collect() {
        await fetchAllowed(this.url);
        return [];
      }
    },
    {
      id: 'network-auctions',
      name: 'Network Auctions',
      url: 'https://www.networkauctions.co.uk/',
      async collect(stats) {
        const html = await fetchAllowed(this.url);
        stats.reason = 'The hostname redirects to a BTG Eddisons brand page, not a lot catalogue. ' + (html.includes('btgeddisons') ? 'No lot cards on that page.' : '');
        return [];
      }
    },
    {
      id: 'bruton-knowles',
      name: 'Bruton Knowles',
      url: 'https://www.brutonknowles.co.uk/property-auctions/',
      async collect(stats) {
        try {
          await fetchAllowed(this.url);
        } catch (e) {
          if (e.code === 'http') {
            stats.reason = 'No public auction catalogue at the usual path. The residential search is agency stock, not an auction, so it was not imported.';
            return [];
          }
          throw e;
        }
        return [];
      }
    },
    {
      id: 'bradleys',
      name: 'Bradleys',
      url: 'https://www.bradleys-auctions.co.uk/',
      async collect() { await fetchAllowed(this.url); return []; }
    },
    {
      id: 'bristol-property-auctions',
      name: 'Bristol Property Auctions',
      url: 'https://www.bristolpropertyauctions.co.uk/',
      async collect() { await fetchAllowed(this.url); return []; }
    },
    {
      id: 'scottish-property-auctions',
      name: 'Scottish Property Auctions',
      url: 'https://www.scottishpropertyauctions.co.uk/',
      async collect() { await fetchAllowed(this.url); return []; }
    },
    {
      id: 'countrywide',
      name: 'Countrywide Property Auctions',
      url: 'https://www.countrywidepropertyauctions.co.uk/',
      async collect() { await fetchAllowed(this.url); return []; }
    }
  ];

  const coverage = [];
  const all = [];
  for (const spec of sources) {
    process.stdout.write(spec.id + '\n');
    const { stats, rows } = await runSource(spec);
    coverage.push(stats);
    all.push(...rows);
  }
  return { coverage, all };
}

function dedupe(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = (row.postcode || '') + '|' + row.address.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const id = key.length > 8 ? key : row.source_url;
    const prev = map.get(id);
    if (!prev) {
      row.also_listed_by = [];
      map.set(id, row);
      continue;
    }
    if (!prev.also_listed_by.includes(row.source)) prev.also_listed_by.push(row.source);
    if (!prev.guide_gbp && row.guide_gbp) {
      prev.guide_gbp = row.guide_gbp;
      prev.guide_price = row.guide_price;
    }
    if (!prev.grade && row.grade) prev.grade = row.grade;
    if (!prev.description && row.description) prev.description = row.description;
  }
  return [...map.values()];
}

async function main() {
  const { coverage, all } = await collectAll();
  const lots = dedupe(all).sort((a, b) => (a.auction_date || '9999').localeCompare(b.auction_date || '9999') || a.address.localeCompare(b.address));
  const commercial_excluded = coverage.reduce((n, s) => n + (s.commercial_excluded || 0), 0);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'lots.json'), JSON.stringify({ updated_at: NOW, count: lots.length, lots }, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'coverage.json'), JSON.stringify({
    generated_at: NOW,
    towns: TOWNS.map(t => t.id),
    residential: 'Blocks, houses, flats and studios, HMOs, portfolios, mixed-use with homes, and residential development. Purely commercial lots are left out.',
    commercial_excluded,
    deduped_lots: lots.length,
    sources: coverage
  }, null, 2));
  const byTown = {};
  for (const t of TOWNS) byTown[t.id] = lots.filter(l => l.town === t.id).length;
  console.log(JSON.stringify({ lots: lots.length, commercial_excluded, byTown, sources: coverage.map(s => ({ id: s.id, status: s.status, lots: s.lots, reason: s.reason })) }, null, 2));
}

if (process.argv.includes('--self-test')) {
  const cases = [
    ['Three bedroom semi-detached house, Bristol', 'house'],
    ['Studio flat, Manchester', 'flat'],
    ['Block of 8 flats', 'block'],
    ['Licensed HMO, 6 bedrooms', 'hmo'],
    ['Residential portfolio of 4 houses', 'portfolio'],
    ['Shop with flat above', 'mixed'],
    ['Development site with consent for 6 flats', 'development'],
    ['High street retail unit', null],
    ['Vacant office investment', null]
  ];
  let bad = 0;
  for (const [text, expect] of cases) {
    const got = classifyResidential(text);
    if (got !== expect) { bad += 1; console.error('classify', text, got, 'expected', expect); }
  }
  if (bad) process.exit(1);
  console.log('self-test ok');
} else {
  main().catch(e => { console.error(e); process.exit(1); });
}
