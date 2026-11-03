/* Public factual metadata only. No authentication, images, descriptions or legal packs. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, normalizeLot, dedupeLots, mergePrevious, sortLotsByGrade } from './auctions/core.mjs';
import { collect as auctionhouse } from './auctions/auctionhouse.mjs';
import { collect as scotland } from './auctions/scotland.mjs';
import { collect as publicCatalogue } from './auctions/public.mjs';
import { collect as renderCatalogue, closeBrowser } from './auctions/render.mjs';
import { collect as allsopCatalogue } from './auctions/allsop.mjs';
import { collect as catalogue } from './auctions/catalogues.mjs';

export async function run({ root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), fetchImpl = globalThis.fetch, now = new Date().toISOString() } = {}) {
  const config = JSON.parse(await fs.readFile(path.join(root, 'scripts/auctions/sources.json'), 'utf8'));
  const outDir = path.join(root, 'data/auctions');
  await fs.mkdir(outDir, { recursive: true });
  let previous = { lots: [] };
  try { previous = JSON.parse(await fs.readFile(path.join(outDir, 'lots.json'), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const sources = [], fresh = [];
  const robots = [];
  const client = createClient({ fetchImpl, userAgent: config.user_agent, delayMs: 700, timeoutMs: 25000, maxRequests: 5000, maxBytes: 5_000_000, enforceRobots: false,
    onPolicy: event => robots.push(event) });
  const adapters = { auctionhouse, scotland, public: publicCatalogue, render: renderCatalogue, allsop: allsopCatalogue, catalogue };
  for (const source of config.sources) {
    const row = { id: source.id, name: source.name, url: source.url, checked_at: now, status: 'skipped', reason: source.reason || '',
      lot_count: 0, commercial_excluded: 0, out_of_area_excluded: 0, unknown_excluded: 0, pages: 0,
      policy: source.policy, errors: [] };
    sources.push(row);
    if (!source.url) { row.status = 'failed'; row.reason = source.reason || 'No public catalogue URL. Nothing was invented.'; row.errors.push(row.reason); continue; }
    console.log('Collecting '+source.name+' at '+new Date().toISOString());
    try {
      const adapter = adapters[source.adapter] || adapters.public;
      const result = await adapter({ get: client, source, now });
      row.pages = result.pages || 0;
      row.successful_pages = result.successful_pages || 0;
      row.warnings = result.warnings || [];
      row.commercial_excluded = result.commercial_excluded || 0;
      row.errors = result.errors || [];
      for (const raw of result.lots || []) {
        const normalized = normalizeLot(raw, { source, now });
        if (normalized.lot) { fresh.push(normalized.lot); row.lot_count++; }
        else if (normalized.reason === 'commercial') row.commercial_excluded++;
        else if (normalized.reason === 'out_of_area') row.out_of_area_excluded++;
        else row.unknown_excluded++;
      }
      if (row.unknown_excluded) row.warnings = (row.warnings || []).concat(row.unknown_excluded+' records had an unverified field and were still kept when an address and status were present.');
      const blocked = (result.errors || []).some(e => /login|captcha|challenge/i.test(e));
      row.status = blocked && !row.successful_pages ? 'failed' : row.successful_pages > 0 ? 'live' : 'failed';
      const note = (result.warnings || []).filter(item => /Spot-check|No in-area|lot pages|SearchApi|sitemap/i.test(item)).slice(0, 2).join(' ');
      row.reason = row.status === 'live'
        ? 'Public catalogue pages read. Commercial lots are included and tagged. ' + [note, row.errors.join('; ')].filter(Boolean).join(' ')
        : ([row.errors.join('; '), note].filter(Boolean).join(' ') || source.reason || 'No catalogue page could be read.');
      if (row.successful_pages === 0) { row.status = 'failed'; row.reason = row.reason || 'No catalogue/result pages successfully read.'; }
    } catch (e) { row.status = 'failed'; row.reason = String(e.message || e); row.errors.push(row.reason); }
    console.log(source.name+': '+row.status+', '+row.lot_count+' eligible lots, '+row.commercial_excluded+' commercial exclusions.');
  }
  await closeBrowser().catch(() => {});
  const unique = dedupeLots(fresh);
  const retained = mergePrevious(unique, previous.lots || [], { sources }, now);
  const lots = sortLotsByGrade(dedupeLots(Array.isArray(retained) ? retained : retained.lots || []));
  const success = sources.some(s => s.status === 'live' || s.status === 'partial');
  const lastSuccess = success ? now : previous.updated_at || null;
  const counts = Object.fromEntries(config.towns.map(town => [town, lots.filter(l => l.town === town && !l.stale).length]));
  const statuses = Object.fromEntries(config.towns.map(town => [town, Object.fromEntries(['upcoming','sold','unsold','withdrawn'].map(status => [status, lots.filter(l => l.town === town && l.status === status && !l.stale).length]))]));
  const coverage = { schema_version: 1, updated_at: now, last_successful_refresh: lastSuccess,
    scope: 'Target post towns only, not all properties in surrounding auction regions. Counts are fresh, deduplicated residential lots actually read; not a census. Exclusions refer to inspected records, not site-wide totals.',
    metadata_only: true, sources, robots, counts_by_town: counts, counts_by_town_and_status: statuses,
    total_fresh: lots.filter(l => !l.stale).length, total_stale: lots.filter(l => l.stale).length,
    commercial_excluded: sources.reduce((n, s) => n + s.commercial_excluded, 0),
    duplicates_removed: fresh.length - unique.length };
  for (const row of sources) {
    const mine = lots.filter(lot => !lot.stale && ((lot.sources || []).some(item => item.name === row.name) || lot.source === row.name));
    row.lot_count = mine.length;
    row.by_town = {};
    row.by_tag = {};
    for (const lot of mine) {
      row.by_town[lot.town] = (row.by_town[lot.town] || 0) + 1;
      const tag = lot.sale_tag || 'Auction';
      row.by_tag[tag] = (row.by_tag[tag] || 0) + 1;
    }
  }
  // Atomic single-file writes. The workflow commits both files together as one snapshot.
  for (const [name, data] of [['lots.json', { schema_version: 1, updated_at: lastSuccess, attempted_at: now, lots }], ['coverage.json', coverage]]) {
    const file = path.join(outDir, name);
    await fs.writeFile(file + '.tmp', JSON.stringify(data, null, 2) + '\n');
    await fs.rename(file + '.tmp', file);
  }
  const lines = ['# Auction collection', '', `Checked: ${now}`, '', `Fresh: ${coverage.total_fresh}; stale: ${coverage.total_stale}; commercial lots are kept and tagged, not dropped.`, '', '## Town counts (fresh, deduplicated)', ...config.towns.map(t => `- ${t}: ${counts[t]}`), '', '## Source coverage', ...sources.map(s => `- **${s.name}**: ${s.status}; ${s.lot_count} lots (${Object.entries(s.by_town || {}).map(([town, n]) => town + ' ' + n).join(', ') || 'none'}); tags ${Object.entries(s.by_tag || {}).map(([tag, n]) => tag + ' ' + n).join(', ') || 'none'}. ${s.reason}`), '', 'No lot or sold price is fabricated. A starting/opening/current bid is not a guide or sale price. Receiver and Lender pills are set only when the lot page states an instruction. Missing results do not mean no sales occurred. Unavailable-source rows retain their original scraped_at and are labelled stale.'];
  await fs.writeFile(path.join(outDir, 'coverage.md'), lines.join('\n') + '\n');
  console.log(JSON.stringify({ checked_at: now, counts_by_town: counts, fresh: coverage.total_fresh, stale: coverage.total_stale, sources: sources.map(s => ({ name: s.name, status: s.status, lots: s.lot_count })) }, null, 2));
  return coverage;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await run();
  // Preserve diagnostic JSON while making complete collection failure visible in Actions.
  if (!result.sources.some(s => s.status === 'live' || s.status === 'partial')) process.exitCode = 1;
}
