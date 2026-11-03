/**
 * Clive Emson catalogues. Robots ask for a 10 second crawl delay.
 * A lot is kept only when the catalogue shows a sold price and the lot page
 * says it is currently let at a stated rent, in Glasgow, Edinburgh or Gloucestershire.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'comps', 'clive-niy.jsonl');
const UA = 'LauritoAuctionsBot/1.0 (+https://github.com/pgrahamLC/ecosystem-deals)';
const DELAY = 10500;

function decode(s) {
  let t = String(s || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  for (let i = 0; i < 2; i++) t = t.replace(/&amp;/g, '&');
  return t.replace(/&pound;|&#163;/gi, '£').replace(/\s+/g, ' ').trim();
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function get(url) {
  await sleep(DELAY);
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
  if (r.status === 404) return '';
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}
function place(text) {
  if (/\bEdinburgh\b/i.test(text)) return 'Edinburgh';
  if (/\bGlasgow\b/i.test(text)) return 'Glasgow';
  if (/\bCheltenham\b|\bGloucester\b|\bStroud\b|\bTewkesbury\b|\bCirencester\b|\bGloucestershire\b/i.test(text)) return 'Cheltenham';
  return '';
}
function money(raw) {
  const n = Math.round(Number(String(raw).replace(/,/g, '')));
  return n > 500 ? n : null;
}

async function main() {
  fs.writeFileSync(OUT, '');
  const from = Number(process.argv[2] || 200);
  const to = Number(process.argv[3] || 270);
  for (let id = to; id >= from; id--) {
    const indexUrl = 'https://www.cliveemson.co.uk/properties/' + id + '/';
    let html = '';
    try { html = await get(indexUrl); }
    catch (e) { process.stdout.write('idx ' + id + ' ' + e.message + '\n'); continue; }
    if (!html || /page not found/i.test(html.slice(0, 400))) { process.stdout.write('idx ' + id + ' empty\n'); continue; }
    const text = decode(html);
    const lots = [];
    const seen = new Set();
    for (const chunk of text.split(/\bLOT\s+/)) {
      const m = chunk.match(/^(\d+)\s+([\s\S]{0,280}?)(Cheltenham|Glasgow|Edinburgh|Gloucestershire|Gloucester|Stroud|Tewkesbury|Cirencester)\s*(?:-\s*[A-Za-z ]{0,30})?\s*SOLD\s*£\s*([\d,]+)/);
      if (!m || seen.has(m[1])) continue;
      seen.add(m[1]);
      const city = place(m[3]);
      const sold = money(m[4]);
      const title = m[2].replace(/\s+/g, ' ').trim();
      if (/ground rent|\bland\b|woodland|garage/i.test(title) && !/flat|house|hmo|mixed|residential/i.test(title)) continue;
      if (city && sold) lots.push({ lot: m[1], city, sold, blurb: (title + ', ' + m[3]).replace(/\s+/g, ' ').trim() });
    }
    process.stdout.write('auction ' + id + ' local-sold ' + lots.length + '\n');
    for (const lot of lots) {
      const url = 'https://www.cliveemson.co.uk/properties/' + id + '/' + lot.lot + '/';
      try {
        const page = decode(await get(url));
        if (!/SOLD\s*£/i.test(page)) continue;
        const sold = money((page.match(/SOLD\s*£\s*([\d,]+)/i) || [])[1]) || lot.sold;
        const rentM = page.match(/currently let at\s*£\s*([\d,]+)\s*per annum/i) || page.match(/current rental of\s*£\s*([\d,]+)\s*per annum/i) || page.match(/producing\s*£\s*([\d,]+)\s*per annum/i);
        if (!rentM) { process.stdout.write('no rent ' + url + '\n'); continue; }
        if (/ground rent/i.test(page.slice(0, 500)) && Number(rentM[1].replace(/,/g, '')) < 2000) { process.stdout.write('ground rent ' + url + '\n'); continue; }
        const rent = money(rentM[1]);
        if (!rent || rent < 2400) continue;
        const gross = rent / sold;
        if (!(gross > 0.025 && gross < 0.3)) continue;
        const address = (page.match(/##\s*(.{10,140})/) || page.match(/([A-Z0-9][^£]{8,120}?\b(?:GL|EH|G|PA|ML|FK)\d[A-Z\d]?\s*\d[A-Z]{2})/) || [lot.blurb])[0];
        const pc = (String(address).toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/) || []);
        const row = {
          city: lot.city,
          sub_area: lot.blurb.split('-')[0].trim().slice(0, 40),
          address: String(address).replace(/^##\s*/, '').slice(0, 160),
          postcode: pc[1] ? pc[1] + ' ' + pc[2] : '',
          type: /hmo/i.test(page) ? 'HMO' : /flat|maisonette|apartment/i.test(page.slice(0, 400)) ? 'flat' : /mixed/i.test(page.slice(0, 300)) ? 'mixed use' : 'house',
          sold_price: sold,
          sold_date: '',
          rent_pa: rent,
          rent_text: ('Currently let at £' + rent.toLocaleString('en-GB') + ' per annum. Sold £' + sold.toLocaleString('en-GB') + '.'),
          rent_basis: 'passing',
          price_basis: 'sold',
          gross_yield: Math.round(gross * 10000) / 10000,
          auctioneer: 'Clive Emson',
          url,
          evidence: 'Clive Emson lot page states a sold price and that the property is currently let at this rent. Catalogue ' + indexUrl
        };
        fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
        process.stdout.write('KEEP ' + lot.city + ' ' + sold + ' ' + rent + ' ' + url + '\n');
      } catch (e) {
        process.stdout.write('lot ' + url + ' ' + e.message + '\n');
      }
    }
  }
  process.stdout.write('DONE\n');
}
main().catch(err => { console.error(err); process.exit(1); });
