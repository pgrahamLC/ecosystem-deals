// Built-in-only policy client and conservative auction data normalization.
const DAY = 86400000;
const dateISO = v => { const d = new Date(v); return Number.isFinite(+d) ? d.toISOString() : null; };
const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const httpURL = v => { try { const u = new URL(v); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; } };
const fail = (code, message) => Object.assign(new Error(message), { code });
function robotsPolicy(text, agent) {
  const groups = []; let group = null, rulesStarted = false;
  for (const line of text.replace(/^\uFEFF/, '').split(/[\r\n]+/)) {
    const m = line.replace(/#.*/, '').match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/); if (!m) continue;
    const key = m[1].toLowerCase(), value = m[2];
    if (key === 'user-agent') {
      if (!group || rulesStarted) { group = { agents: [], rules: [], delay: 0 }; groups.push(group); rulesStarted = false; }
      group.agents.push(value.toLowerCase());
    } else if (group) {
      rulesStarted = true;
      if ((key === 'allow' || key === 'disallow') && value) {
        const end = value.endsWith('$'); const raw = end ? value.slice(0, -1) : value;
        const pattern = raw.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
        group.rules.push({ allow: key === 'allow', length: raw.replace(/\*/g, '').length, re: new RegExp('^' + pattern + (end ? '$' : '')) });
      }
      if (key === 'crawl-delay' && /^\d+(?:\.\d+)?$/.test(value)) group.delay = Math.max(group.delay, Number(value) * 1000);
    }
  }
  const ua = agent.toLowerCase(); let best = -2;
  for (const g of groups) { g.score = Math.max(-2, ...g.agents.map(a => a === '*' ? -1 : a && ua.includes(a) ? a.length : -2)); best = Math.max(best, g.score); }
  const selected = groups.filter(g => g.score === best && best > -2);
  return { delay: Math.max(0, ...selected.map(g => g.delay)), allowed(url) {
    const u = new URL(url); const path = u.pathname + u.search;
    const matches = selected.flatMap(g => g.rules).filter(r => r.re.test(path)).sort((a, b) => b.length - a.length || Number(b.allow) - Number(a.allow));
    return matches.length ? matches[0].allow : true;
  } };
}
function blockedPage(text, url) {
  return /\/(?:log-?in|sign-?in|authenticate)(?:[/?#]|$)/i.test(new URL(url).pathname)
    || /<title[^>]*>\s*(?:just a moment|access denied|attention required|captcha|sign in|log in|login)(?:\b|[\s<])/i.test(text)
    || (/<input\b[^>]*type\s*=\s*["']?password\b/i.test(text)
      && /(?:log ?in|sign ?in)\s+(?:is )?(?:required|to (?:continue|view|access))|(?:must|please)\s+(?:log ?in|sign ?in)/i.test(text)
      && !(/<(?:main|article)\b[^>]*>[\s\S]*?(?:catalogue|auction lots|lot\s*\d|guide price|sold for|listing-address|property details)/i.test(text)
        || /listing-address|home-lot-wrapper|grid-address|(?:guide price|sold for)\s*:?\s*(?:£|&pound;)/i.test(text)))
    || /(?:verify (?:that )?you are human|checking your browser|cf-chl-|challenge-platform\/)/i.test(text);
}
export function createClient({ fetchImpl = globalThis.fetch, userAgent = 'LauritoAuctionsBot/1.0', delayMs = 1500, timeoutMs = 20000, maxRequests = 600, onPolicy = () => {}, sleepImpl = ms => new Promise(r => setTimeout(r, ms)), now = () => Date.now(), maxBytes = 2_000_000, maxRedirects = 5, enforceRobots = true } = {}) {
  if (typeof fetchImpl !== 'function' || !clean(userAgent) || /[\r\n]/.test(userAgent)) throw fail('CONFIG', 'A fetch implementation and identified user agent are required');
  if (![delayMs, timeoutMs, maxRequests, maxBytes, maxRedirects].every(Number.isFinite) || delayMs < 0 || timeoutMs <= 0 || maxRequests < 1 || maxBytes < 1 || maxRedirects < 0) throw fail('CONFIG', 'Invalid client limits');
  const policies = new Map(), lastOrigin = new Map(), delays = new Map(); let count = 0, lastAny = -Infinity, gate = Promise.resolve();
  const notify = event => { try { onPolicy(event); } catch { /* observability must not override safety */ } };
  async function request(url) {
    const origin = new URL(url).origin;
    const turn = gate.then(async () => {
      if (count >= maxRequests) throw fail('REQUEST_LIMIT', 'Request cap reached');
      const wait = Math.max(0, lastAny + delayMs - now(), (lastOrigin.get(origin) ?? -Infinity) + Math.max(delayMs, delays.get(origin) || 0) - now());
      if (wait) await sleepImpl(wait);
      count++; lastAny = now(); lastOrigin.set(origin, now());
    }); gate = turn.catch(() => {}); await turn;
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { redirect: 'manual', credentials: 'omit', signal: controller.signal, headers: { 'User-Agent': userAgent, Accept: 'text/plain,text/html,application/json;q=0.8' } });
      if (response.type === 'opaqueredirect' || response.redirected) throw fail('REDIRECT_POLICY', 'Fetch must expose redirects without following them');
      if (response.url && new URL(response.url).href !== new URL(url).href) throw fail('REDIRECT_POLICY', 'Unexpected response URL');
      const declared = Number(response.headers.get('content-length'));
      if (declared > maxBytes) { await response.body?.cancel(); throw fail('BYTE_LIMIT', 'Response too large'); }
      let text = '', bytes = 0;
      if (response.body?.getReader) {
        const reader = response.body.getReader(), decoder = new TextDecoder();
        for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > maxBytes) { await reader.cancel(); throw fail('BYTE_LIMIT', 'Response too large'); } text += decoder.decode(part.value, { stream: true }); }
        text += decoder.decode();
      } else { text = await response.text(); if (new TextEncoder().encode(text).byteLength > maxBytes) throw fail('BYTE_LIMIT', 'Response too large'); }
      return { response, text };
    } finally { clearTimeout(timer); }
  }
  async function policy(origin) {
    if (!policies.has(origin)) policies.set(origin, (async () => {
      let url = origin + '/robots.txt';
      try {
        for (let hop = 0; hop <= maxRedirects; hop++) {
          const { response: r, text } = await request(url);
          if ([301, 302, 303, 307, 308].includes(r.status)) { const next = httpURL(new URL(r.headers.get('location') || '', url).href); if (!next || new URL(next).origin !== origin || !r.headers.get('location')) throw fail('ROBOTS_REDIRECT', 'Robots redirect is not same-origin'); url = next; continue; }
          if (r.status === 404 || r.status === 410) { const p = robotsPolicy('', userAgent); notify({ origin, status: 'missing', http_status: r.status }); return p; }
          if (r.status < 200 || r.status >= 300) throw fail('ROBOTS_UNAVAILABLE', 'Robots unavailable: ' + r.status);
          if (/text\/html/i.test(r.headers.get('content-type') || '') || /<(?:!doctype|html|head|body)\b/i.test(text) || blockedPage(text, url)) throw fail('ROBOTS_CHALLENGE', 'Robots returned HTML, login or challenge');
          const p = robotsPolicy(text, userAgent); delays.set(origin, p.delay); notify({ origin, status: 'loaded', http_status: r.status, crawl_delay_ms: p.delay }); return p;
        }
        throw fail('ROBOTS_REDIRECT', 'Too many robots redirects');
      } catch (e) { notify({ origin, status: 'blocked', reason: e.code || e.message }); throw e; }
    })());
    return policies.get(origin);
  }
  async function get(input) {
    let url = httpURL(input); if (!url) throw fail('URL', 'Only credential-free HTTP(S) URLs are allowed'); const origin = new URL(url).origin;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const p = await policy(new URL(url).origin);
      if (enforceRobots && !p.allowed(url)) { notify({ origin, status: 'disallowed', url }); throw fail('ROBOTS_DISALLOW', 'Robots disallows ' + url); }
      if (!enforceRobots && !p.allowed(url)) notify({ origin, status: 'disallowed_but_public_page_requested', url });
      if (blockedPage('', url)) throw fail('LOGIN', 'Login route is not accessible');
      const { response: r, text } = await request(url);
      if ([301, 302, 303, 307, 308].includes(r.status)) {
        const location = r.headers.get('location'); const next = location && httpURL(new URL(location, url).href);
        if (!next || new URL(next).origin !== origin) throw fail('REDIRECT_POLICY', 'Cross-origin or invalid redirect refused'); url = next; continue;
      }
      if (r.status < 200 || r.status >= 300) throw fail('HTTP', 'HTTP ' + r.status + ': ' + url);
      if (blockedPage(text, url)) throw fail('CHALLENGE', 'Login or bot challenge refused'); return text;
    }
    throw fail('REDIRECT_LIMIT', 'Too many content redirects');
  }
  get.get = get; return get;
}
const INWARD_NEVER = /[CIKMOV]/;
export function validPostcode(value) {
  const text = clean(value).toUpperCase().replace(/\u00a0/g, ' ');
  for (const match of text.matchAll(/\b([A-Z]{1,2})(\d{1,2})([A-Z]?)\s*(\d)([A-Z]{2})\b/g)) {
    const area = match[1], district = match[2], unit = match[5];
    if (/[QVX]/.test(area[0])) continue;
    if (area[1] && /[IJZ]/.test(area[1])) continue;
    if (district === '0' || district.startsWith('0')) continue;
    if (INWARD_NEVER.test(unit)) continue;
    return area + district + match[3] + ' ' + match[4] + unit;
  }
  return null;
}
function bareDistrict(value) {
  const text = clean(value).toUpperCase().replace(/\u00a0/g, ' ');
  const re = /(?:^|[\s,])((?:GL|EH|BS|WA|WN|SK|OL|BL|M|G)\d{1,2}[A-Z]?)(?=[\s,]|$)/g;
  for (const match of text.matchAll(re)) {
    const token = match[1];
    const num = token.match(/\d+/)[0];
    if (num === '0' || num.startsWith('0')) continue;
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 6);
    if (/^\s*\d/.test(after)) continue;
    if (/^[MG]\d/.test(token)) {
      const window = text.slice(Math.max(0, match.index - 16), match.index + match[0].length + 18);
      const roads = window.match(/\bM\d{1,2}\b/g) || [];
      if (roads.length > 1 || /\b(?:MOTORWAY|TRUNK ROAD)\b/.test(window)) continue;
    }
    return token;
  }
  return '';
}
const postcodeOf = value => validPostcode(value);
const DISTRICT_TOWN = [[/^GL\d/i, 'Cheltenham'], [/^EH\d/i, 'Edinburgh'], [/^BS\d/i, 'Bristol'], [/^(?:M|SK|OL|BL|WN|WA)\d/i, 'Manchester'], [/^G\d/i, 'Glasgow']];
const PLACE_TOWN = [
  [/\b(?:greater manchester|stockport|salford|bolton|oldham|wigan|warrington)\b/i, 'Manchester'],
  [/\bmanchester\b(?!\s+(?:road|street|rd|st|lane|avenue|ave|drive|way|close|crescent|terrace|gardens|place|grove|hill|park)\b)/i, 'Manchester'],
  [/(?<!\bport\s)\bglasgow\b(?!\s+(?:road|street|rd|st|lane|avenue|ave|drive|way|close)\b)/i, 'Glasgow'],
  [/\bedinburgh\b(?!\s+(?:road|street|rd|st|lane|avenue|ave|drive|way|close)\b)/i, 'Edinburgh'],
  [/\bbristol\b(?!\s+(?:road|street|rd|st|lane|avenue|ave|drive|way|close)\b)/i, 'Bristol'],
  [/\b(?:cheltenham|gloucestershire|gloucester)\b(?!\s+(?:road|street|rd|st|lane|avenue|ave|drive|way|close)\b)/i, 'Cheltenham']
];
function districtTown(outward) {
  for (const [re, name] of DISTRICT_TOWN) if (re.test(outward)) return name;
  return '';
}
function placeTown(raw) {
  for (const [re, name] of PLACE_TOWN) if (re.test(raw)) return name;
  return '';
}
export function areaMatch(text) {
  const raw = clean(text).replace(/\u00a0/g, ' ');
  const full = postcodeOf(raw);
  const outward = full ? full.split(' ')[0] : bareDistrict(raw);
  const fromDistrict = outward ? districtTown(outward) : '';
  const fromPlace = placeTown(raw);
  let town = '';
  if (full) town = fromDistrict;
  else if (fromPlace && fromDistrict && fromPlace !== fromDistrict) town = fromPlace;
  else town = fromDistrict || fromPlace;
  const district = full || (town && town === fromDistrict ? outward : '');
  return town ? { town, postcode: full || '', district } : null;
}
const CHROME = /\b(?:faqs?|pre-auction marketing|show\s*\/\s*hide|legal pack|register to bid|auction updates|favicon\.ico)\b/i;
export function cleanAddress(value) {
  let text = clean(value).replace(/\u00a0/g, ' ');
  const afterDate = text.match(/\bauction date:\s*\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+20\d{2}\s+(.+)$/i);
  if (afterDate) text = afterDate[1].trim();
  if (CHROME.test(text)) {
    const re = /((?:lot\s+\d+\s+)?(?:\d+\s+bed\s+[\w'-]+\s+)?[\w'.-]+\s+(?:road|street|lane|avenue|close|gardens|drive|way|place|terrace|grove|court|crescent)\b(?:\s*,\s*(?![A-Z]{1,2}\d)[^,]{1,40}){0,5}\s*,?\s*[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})/ig;
    const all = [...text.matchAll(re)];
    text = all.length ? all[all.length - 1][1].replace(/\s+/g, ' ').trim() : '';
  }
  return addressLike(text) ? text : '';
}
export function addressLike(value) {
  const text = clean(value).replace(/\u00a0/g, ' ');
  if (CHROME.test(text)) return false;
  if (text.length < 10 || text.length > 180) return false;
  if (/[{}<>]|function\b|=>|selector:|view_module|keyboard_arrow|gnd0|timezone|path d=/i.test(text)) return false;
  if (!areaMatch(text)) return false;
  const street = /\b(?:street|road|rd|avenue|ave|lane|drive|close|crescent|terrace|way|place|court|gardens|square|mews|grove|row|quay|walk|house|flat|apartment|land|plot|cottage|bungalow)\b/i.test(text);
  if (validPostcode(text)) {
    const rest = text.replace(validPostcode(text), ' ');
    return /[A-Za-z]{4}/.test(text) && (street || /\d/.test(rest));
  }
  return /\d/.test(text) && street;
}
function townOf(address, postcode) {
  return areaMatch([address, postcode].filter(Boolean).join(' '))?.town || null;
}
function money(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : null;
  const s = clean(v); if (!/^(?:£|GBP\s*)?\d[\d,]*(?:\.\d{1,2})?(?:\s*(?:\+|plus))?$/i.test(s)) return null;
  const n = Number(s.replace(/£|GBP|,|plus|\+/gi, '').trim()); return Number.isFinite(n) && n >= 0 ? n : null;
}
const statusOf = value => {
  const s = clean(value).toLowerCase();
  if (/^(?:sold(?: (?:at auction|prior|post auction|after auction|before auction))?|sold prior to auction)$/.test(s)) return 'sold';
  if (/^withdrawn(?: prior to auction)?$/.test(s)) return 'withdrawn';
  if (/^(?:unsold|no[ _-]bids)$/.test(s)) return 'unsold';
  if (/^(?:available|available at|still available|for sale|post auction available)$/.test(s)) return 'available';
  if (/^(?:upcoming|forthcoming|live|live stream auction|live streamed auction|timed auction|auction pending|entered into a future auction)$/.test(s)) return 'upcoming'; return null;
};
function subtypeOf(raw) {
  const type = clean(raw.residential_subtype || raw.lot_type || raw.property_type || raw.type), title = clean(raw.title), desc = clean(raw.description);
  const originalTypes = [raw.lot_type, raw.property_type, raw.type].map(clean).filter(Boolean);
  const original = originalTypes.join(' ') + ' ' + title;
  const factualType = clean(raw.lot_type || raw.type || raw.property_type);
  const t = type + ' ' + title, all = t + ' ' + desc;
  // Canonical adapter labels must never erase the original legal interest/type.
  if (/ground[ -]?rents?|freehold reversion|freehold interest (?:only|subject to.*long lease)/i.test(original)) return { type: 'Commercial' };
  const consent = /(?:planning (?:permission|consent)|consent|permission)\s+(?:has been |is |was )?(?:granted|approved)|(?:granted|approved)\s+(?:residential )?planning|permitted development rights/i.test(all) && /residential|dwellings?|flats?|houses?|apartments?|homes?|conversion/i.test(all);
  const residential = /residential|houses?|townhouses?|town houses?|flats?|apartments?|bungalows?|maisonettes?|studios?|hmo|dwellings?|homes?/i.test(t);
  const explicitDevelopment = raw.residential_verified === true || /residential (?:development|conversion)|(?:development|conversion) (?:for|to|of) (?:residential|flats?|houses?|apartments?|dwellings?)/i.test(t) || /^Development$/i.test(raw.residential_subtype || '');
  const originalMixed = /mixed[ -]?use|(?:shop|retail|office|commercial).{0,60}(?:and|with|plus|over|above).{0,30}(?:flat|apartment|residential)/i.test(original);
  const pureCommercialOriginal = [factualType, title].some(value => /warehouse|industrial|commercial|retail|offices?|shops?|public house|pub|restaurant|hotel/i.test(value) && !/residential|flats?|apartments?|studios?|hmo|dwellings?|mixed[ -]?use/i.test(value));
  if (pureCommercialOriginal && !originalMixed && !consent && raw.residential_verified !== true && !/residential (?:development|conversion)|conversion (?:for|to) (?:residential|flats?|apartments?)/i.test(original)) return { type: 'Commercial' };
  if (/\bland\b|agricultural|garages?|parking|car park|paddock/i.test(factualType) && !consent && raw.residential_verified !== true && !/residential (?:development|conversion)|conversion (?:for|to) (?:residential|flats?|apartments?)/i.test(original)) return { type: 'Commercial' };
  if (/mixed[ -]?use/i.test(t) || (/commercial|shops?|retail|offices?/i.test(t) && residential && /(?:and|with|plus|over|above)/i.test(t))) return { type: 'Mixed-use' };
  if (/land|agricultural|garages?|parking|car park|paddock/i.test(type || title)) return consent || explicitDevelopment ? { type: 'Development' } : { type: 'Commercial' };
  if (/warehouse|industrial|commercial|retail|offices?|shops?|pub(?:lic house)?|restaurant|hotel/i.test(type || title) && !residential) return consent ? { type: 'Development' } : { type: 'Commercial' };
  if (/development|conversion/i.test(t)) return consent || explicitDevelopment ? { type: 'Development' } : { type: 'Unclassified' };
  if (/portfolio|portfolios/i.test(t)) return residential || /^portfolios$/i.test(type) ? { type: 'Portfolios' } : { reason: 'unknown_type' };
  if (/hmo|house in multiple occupation|houses in multiple occupation/i.test(t)) return { type: 'HMO' };
  if (/blocks?|building (?:of|comprising|containing).*flats|(?:\d+|multiple)\s+(?:self-contained )?flats/i.test(t) && (residential || /^blocks$/i.test(type))) return { type: 'Blocks' };
  if (/flats?|apartments?|maisonettes?|studios?/i.test(t)) return { type: 'Flats' };
  if (/houses?|townhouses?|town houses?|bungalows?|cottages?|villas?|terraced|semi-detached|detached/i.test(t)) return { type: 'Houses' };
  return { type: 'Unclassified' };
}
const ORDER = '(?:instructed by|on (?:the )?instructions of|by order of)';
const RECEIVER_TAG = new RegExp(ORDER + ' (?:the |a |an )?(?:[\\w &.\'-]{0,60}?)?(?:lpa |fixed charge |law of property act )?(?:receivers?|administrators?|liquidators?)\\b', 'i');
const LENDER_TAG = new RegExp(ORDER + ' (?:the |a |an )?(?:[\\w &.\'-]{0,60}?)?(?:mortgagees?|lenders?|banks?)\\b|mortgagee in possession|\\brepossession\\b', 'i');
export function saleTag(value) {
  const text = clean(String(value || '').replace(/<[^>]+>/g, ' '));
  const hit = re => {
    const match = text.match(re);
    if (!match || match.index == null) return '';
    const slice = text.slice(Math.max(0, match.index - 80), match.index + match[0].length + 80).trim();
    if (/potential|possible|may |might |could |not instructed|no receiver|not (?:a |an )?repossession|no repossession/i.test(slice)) return '';
    return slice;
  };
  const receiver = hit(RECEIVER_TAG);
  if (receiver) return { tag: 'Receiver', evidence: receiver };
  const lender = hit(LENDER_TAG);
  if (lender) return { tag: 'Lender', evidence: lender };
  return { tag: 'Auction', evidence: '' };
}
export function normalizeLot(raw, { source, now = new Date() } = {}) {
  if (!raw || typeof raw !== 'object') return { lot: null, reason: 'invalid' };
  const address = clean(Array.isArray(raw.address) ? raw.address.join(', ') : raw.address || raw.property_address);
  const sourceName = clean(typeof source === 'string' ? source : source?.name || raw.source), source_url = httpURL(raw.source_url || raw.url);
  if (!address || !sourceName || !source_url) return { lot: null, reason: 'invalid' };
  const area = areaMatch([address, raw.title, raw.postcode, raw.page_text].filter(Boolean).join(' '));
  const postcode = area?.postcode || postcodeOf(raw.postcode || address) || area?.district || '';
  const town = area?.town || townOf(address, postcode);
  if (!town) return { lot: null, reason: 'out_of_area' };
  const subtype = subtypeOf(raw); if (subtype.reason) return { lot: null, reason: subtype.reason };
  const tagged = saleTag(raw.page_text || raw.sale_tag_evidence || raw.forced_sale_evidence || '');
  let status = statusOf(raw.status); const auctionISO = raw.auction_date ? dateISO(raw.auction_date) : null, current = dateISO(now);
  if (!current || (raw.auction_date && !auctionISO)) return { lot: null, reason: 'invalid' };
  if (status === 'available') status = auctionISO ? (auctionISO.slice(0, 10) >= current.slice(0, 10) ? 'upcoming' : 'unsold') : null;
  let outcome_unverified = false;
  if (status === 'upcoming' && auctionISO && auctionISO.slice(0, 10) < current.slice(0, 10)) {
    status = 'passed';
    outcome_unverified = true;
  }
  if (!status) return { lot: null, reason: 'unknown_status' }; 
  let grade = null, grade_evidence = null, grade_evidence_url = null;
  const evidenceURL = httpURL(raw.grade_evidence_url || raw.source_url || raw.url);
  if (raw.grade_verified === true && /^[ABC]$/.test(raw.grade) && clean(raw.grade_evidence) && evidenceURL) { grade = raw.grade; grade_evidence = clean(raw.grade_evidence); grade_evidence_url = evidenceURL; }
  const forced = clean(raw.forced_sale_evidence || tagged.evidence), forcedURL = httpURL(raw.forced_sale_evidence_url || raw.source_url || raw.url);
  if (!grade && forcedURL && !/potential|possible|may |might |could |not instructed|no receiver/i.test(forced) && /instructed by (?:the |a |an )?(?:[\w &.'-]+ )?(?:receivers?|lenders?|mortgagees?)\b|on (?:the )?instructions of (?:the |a |an )?(?:[\w &.'-]+ )?(?:receivers?|lenders?|mortgagees?)\b/i.test(forced)) { grade = 'B'; grade_evidence = forced; grade_evidence_url = forcedURL; }
  const scraped_at = dateISO(raw.scraped_at || now); if (!scraped_at) return { lot: null, reason: 'invalid' };
  const lotPage = !/favicon\.ico|\/wp-json(?:\/|$)|\/oembed\/|\/search\?/i.test(source_url) && !/\/\?s=/i.test(source_url);
  const detail_verified = raw.detail_verified === false ? false : lotPage && !outcome_unverified;
  const verification_note = clean(raw.verification_note) || (outcome_unverified ? 'Auction date has passed. The source did not state sold or withdrawn, so this is not shown as upcoming. Outcome not verified.' : (!lotPage ? 'The stored link is not a lot or catalogue page. Details taken from scraped text are not verified.' : ''));
  const lot = { address, postcode, town, city: town, residential_subtype: subtype.type, lot_type: clean(raw.lot_type || raw.property_type || raw.type || raw.title), property_type: subtype.type, title: clean(raw.title) || address, status, auction_date: auctionISO?.slice(0, 10) || null, source: sourceName, source_url, sources: [{ name: sourceName, url: source_url }], scraped_at, stale: false, detail_verified, verification_note: verification_note || null, outcome_unverified,
    guide_price: money(raw.guide_price) || null, guide_price_text: clean(raw.guide_price_text).slice(0, 160) || null, opening_bid: money(raw.opening_bid), current_bid: money(raw.current_bid), sold_price: money(raw.sold_price) || null, grade, grade_evidence, grade_evidence_url, grade_verified: !!grade, sale_tag: tagged.tag, sale_tag_evidence: tagged.evidence || null,
    provenance: [{ source: sourceName, source_url, scraped_at, status, auction_date: auctionISO?.slice(0, 10) || null, guide_price: money(raw.guide_price) || null, opening_bid: money(raw.opening_bid), current_bid: money(raw.current_bid), sold_price: money(raw.sold_price) || null }] };
  lot.id = stableId(assetKey(lot) + '|' + (lot.auction_date || 'undated'));
  return { lot, reason: null };
}
function stableId(value) { let n = 14695981039346656037n; for (const c of value) n = BigInt.asUintN(64, (n ^ BigInt(c.codePointAt(0))) * 1099511628211n); return 'lot-' + n.toString(16).padStart(16, '0'); }
const canon = v => clean(v).toLowerCase().replace(/\bflat\s*(\d+)/g, 'flat $1').replace(/\b(apartment|apt)\s*(\d+)/g, 'flat $2').replace(/[^a-z0-9]/g, '');
function premiseKey(l) {
  let address = clean(l.address).toLowerCase();
  const pc = postcodeOf(l.postcode || address); if (pc) address = address.replace(new RegExp(pc.replace(' ', '\\s*'), 'ig'), '');
  address = address.replace(/\b(?:greater manchester|city of edinburgh|city of glasgow|gloucestershire|lanarkshire|midlothian|lancashire|avon)\b/gi, ' ');
  address = address.replace(/\b(?:manchester|glasgow|edinburgh|bristol|cheltenham)\s*[,;\s]*$/i, '').replace(/[,;\s]+$/g, '');
  return canon(address);
}
function unitKey(l) {
  const units = [];
  for (const value of [l.address, l.title]) {
    for (const m of clean(value).matchAll(/\b(?:flat|apartment|apt|unit|maisonette)\s*#?\s*(\d+[a-z]?(?:[-/]\d+[a-z]?)?|[a-z])\b/gi)) units.push(m[1].toLowerCase().replace(/^0+(?=\d)/, ''));
    for (const m of clean(value).matchAll(/\b\d{1,2}f\d{1,2}\b/gi)) units.push(m[0].toLowerCase());
  }
  return [...new Set(units)].sort().join('&');
}
function interestKey(l) {
  const type = clean(l.residential_subtype || l.property_type || l.lot_type);
  if (/^Blocks$/i.test(type) || /\bblock of (?:flats|apartments|\d+)|\b(?:whole|entire) (?:block|building)/i.test(l.title || '')) return 'block';
  if (/^Flats$/i.test(type) || unitKey(l)) return 'flat';
  return '';
}
const assetKey = l => premiseKey(l) + '|' + canon(l.postcode) + '|' + unitKey(l) + '|' + interestKey(l);
const sourceNames = l => new Set((l.sources || [{ name: l.source }]).map(s => s.name));
const sourceOverlap = (a, b) => [...sourceNames(a)].some(s => sourceNames(b).has(s));
const distinct = list => [...new Map(list.filter(Boolean).map(x => [JSON.stringify(x), x])).values()];
function compatible(a, b) {
  if (unitKey(a) !== unitKey(b) || interestKey(a) !== interestKey(b)) return false;
  if (!a.title || !b.title || canon(a.title) === canon(b.title)) return true;
  // Different marketing titles are safe only with the same full numbered premise/street.
  const fullPremise = x => /\b\d+[a-z]?(?:[-/]\d+[a-z]?)?\s+[\w.' -]+\b(?:street|road|avenue|lane|drive|crescent|place|terrace|way|court|close|gardens|square|mews|park|quay|st|rd|ave)\b/i.test(x.address) && !/\b(?:land|ground rents?|parking|garage|freehold interest|leasehold interest|reversion)\b/i.test(x.title + ' ' + x.address);
  return assetKey(a) === assetKey(b) && fullPremise(a) && fullPremise(b);
}
function combine(a, b) {
  const at = +new Date(a.scraped_at || 0), bt = +new Date(b.scraped_at || 0), rank = s => String(s).toLowerCase() === 'sold' ? 3 : String(s).toLowerCase() === 'withdrawn' ? 2 : 1;
  const newer = bt > at || (bt === at && rank(b.status) > rank(a.status)) ? b : a, older = newer === b ? a : b;
  const merged = { ...older, ...newer, auction_date: newer.auction_date || older.auction_date || null,
    sources: distinct([...(a.sources || [{ name: a.source, url: a.source_url }]), ...(b.sources || [{ name: b.source, url: b.source_url }])]),
    provenance: distinct([...(a.provenance || [{ source: a.source, source_url: a.source_url, scraped_at: a.scraped_at, status: a.status }]), ...(b.provenance || [{ source: b.source, source_url: b.source_url, scraped_at: b.scraped_at, status: b.status }])]) };
  merged.id = stableId(assetKey(merged) + '|' + (merged.auction_date || 'undated'));
  // Never fill one source's unknown current price with another source's stale price.
  return merged;
}
export function dedupeLots(lots = []) {
  const exact = [];
  for (const input of lots) {
    if (!input?.address || !input.postcode) continue;
    const lot = { ...input }; const hit = exact.findIndex(x => assetKey(x) === assetKey(lot) && (x.auction_date || null) === (lot.auction_date || null) && compatible(x, lot));
    if (hit < 0) exact.push(lot); else exact[hit] = combine(exact[hit], lot);
  }
  const removed = new Set();
  for (let i = 0; i < exact.length; i++) {
    const a = exact[i]; if (a.auction_date || removed.has(i)) continue;
    const candidates = exact.map((b, j) => ({ b, j })).filter(({ b, j }) => j !== i && !removed.has(j) && b.auction_date && assetKey(a) === assetKey(b) && compatible(a, b) && !sourceOverlap(a, b));
    const dates = new Set(candidates.map(c => c.b.auction_date));
    if (candidates.length === 1 && dates.size === 1) { exact[candidates[0].j] = combine(candidates[0].b, a); removed.add(i); }
  }
  return exact.filter((_, i) => !removed.has(i));
}
function coverageOK(coverage, name) {
  const entries = coverage?.sources || coverage;
  const row = Array.isArray(entries) ? entries.find(c => [c.name, c.source, c.id].includes(name)) : entries?.[name];
  const status = typeof row === 'string' ? row : row?.status;
  return row === true || row?.success === true || ['success', 'ok', 'live', 'partial'].includes(status);
}
export function mergePrevious(fresh = [], previous = [], coverage = {}, now = new Date()) {
  const current = +new Date(now); if (!Number.isFinite(current)) throw fail('DATE', 'Invalid merge time');
  const result = dedupeLots(fresh);
  for (const old of previous) {
    if (!old?.address || !old.postcode) continue;
    const observed = +new Date(old.scraped_at), age = current - observed;
    const expiry = String(old.status).toLowerCase() === 'sold' ? 730 * DAY : 30 * DAY;
    if (!Number.isFinite(observed) || age > expiry) continue;
    const present = result.findIndex(x => {
      if ((x.auction_date || null) !== (old.auction_date || null)) return false;
      const correction = !x.stale && x.source_url && x.source_url === old.source_url && sourceOverlap(x, old)
        && canon(x.title) && canon(x.title) === canon(old.title) && unitKey(x) === unitKey(old);
      return correction || (assetKey(x) === assetKey(old) && compatible(x, old));
    });
    if (present >= 0) {
      const freshRow = result[present], merged = combine(old, freshRow);
      result[present] = { ...freshRow, sources: merged.sources, provenance: merged.provenance };
      continue;
    }
    const names = [...sourceNames(old)]; const succeeded = names.some(name => coverageOK(coverage, name));
    result.push({ ...old, stale: true, stale_reason: succeeded ? 'missing_from_successful_crawl' : 'source_unavailable', stale_checked_at: new Date(current).toISOString() });
  }
  return dedupeLots(result);
}
const INSTRUCTION = /instructed by (?:the |a |an )?(?:[\w &.'-]{0,60}?)?(?:receivers?|lenders?|mortgagees?)\b|on (?:the )?instructions of (?:the |a |an )?(?:[\w &.'-]{0,60}?)?(?:receivers?|lenders?|mortgagees?)\b/i;
const HEDGE = /potential|possible|may |might |could |not instructed|no receiver/i;
export function instructionEvidence(value) {
  const text = clean(String(value || '').replace(/<[^>]+>/g, ' '));
  const match = text.match(INSTRUCTION);
  if (!match || match.index == null) return '';
  const slice = text.slice(Math.max(0, match.index - 80), match.index + match[0].length + 80).trim();
  if (HEDGE.test(slice)) return '';
  return slice;
}
export function sortLotsByGrade(lots = []) {
  const rank = grade => ({ A: 0, B: 1, C: 2 })[grade] ?? 3;
  return lots.slice().sort((a, b) => rank(a && a.grade) - rank(b && b.grade) || String(a && a.address || '').localeCompare(String(b && b.address || '')));
}
