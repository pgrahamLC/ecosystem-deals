/* Council leasehold titles from HM Land Registry CCOD joined to Registered Leases.
   Neither file is public without an account. Run with HMLR_API_KEY, or with the CSVs in data/land-registry/inbox/. */
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

const API = 'https://use-land-property-data.service.gov.uk/api/v1';
export const ORDER_URL = 'https://search-property-information.service.gov.uk/search/search-by-title-number';
export const NOT = 'not recorded';
export const AREAS = ['Manchester', 'Salford', 'Oldham', 'Rochdale', 'Bury', 'Bolton', 'Stockport', 'Trafford', 'Tameside', 'Wigan', 'Liverpool', 'Birmingham', 'Bristol', 'South Gloucestershire', 'Cheltenham', 'Gloucester'];
const PER_COUNCIL = 25;

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') { cell += '"'; i += 1; }
        else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const header = rows.shift() || [];
  return rows.filter((item) => item.some((value) => value !== '')).map((item) => {
    const out = {};
    header.forEach((name, index) => { out[name.trim()] = item[index] == null ? '' : String(item[index]).trim(); });
    return out;
  });
}

function field(row, names) {
  for (const name of names) {
    if (row[name] != null && String(row[name]).trim() !== '') return String(row[name]).trim();
  }
  return '';
}

export function councilProprietor(row) {
  for (let i = 1; i <= 4; i += 1) {
    const name = field(row, ['Proprietor Name (' + i + ')']);
    const category = field(row, ['Proprietorship Category (' + i + ')']);
    const local = /local authority/i.test(category) || /\b(city|borough|county|district|metropolitan)?\s*council\b/i.test(name);
    const housing = /housing association/i.test(category) || /housing association/i.test(name);
    if (name && (local || housing)) return { name, kind: housing && !local ? 'Housing association' : 'Local authority' };
  }
  return null;
}

export function inArea(row) {
  const place = [row.District, row.County, row.Region, row['Property Address']].join(' ');
  return AREAS.some((area) => new RegExp('\\b' + area.replace(/ /g, '\\s+') + '\\b', 'i').test(place));
}

export function keepRow(row) {
  if (!/leasehold/i.test(field(row, ['Tenure']))) return null;
  const proprietor = councilProprietor(row);
  if (!proprietor || !inArea(row)) return null;
  return proprietor;
}

function yearsOf(term) {
  const match = String(term || '').match(/(\d+)\s*years?/i);
  return match ? Number(match[1]) : null;
}

function median(values) {
  const sorted = values.filter((value) => value != null).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function joinLeases(ccodRows, leaseRows) {
  const byTitle = new Map();
  (leaseRows || []).forEach((row) => {
    const title = field(row, ['Title Number', 'Unique Identifier']).toUpperCase();
    if (title) byTitle.set(title, row);
  });
  const groups = new Map();
  (ccodRows || []).forEach((row) => {
    const proprietor = keepRow(row);
    if (!proprietor) return;
    const title = field(row, ['Title Number']).toUpperCase();
    const lease = byTitle.get(title) || {};
    const item = {
      address: field(row, ['Property Address']) || NOT,
      postcode: field(row, ['Postcode']) || NOT,
      district: field(row, ['District']) || NOT,
      title: title || NOT,
      proprietorAdded: field(row, ['Date Proprietor Added']) || NOT,
      leaseStart: field(lease, ['Date of Lease', 'Lease Start Date', 'Start Date']) || NOT,
      term: field(lease, ['Term', 'Lease Term']) || NOT,
      premium: field(lease, ['Premium Price Paid', 'Premium']) || NOT,
      orderUrl: ORDER_URL
    };
    if (!groups.has(proprietor.name)) groups.set(proprietor.name, { name: proprietor.name, kind: proprietor.kind, rows: [] });
    groups.get(proprietor.name).rows.push(item);
  });
  const councils = [...groups.values()].map((group) => {
    group.rows.sort((a, b) => String(b.leaseStart).localeCompare(String(a.leaseStart)));
    const years = group.rows.map((row) => yearsOf(row.term)).filter((value) => value != null);
    const typical = median(years);
    const locations = [...new Set(group.rows.map((row) => row.district).filter((value) => value && value !== NOT))].sort();
    return {
      name: group.name,
      kind: group.kind,
      count: group.rows.length,
      shown: Math.min(group.rows.length, PER_COUNCIL),
      typicalTerm: typical == null ? NOT : typical + ' years',
      locations,
      rows: group.rows.slice(0, PER_COUNCIL)
    };
  }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return councils;
}

export function emptyFile(reason) {
  return {
    loaded: false,
    checked: new Date().toISOString().slice(0, 10),
    source: reason,
    note: 'Leases granted for seven years or less are not registered, so they are absent. Rent and the parties’ lease terms are not in these datasets. An online copy of the register is £7. Order it from the title-number search; the title number is on the row.',
    orderUrl: ORDER_URL,
    areas: AREAS,
    councils: []
  };
}

async function apiJson(key, endpoint) {
  const response = await fetch(API + endpoint, { headers: { Authorization: key, Accept: 'application/json' } });
  if (!response.ok) throw new Error('HTTP ' + response.status + ' from ' + endpoint);
  return response.json();
}

async function download(url, dest) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error('Download failed HTTP ' + response.status);
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(dest));
}

