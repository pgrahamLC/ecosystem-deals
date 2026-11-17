/* Fill public branch phones from the Rightmove branch page already stored as sourceUrl.
   Generic office emails are taken only from the firm's own site. Blank stays blank. */
import {readFileSync, writeFileSync} from 'node:fs';

const DATE = '2026-11-17';
const file = new URL('../data/market-entry/agents.json', import.meta.url);
const book = JSON.parse(readFileSync(file));
const rows = book.agents;
const urls = [...new Set(rows.map((row) => row.sourceUrl).filter((url) => /rightmove\.co\.uk\/estate-agents\/agent\//.test(url || '')))];

function genericEmail(value) {
  const email = String(value || '').split('?')[0].trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) return '';
  const local = email.split('@')[0];
  if (/^[a-z]+[._][a-z]+$/.test(local)) return '';
  if (/^(info|office|enquiries|enquiry|hello|admin|sales|lettings|contact|mail|reception|accounts|commercial|newhomes|auctions|property|team|help|rentals|customerservices)$/.test(local)) return email;
  return '';
}
async function get(url) {
  const response = await fetch(url, {headers: {'user-agent': 'Mozilla/5.0 (compatible; LauritoResearch/1.0)'}, redirect: 'follow'});
  if (!response.ok) throw new Error(String(response.status));
  return response.text();
}
function phoneFrom(html) {
  const main = html.match(/"branchMainTelephone":"([^"]*)"/);
  const letPhone = html.match(/"branchLettingsTelephone":"([^"]*)"/);
  const value = (main && main[1]) || (letPhone && letPhone[1]) || '';
  return value.replace(/\\u0026/g, '&').trim();
}

const found = new Map();
let done = 0;
async function worker(queue) {
  while (queue.length) {
    const url = queue.pop();
    try {
      const html = await get(url);
      const phone = phoneFrom(html);
      found.set(url, phone);
    } catch (error) {
      found.set(url, '');
    }
    done += 1;
    if (done % 100 === 0) console.log('fetched', done, 'of', urls.length);
  }
}
const queue = urls.slice();
await Promise.all(Array.from({length: 8}, () => worker(queue)));
console.log('phones found', [...found.values()].filter(Boolean).length, 'of', urls.length);

const sites = [...new Set(rows.map((row) => row.website).filter((url) => /^https?:\/\//.test(url || '')))];
const siteMail = new Map();
for (const site of sites) {
  try {
    const html = await get(site);
    const mails = [...html.matchAll(/mailto:([^"'?\s>]+)/gi)].map((match) => genericEmail(decodeURIComponent(match[1])));
    siteMail.set(site, mails.find(Boolean) || '');
  } catch (error) {
    siteMail.set(site, '');
  }
}
console.log('generic emails', [...siteMail.values()].filter(Boolean).length, 'of', sites.length);

for (const row of rows) {
  const phone = found.get(row.sourceUrl) || '';
  if (phone && !row.phone) {
    row.phone = phone;
    row.phoneSource = row.sourceUrl;
    row.phoneDate = DATE;
  }
  if (row.website && !row.websiteSource) {
    row.websiteSource = row.website;
    row.websiteDate = row.scraped || DATE;
  }
  const email = siteMail.get(row.website) || '';
  if (email && !row.email) {
    row.email = email;
    row.emailSource = row.website;
    row.emailDate = DATE;
  }
}
writeFileSync(file, JSON.stringify(book, null, 2) + '\n');
const phoneN = rows.filter((row) => row.phone).length;
const emailN = rows.filter((row) => row.email).length;
const webN = rows.filter((row) => row.website).length;
console.log({phoneN, emailN, webN, branches: rows.length});
