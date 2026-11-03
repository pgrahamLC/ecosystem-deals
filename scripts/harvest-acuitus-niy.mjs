/**
 * Acuitus lot pages. Keep a lot only when the same page says Status Sold,
 * prints a price, and prints a rent per annum. Guide prices are ignored.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'comps', 'acuitus-niy.jsonl');
const UA = 'LauritoAuctionsBot/1.0 (+https://github.com/pgrahamLC/ecosystem-deals)';
const FROM = Number(process.argv[2] || 4300);
const TO = Number(process.argv[3] || 5950);

function decode(s) {
  let t = String(s || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  for (let i = 0; i < 2; i++) t = t.replace(/&amp;/g, '&');
  return t.replace(/&pound;|&#163;|&#8226;/gi, '£').replace(/&#8224;/g, '').replace(/\s+/g, ' ').trim();
}
function money(raw) {
  const n = Math.round(Number(String(raw).replace(/,/g, '')));
  return n > 1000 ? n : null;
}
function postcode(text) {
  const m = String(text).toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/);
  return m ? m[1] + ' ' + m[2] : '';
}
function place(address, pc) {
  const code = (pc.match(/^[A-Z]{1,2}\d+/) || [''])[0];
  const n = Number((code.match(/\d+/) || [''])[0]);
  const blob = address + ' ' + pc;
  if (/^EH/.test(code) || /\bEdinburgh\b/.test(blob)) return { city: 'Edinburgh', sub: town(address, 'Edinburgh') };
  if (/^G\d/.test(code) || /\bGlasgow\b/.test(blob)) return { city: 'Glasgow', sub: town(address, 'Glasgow') };
  if (/^ML/.test(code) && n <= 12) return { city: 'Glasgow', sub: town(address, 'Glasgow') };
  if (/^PA/.test(code) && n >= 1 && n <= 19) return { city: 'Glasgow', sub: town(address, 'Glasgow') };
  if (/^KY/.test(code) && n <= 12) return { city: 'Edinburgh', sub: town(address, 'Edinburgh') };
  if (/^FK/.test(code) && n <= 4) return { city: 'Edinburgh', sub: town(address, 'Edinburgh') };
  if (/^GL/.test(code) || /\bCheltenham\b|\bGloucester\b|\bStroud\b|\bTewkesbury\b|\bCirencester\b/.test(blob)) return { city: 'Cheltenham', sub: town(address, 'Cheltenham') };
  return null;
}
function town(address, city) {
  const parts = address.split(',').map(s => s.trim()).filter(Boolean);
  const drop = /gloucestershire|city of edinburgh|lanarkshire|scotland/i;
  const named = parts.filter(p => !drop.test(p) && !/^[A-Z]{1,2}\d/.test(p) && p.toLowerCase() !== city.toLowerCase());
  return (named[named.length - 1] || city).slice(0, 60);
}
function typeOf(text) {
  const t = text.toLowerCase();
  if (/hmo|house in multiple/.test(t)) return 'HMO';
  if (/portfolio/.test(t)) return 'portfolio';
  if (/mixed/.test(t) || (/retail/.test(t) && /residential|flat|apartment/.test(t))) return 'mixed use';
  if (/office/.test(t) && !/retail/.test(t)) return 'office';
  if (/block of flats|resi block/.test(t)) return 'resi block';
  if (/retail|shop|leisure|nightclub|pub\b|restaurant/.test(t)) return 'retail';
  if (/flat|apartment/.test(t)) return 'flat';
  if (/house|terrace|residential/.test(t)) return 'house';
  return 'retail';
}
async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
  if (r.status === 404) return '';
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}
async function pool(items, limit, worker) {
  let i = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (i < items.length) await worker(items[i++]);
  }));
}

async function main() {
  const ids = [];
  for (let id = FROM; id <= TO; id++) ids.push(id);
  fs.writeFileSync(OUT, '');
  let scanned = 0;
  let kept = 0;
  await pool(ids, 6, async (id) => {
    const url = 'https://www.acuitus.co.uk/property/' + id + '/';
    try {
      const html = await get(url);
      if (!html || /page not found/i.test(html.slice(0, 500))) { scanned++; return; }
      const text = decode(html);
      if (!/Status\s+Sold\b/i.test(text)) { scanned++; return; }
      const price = money((text.match(/Price\s*£\s*([\d,]+)/i) || [])[1]);
      const rent = money((text.match(/Rent\s*£\s*([\d,]+)\s*per Annum/i) || [])[1]);
      const h = text.match(/#\s+(.{10,160}?)\s+Freehold|\b(\d[^£]{8,140}?\b(?:GL|EH|G|ML|PA|FK|KY)\d[A-Z\d]?\s*\d[A-Z]{2})/);
      const address = (text.match(/([A-Z0-9][^#]{6,140}?\b(?:GL|EH|G|ML|PA|FK|KY)\d[A-Z\d]?\s*\d[A-Z]{2})/) || ['', ''])[1] || '';
      const pc = postcode(address + ' ' + text.slice(0, 800));
      const where = place(address || text.slice(0, 400), pc);
      if (price && rent && where) {
        const gross = rent / price;
        if (gross > 0.02 && gross < 0.25) {
          const dateM = text.match(/Auction\s+(\d{1,2})(?:st|nd|rd|th)?\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})/i);
          const months = { january: '01', february: '02', march: '03', april: '04', may: '05', june: '06', july: '07', august: '08', september: '09', october: '10', november: '11', december: '12' };
          const sold_date = dateM ? dateM[3] + '-' + months[dateM[2].toLowerCase()] + '-' + dateM[1].padStart(2, '0') : '';
          const head = text.slice(0, 700);
          const row = {
            city: where.city,
            sub_area: where.sub,
            address: (address || head).slice(0, 160),
            postcode: pc,
            type: typeOf(head),
            sold_price: price,
            sold_date,
            rent_pa: rent,
            rent_text: ('Rent £' + rent.toLocaleString('en-GB') + ' per annum. Status Sold. Price £' + price.toLocaleString('en-GB') + '.').slice(0, 220),
            rent_basis: 'passing',
            price_basis: 'sold',
            gross_yield: Math.round(gross * 10000) / 10000,
            auctioneer: 'Acuitus',
            url,
            evidence: 'Acuitus lot page states Status Sold, a price and a rent per annum for this lot. ' + url
          };
          fs.appendFileSync(OUT, JSON.stringify(row) + '\n');
          kept++;
          process.stdout.write('KEEP ' + where.city + ' ' + price + ' ' + rent + ' ' + (address || url).slice(0, 70) + '\n');
        }
      }
    } catch (e) {
      process.stdout.write('fail ' + id + ' ' + e.message + '\n');
    }
    scanned++;
    if (scanned % 200 === 0) process.stdout.write('scan ' + scanned + ' kept ' + kept + '\n');
  });
  process.stdout.write('WROTE ' + kept + ' scanned ' + scanned + '\n');
}
main().catch(err => { console.error(err); process.exit(1); });
