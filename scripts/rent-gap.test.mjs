import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const book = JSON.parse(fs.readFileSync('data/rent-scenarios.json', 'utf8'));
const window = {};
vm.runInNewContext(fs.readFileSync('assets/rent-gap.js', 'utf8'), {
  window, document: { getElementById: () => null, querySelector: () => null },
  fetch: () => Promise.reject(new Error('offline')), Promise, console
});
const table = window.lcRentGap.build(book);

test('every published pair is ranked and nothing unpublished is given a gap', () => {
  assert.equal(table.ranked.length, 12);
  assert.equal(table.missing.length, 13);
  assert.equal(table.ranked.some(row => row.beds === 'shared' || row.beds === '4' || row.area === 'Glasgow'), false);
  assert.equal(table.missing.filter(row => row.area === 'Glasgow').length, 5);
});

test('biggest and smallest lists keep every published comparison', () => {
  const names = table.ranked.map(row => row.area + ' ' + row.beds + ' ' + Math.round(row.gap));
  assert.equal(names.join(', '), [
    'Manchester 3 483',
    'Bristol 3 459',
    'Bristol 2 449',
    'Manchester 2 358',
    'Edinburgh 2 354',
    'Cheltenham 3 354',
    'Edinburgh 3 328',
    'Bristol 1 325',
    'Cheltenham 2 296',
    'Edinburgh 1 285',
    'Cheltenham 1 244',
    'Manchester 1 228'
  ].join(', '));
  assert.equal(table.ranked[0].omr, 1433);
  assert.equal(table.ranked[0].lha, 950);
  assert.ok(Math.abs(table.ranked[0].pct - 483 / 1433) < 1e-12);
  const small = table.ranked.slice().reverse().slice(0, 5).map(row => row.area + ' ' + row.beds + ' ' + Math.round(row.gap));
  assert.equal(small.join(', '), [
    'Manchester 1 228',
    'Cheltenham 1 244',
    'Edinburgh 1 285',
    'Cheltenham 2 296',
    'Bristol 1 325'
  ].join(', '));
});

test('a lead uses a stated bedroom and does not invent one', () => {
  window.lcRentGap.load = () => {};
  const ready = window.lcRentGap;
  // forLead needs the loaded table; attach it by rebuilding through the public build and a local assignment.
  const ctx = vm.createContext({
    window, document: { getElementById: () => null },
    fetch: () => Promise.resolve({ json: () => Promise.resolve(book) }), Promise, console, dmDraw: undefined, DM: undefined
  });
  vm.runInContext(fs.readFileSync('assets/rent-gap.js', 'utf8'), ctx);
  return ctx.window.lcRentGap.load().then(function () {
    const lead = ctx.window.lcRentGap.forLead({ city: 'City Of Bristol', pc: 'BS1 4ST', addr: '14 Highridge Road', auction: { type: '2 Bedroom Flat' } });
    assert.equal(lead.gap, 449);
    assert.equal(ctx.window.lcRentGap.forLead({ city: 'Glasgow', addr: '2 bedroom flat' }).gap, null);
    assert.equal(ctx.window.lcRentGap.forLead({ city: 'Edinburgh', addr: 'Flat 2', auction: { type: '2 Bedroom Flat' } }).gap, 354);
    assert.equal(ctx.window.lcRentGap.forLead({ city: 'Manchester', addr: '20 Amberley Walk, Chadderton, Oldham', auction: { type: '3 Bedroom House' } }).gap, null);
    assert.equal(ctx.window.lcRentGap.forLead({ city: 'Edinburgh', addr: 'Studio flat' }).label, 'Rent gap: bedrooms not stated');
    assert.equal(ready.bedsFrom('studio'), '');
  });
});
