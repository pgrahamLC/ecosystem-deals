/* Refresh the public development pipeline from PlanIt and the auction file. */
import {writeFileSync, readFileSync} from 'node:fs';
import {AREAS, AUTHORITIES, clean, addMonths, unitsFrom, residential, companyName, stageOf, valueSignals, distressFromText, scoreOf, lensesOf, summarise} from './pipeline-model.mjs';

const TODAY = process.env.PIPELINE_TODAY || new Date().toISOString().slice(0, 10);
const FROM = addMonths(TODAY, -24);
const STALLED = addMonths(TODAY, -18);
const EXPIRY_FROM = addMonths(TODAY, -36);
const EXPIRY_TO = addMonths(TODAY, -30);
const root = new URL('../', import.meta.url);

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function planit(query) {
  const url = 'https://www.planit.org.uk/api/applics/json?' + new URLSearchParams(query);
  let last = 'PlanIt did not answer';
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await sleep(2500 + attempt * 3000);
    try {
      const response = await fetch(url, {headers: {'accept': 'application/json', 'user-agent': 'LauritoCapital-ecosystem-deals/1.0 (public planning refresh)'}, signal: AbortSignal.timeout(40000)});
      if (response.status === 503 || response.status === 429) {
        last = 'HTTP ' + response.status;
        continue;
      }
      const data = await response.json();
      if (data && data.error) return {error: String(data.error), records: [], total: 0};
      return data;
    } catch (error) {
      last = error.name || 'fetch failed';
    }
  }
  return {error: last, records: [], total: 0};
}

async function pages(auth) {
  const records = [];
  let page = 1;
  let total = 0;
  while (page <= 6) {
    const data = await planit({
      auth,
      app_state: 'Permitted',
      app_size: 'Large',
      start_date: EXPIRY_FROM,
      end_date: TODAY,
      pg_sz: '50',
      page: String(page)
    });
    if (data.error) return {error: data.error, records};
    total = data.total || 0;
    records.push(...(data.records || []));
    if (records.length >= total || !(data.records || []).length) break;
    page += 1;
  }
  return {records, total, truncated: records.length < total};
}

async function history(postcode) {
  if (!postcode) return null;
  const data = await planit({pcode: postcode, pg_sz: '20', page: '1', start_date: EXPIRY_FROM, end_date: TODAY});
  if (data.error) return null;
  return (data.records || []).map((row) => ({
    date: row.decided_date || row.start_date || '',
    type: clean(row.app_type || ''),
    reference: clean(row.uid || ''),
    source: row.url || row.link || ''
  })).filter((row) => row.reference);
}

function laterAdvance(rows, after) {
  return (rows || []).some((row) => row.date && row.date > after && /\b(condition|variation|reserved|amendment|discharge|building)\b/i.test(row.type));
}

function lotText(lot) {
  return ['title', 'address', 'lot_type', 'property_type', 'residential_subtype', 'grade_evidence', 'sale_tag', 'sale_tag_evidence'].map((key) => lot[key] || '').join(' ');
}

function currentLot(lot) {
  if (lot.stale === true) return false;
  const status = String(lot.status || '').toLowerCase();
  const words = String(lot.sale_status || lot.status || '').toLowerCase();
  if (/\b(sold|unsold|withdrawn|passed)\b/.test(words)) return false;
  const day = String(lot.auction_date || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day < TODAY) return false;
  if (status) return status === 'upcoming' || status === 'available';
  return true;
}

function districtMedian(comps, area, postcode) {
  const place = comps && comps.places && comps.places[area];
  const district = String(postcode || '').toUpperCase().match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\b/);
  if (!place || !district) return null;
  const node = place.postcode_districts && place.postcode_districts[district[1]];
  if (!node) return null;
  const years = Object.keys(node).filter((year) => node[year] && node[year].all && node[year].all.n >= 5).sort();
  const year = years[years.length - 1];
  if (!year) return null;
  return {year, median: node[year].all.median};
}

function finish(item) {
  item.lenses = lensesOf(item);
  item.score = scoreOf(item);
  return item;
}

const coverage = [];
const items = [];
const seen = new Set();

for (const area of AREAS) {
  for (const auth of AUTHORITIES[area]) {
    const pulled = await pages(auth);
    console.log(area, auth, pulled.error || pulled.total);
    coverage.push({area, authority: auth, total: pulled.total || 0, kept: 0, error: pulled.error || '', truncated: pulled.truncated === true});
    if (pulled.error) continue;
    for (const record of pulled.records) {
      if (!residential(record)) continue;
      const id = 'planit:' + (record.name || record.uid || record.link);
      if (seen.has(id)) continue;
      seen.add(id);
      const stage = stageOf(record);
      const desc = clean(record.description || '');
      const newSupply = /\b(erection|construction|residential development|new dwellings|new homes|demolition)\b/i.test(desc) && !/\b(window and door replacement|replacement scheme)\b/i.test(desc);
      const value = valueSignals(desc);
      const item = {
        id,
        kind: 'planning',
        area,
        name: clean(record.address || record.name || 'Address not recorded'),
        council: clean(record.area_name || auth),
        units: unitsFrom(record),
        approvalDate: record.decided_date || null,
        status: stage.status,
        stage: stage.stage,
        stageRank: stage.rank,
        developer: companyName(record.other_fields && record.other_fields.applicant_name) || 'not yet recorded',
        source: record.url || record.link || '',
        planit: record.link || '',
        postcode: clean(record.postcode || ''),
        reference: clean(record.uid || ''),
        description: desc.slice(0, 240),
        newSupply,
        distress: [],
        value,
        history: 'not yet recorded',
        gazette: 'not yet recorded',
        gap: 'not yet recorded'
      };
      if (!newSupply && !value.length && stage.rank < 2) continue;
      items.push(item);
      coverage[coverage.length - 1].kept += 1;
    }
  }
}

