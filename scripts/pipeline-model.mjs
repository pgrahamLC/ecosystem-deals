/* Public development pipeline rules. Unknown stays not yet recorded. */

export const AREAS = ['Manchester', 'Glasgow', 'Edinburgh', 'Bristol', 'Cheltenham', 'Liverpool', 'Cheshire', 'Birmingham'];

export const AUTHORITIES = {
  Manchester: ['Manchester', 'Salford', 'Trafford', 'Stockport', 'Tameside', 'Oldham', 'Rochdale', 'Bury', 'Bolton', 'Wigan'],
  Liverpool: ['Liverpool', 'Wirral', 'Knowsley', 'Sefton', 'St Helens'],
  Cheshire: ['Cheshire East', 'Cheshire West', 'Warrington', 'Halton'],
  Birmingham: ['Birmingham', 'Solihull', 'Sandwell', 'Dudley', 'Walsall'],
  Bristol: ['Bristol'],
  Cheltenham: ['Cheltenham'],
  Glasgow: ['Glasgow'],
  Edinburgh: ['Edinburgh', 'City of Edinburgh']
};

const COMPANY = /\b(ltd|limited|llp|plc|homes|developments|development|properties|property|group|holdings|housing|estates|partnership)\b/i;

export function clean(value) {
  return String(value == null ? '' : value).replace(/\u2014|\u2013/g, ',').replace(/;/g, ',').replace(/\s+/g, ' ').trim();
}

export function addMonths(day, months) {
  const [y, m, d] = String(day).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, d));
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return date.getUTCFullYear() + '-' + mm + '-' + dd;
}

export function unitsFrom(record) {
  const raw = record && record.other_fields && record.other_fields.n_dwellings;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return n;
  const desc = String((record && record.description) || '');
  const match = desc.match(/\b(\d{1,4})\s*(?:no\.?\s*)?(?:new\s+)?(?:residential\s+)?(?:dwellings|homes|houses|flats|apartments)\b/i)
    || desc.match(/\bup to (\d{1,4})\s*(?:new\s+)?(?:residential\s+)?(?:dwellings|homes|houses|flats|apartments)\b/i);
  return match ? Number(match[1]) : null;
}

export function residential(record) {
  const desc = String((record && record.description) || '');
  const units = unitsFrom(record);
  const householder = /\b(householder|single[- ]storey extension|loft conversion|dormer|porch|conservatory|dropped kerb)\b/i.test(desc);
  if (householder && !(units >= 2)) return false;
  if (units >= 2) return true;
  return /\b(residential development|new dwellings|new homes|erection of \d|construction of \d|apartments|flats)\b/i.test(desc);
}

export function companyName(value) {
  const text = clean(value);
  if (!text || /see source|not stated|unknown/i.test(text)) return '';
  if (!COMPANY.test(text)) return '';
  return text;
}

export function stageOf(record) {
  const desc = String((record && record.description) || '');
  const type = String((record && record.app_type) || '') + ' ' + String((record && record.other_fields && record.other_fields.application_type) || '');
  const blob = desc + ' ' + type;
  if (/\b(lawful commencement|commencement of|has commenced|works have commenced|under construction|started on site|building control commencement)\b/i.test(desc)) {
    return {status: 'under construction', stage: 'under construction', rank: 4};
  }
  if (/\breserved matters\b/i.test(type) || record && record.app_type === 'Reserved Matters') {
    return {status: 'reserved matters discharged', stage: 'reserved matters', rank: 2};
  }
  if (/\b(variation|section 73|s73|non-material|discharge of condition|conditions?)\b/i.test(type) || /\b(variation of condition|non-material amendment|discharge of condition)\b/i.test(desc)) {
    return {status: 'granted', stage: 'conditions or variation', rank: 3};
  }
  return {status: 'granted', stage: 'granted', rank: 1};
}

export function valueSignals(text) {
  const blob = String(text || '');
  const found = [];
  if (/\b(unmodernis|refurbish|in need of|tired|modernis|renovat)\w*/i.test(blob)) found.push('refurbishment');
  if (/\b(permitted development|prior approval|change of use)\b/i.test(blob)) found.push('change of use');
  if (/\bhmo\b/i.test(blob) && /\b(flat|self-contained|apartment|dwelling)\b/i.test(blob)) found.push('hmo conversion');
  if (/\b(accessib\w*|adapted|wheelchair)\b/i.test(blob)) found.push('adapted');
  return found;
}

export function distressFromText(text) {
  const blob = String(text || '');
  const found = [];
  if (/\breceiv/i.test(blob)) found.push('receivership');
  if (/\badministrat/i.test(blob)) found.push('administration');
  if (/\brepossess/i.test(blob)) found.push('repossession');
  return found;
}

export function scoreOf(item) {
  let distress = 0;
  let value = 0;
  let stage = item.stageRank || 0;
  const signals = item.distress || [];
  if (signals.includes('receivership')) distress += 3;
  if (signals.includes('administration') || signals.includes('repossession')) distress += 2;
  if (signals.includes('stalled')) distress += 2;
  if (signals.includes('near expiry')) distress += 2;
  if (signals.includes('gazette')) distress += 3;
  const adds = item.value || [];
  if (adds.includes('refurbishment')) value += 2;
  if (adds.includes('change of use')) value += 2;
  if (adds.includes('hmo conversion')) value += 2;
  if (adds.includes('adapted')) value += 2;
  if (adds.includes('below median')) value += 1;
  return {distress, value, stage, total: distress + value + stage};
}

export function lensesOf(item) {
  const lenses = [];
  if ((item.distress || []).length) lenses.push('distress');
  if ((item.value || []).length) lenses.push('value');
  if ((item.stageRank || 0) >= 2) lenses.push('advancing');
  return lenses;
}

export function top(items, area, limit) {
  return items.filter((item) => item.area === area)
    .slice()
    .sort((a, b) => b.score.total - a.score.total || (b.units || 0) - (a.units || 0) || String(a.name).localeCompare(String(b.name)))
    .slice(0, limit || 10);
}

export function summarise(items) {
  const out = {};
  AREAS.forEach((area) => {
    const rows = items.filter((item) => item.area === area);
    const granted = rows.filter((item) => item.kind === 'planning' && item.newSupply && item.approvalDate);
    const building = rows.filter((item) => item.status === 'under construction');
    const reserved = rows.filter((item) => item.status === 'reserved matters discharged');
    out[area] = {
      schemes: rows.length,
      granted: granted.length,
      grantedUnits: granted.reduce((sum, item) => sum + (item.units || 0), 0),
      building: building.length,
      buildingUnits: building.reduce((sum, item) => sum + (item.units || 0), 0),
      reserved: reserved.length,
      distress: rows.filter((item) => item.lenses.includes('distress')).length,
      value: rows.filter((item) => item.lenses.includes('value')).length,
      advancing: rows.filter((item) => item.lenses.includes('advancing')).length
    };
  });
  return out;
}