function unzipToCsv(zipPath, destDir) {
  return import('node:child_process').then(({ execFileSync }) => {
    execFileSync('unzip', ['-o', '-j', zipPath, '-d', destDir], { stdio: 'ignore' });
    return fs.readdirSync(destDir).filter((name) => /\.csv$/i.test(name)).map((name) => path.join(destDir, name));
  });
}

export async function loadInputs({ root, key }) {
  const inbox = path.join(root, 'data/land-registry/inbox');
  const dropped = fs.existsSync(inbox) ? fs.readdirSync(inbox) : [];
  const local = dropped.filter((name) => /\.(csv|zip)$/i.test(name));
  if (local.length) {
    const dir = path.join(inbox, 'unpacked');
    fs.mkdirSync(dir, { recursive: true });
    const csvs = [];
    for (const name of local) {
      const full = path.join(inbox, name);
      if (/\.zip$/i.test(name)) csvs.push(...await unzipToCsv(full, dir));
      else csvs.push(full);
    }
    return { files: csvs, via: 'inbox' };
  }
  if (!key) return { files: [], via: 'none' };
  const list = await apiJson(key, '/datasets');
  const names = (list.result || []).map((row) => row.name);
  const ccod = names.find((name) => name === 'ccod') || names.find((name) => /ccod/i.test(name));
  const leases = names.find((name) => /lease/i.test(name));
  if (!ccod || !leases) throw new Error('The API did not list both ccod and a registered-leases dataset. Listed: ' + names.join(', '));
  const files = [];
  for (const dataset of [ccod, leases]) {
    const meta = await apiJson(key, '/datasets/' + dataset);
    const full = (meta.result && meta.result.resources || []).find((row) => /FULL/i.test(row.file_name || row.name || ''));
    if (!full) throw new Error('No full file listed for ' + dataset);
    const link = await apiJson(key, '/datasets/' + dataset + '/' + encodeURIComponent(full.file_name));
    const url = link.result && (link.result.download_url || link.result.url || link.download_url);
    if (!url) throw new Error('No download URL for ' + full.file_name);
    const dest = path.join(inbox, full.file_name);
    fs.mkdirSync(inbox, { recursive: true });
    await download(url, dest);
    files.push(dest);
  }
  return { files, via: 'api' };
}

function readCsvFiles(files) {
  const ccod = [];
  const leases = [];
  files.forEach((file) => {
    const text = fs.readFileSync(file, 'utf8');
    const rows = parseCsv(text);
    const sample = rows[0] || {};
    if ('Tenure' in sample && 'Proprietor Name (1)' in sample) ccod.push(...rows);
    else if ('Date of Lease' in sample || 'Term' in sample || 'Premium Price Paid' in sample) leases.push(...rows);
  });
  return { ccod, leases };
}

export async function run({ root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), key = process.env.HMLR_API_KEY || '' } = {}) {
  const outPath = path.join(root, 'data/land-registry/council-leases.json');
  let inputs;
  try { inputs = await loadInputs({ root, key }); }
  catch (error) {
    const file = emptyFile(String(error.message || error));
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(file, null, 2) + '\n');
    return file;
  }
  if (!inputs.files.length) {
    if (fs.existsSync(outPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
        if (existing.loaded) return existing;
      } catch (error) { /* rewrite the empty file */ }
    }
    const file = emptyFile('No CCOD or Registered Leases file is available. The dataset API returned HTTP 403 without a key on 24 Nov 2026. Put HMLR_API_KEY in the environment, or drop the CSVs or zips into data/land-registry/inbox/.');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(file, null, 2) + '\n');
    return file;
  }
  const { ccod, leases } = readCsvFiles(inputs.files);
  if (!ccod.length) throw new Error('No CCOD rows were read. Expected columns include Tenure and Proprietor Name (1).');
  const councils = joinLeases(ccod, leases);
  const file = {
    loaded: true,
    checked: new Date().toISOString().slice(0, 10),
    source: inputs.via === 'api' ? 'HM Land Registry API' : 'Files in data/land-registry/inbox',
    leasesJoined: leases.length > 0,
    note: 'Leases granted for seven years or less are not registered, so they are absent. Rent and the parties’ lease terms are not in these datasets. An online copy of the register is £7.',
    orderUrl: ORDER_URL,
    areas: AREAS,
    councils
  };
  fs.writeFileSync(outPath, JSON.stringify(file, null, 2) + '\n');
  return file;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().then((file) => {
    console.log(file.loaded ? 'Wrote ' + file.councils.length + ' councils' : file.source);
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