const postcodes = [...new Set(items.map((item) => item.postcode).filter(Boolean))].slice(0, 30);
const histories = new Map();
for (const postcode of postcodes) histories.set(postcode, await history(postcode));

items.forEach((item) => {
  const rows = item.postcode ? histories.get(item.postcode) : null;
  if (!item.postcode || rows == null) {
    item.history = 'not yet recorded';
    return;
  }
  item.history = rows.slice(0, 8);
  const after = item.approvalDate || '';
  const advanced = laterAdvance(rows, after);
  if (advanced && item.stageRank < 3) {
    item.stage = 'conditions or variation';
    item.stageRank = 3;
  }
  const built = rows.some((row) => /\b(building|commenc)/i.test(row.type));
  if (built) {
    item.status = 'under construction';
    item.stage = 'under construction';
    item.stageRank = 4;
  }
  if (item.newSupply && item.approvalDate && item.approvalDate <= STALLED && !advanced && !built) item.distress.push('stalled');
  if (item.newSupply && item.approvalDate && item.approvalDate >= EXPIRY_FROM && item.approvalDate <= EXPIRY_TO && !advanced && !built) item.distress.push('near expiry');
});

const lots = JSON.parse(readFileSync(new URL('data/auctions/lots.json', root))).lots || [];
const comps = JSON.parse(readFileSync(new URL('comps/summary.json', root)));
lots.filter(currentLot).forEach((lot) => {
  const text = lotText(lot);
  const distress = distressFromText(text);
  const value = valueSignals(text);
  if (!distress.length && !value.length) return;
  const area = AREAS.find((name) => new RegExp('^' + name + '$', 'i').test(String(lot.town || lot.city || '')));
  if (!area) return;
  const median = districtMedian(comps, area, lot.postcode);
  let gap = 'not yet recorded';
  if (lot.guide_price > 0 && median) {
    value.push('below median');
    const difference = median.median - lot.guide_price;
    gap = 'Guide ' + lot.guide_price + '. District median ' + median.median + ' in ' + median.year + '. Difference ' + difference + '. The gap after works is not yet recorded.';
    if (difference <= 0) value.pop();
  }
  items.push({
    id: 'lot:' + (lot.id || lot.source_url || lot.address),
    kind: 'lot',
    area,
    name: clean(lot.address || lot.title || 'Address not recorded'),
    council: area,
    units: unitsFrom({description: text}),
    approvalDate: null,
    status: /\bconsent|planning permission\b/i.test(text) ? 'granted' : 'not yet recorded',
    stage: 'granted',
    stageRank: 1,
    developer: 'not yet recorded',
    source: lot.source_url || '',
    planit: '',
    postcode: clean(lot.postcode || ''),
    reference: clean(lot.source || 'Auction listing'),
    description: clean(text).slice(0, 240),
    newSupply: false,
    distress,
    value,
    history: 'not yet recorded',
    gazette: 'not yet recorded',
    gap
  });
});

items.forEach(finish);
items.sort((a, b) => a.area.localeCompare(b.area) || b.score.total - a.score.total);

const named = new Map();
items.forEach((item) => {
  if (!item.developer || item.developer === 'not yet recorded') return;
  const key = item.developer.toLowerCase();
  if (!named.has(key)) named.set(key, {name: item.developer, areas: [], schemes: 0});
  const row = named.get(key);
  row.schemes += 1;
  if (row.areas.indexOf(item.area) < 0) row.areas.push(item.area);
});

const developers = [{
  name: '2nd Street Developments Ltd',
  companyNumber: '12713562',
  locationFocus: 'The registered office is in West Wickham, Kent. That is outside the tracker areas.',
  schemes: 'not yet recorded',
  source: 'https://find-and-update.company-information.service.gov.uk/company/12713562'
}].concat([...named.values()].filter((row) => row.schemes >= 2).slice(0, 8).map((row) => ({
  name: row.name,
  companyNumber: '',
  locationFocus: row.areas.join(', '),
  schemes: String(row.schemes),
  source: 'PlanIt applicant name on a public application'
})));

const book = {
  updated: TODAY,
  window: {grantedFrom: FROM, fetchedFrom: EXPIRY_FROM, to: TODAY, stalledBefore: STALLED, expiryFrom: EXPIRY_FROM, expiryTo: EXPIRY_TO},
  howToUpdate: 'Run node scripts/refresh-pipeline.mjs. It reads PlanIt large permitted applications and the current auction file. It does not invent a start, a developer, or a works cost. Unknowns stay not yet recorded.',
  score: 'Distress adds 3 for receivership, 2 for administration or repossession, 2 for a stall, 2 for a permission near expiry, and 3 for a Gazette notice. Value-add adds 2 for refurbishment, change of use, an HMO conversion or an adapted home, and 1 when the guide is below the district median. Stage adds 1 for grant, 2 for reserved matters, 3 for a later variation or conditions, and 4 for construction. Gazette notices are not yet recorded.',
  coverage,
  counts: summarise(items),
  developers,
  items
};

writeFileSync(new URL('data/market-entry/pipeline.json', root), JSON.stringify(book, null, 2) + '\n');
console.log('schemes', items.length);
AREAS.forEach((area) => console.log(area, JSON.stringify(book.counts[area])));
console.log('coverage errors', coverage.filter((row) => row.error).map((row) => row.authority + ': ' + row.error).join(' | ') || 'none');
