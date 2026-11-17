import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('Allsop is disabled and no Allsop lot remains in the published feed', () => {
  const sources = JSON.parse(fs.readFileSync(new URL('./sources.json', import.meta.url), 'utf8'));
  const allsop = sources.sources.find((row) => row.id === 'allsop');
  assert.equal(allsop.enabled, false);
  const lots = JSON.parse(fs.readFileSync(new URL('../../data/auctions/lots.json', import.meta.url), 'utf8')).lots;
  const hit = lots.find((lot) => /allsop/i.test([lot.source, lot.source_url, JSON.stringify(lot.sources || [])].join(' ')));
  assert.equal(hit, undefined);
});
