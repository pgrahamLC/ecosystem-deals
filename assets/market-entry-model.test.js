import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await import('./market-entry-model.js');
const M = globalThis.MarketEntryModel;

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(root, 'data/market-entry', name), 'utf8'));
}

const seeds = {
  checklist: read('checklist.json'),
  agents: read('agents.json'),
  stakeholders: read('stakeholders.json'),
  criteria: read('criteria.json'),
  intake: read('intake.json')
};
const state = M.build(seeds);

const banned = /[;—–]/;
for (const file of ['checklist.json', 'agents.json', 'stakeholders.json', 'criteria.json', 'intake.json']) {
  const text = fs.readFileSync(path.join(root, 'data/market-entry', file), 'utf8');
  assert.equal(banned.test(text), false, file + ' uses a semicolon or dash that the copy style does not allow');
}

const manchester = state.checklists.Manchester.workstreams.find((row) => row.id === 'portfolio').items.find((row) => row.id === 'manchester');
assert.equal(manchester.text, 'Is Manchester a good market for you?');
assert.equal(manchester.done, true);
assert.equal(manchester.notes, 'Yes');
assert.equal(manchester.status, 'done');
assert.equal(M.summarise(state.checklists.Manchester).done, 1);

const glasgow = state.checklists.Glasgow.workstreams.find((row) => row.id === 'portfolio').items.find((row) => row.id === 'manchester');
assert.equal(glasgow.text, 'Is Glasgow a good market for you?');
assert.equal(glasgow.done, false);
assert.equal(glasgow.notes, '');
assert.equal(glasgow.links.some((link) => /GM-035/.test(link.href || '')), false);
assert.equal(state.checklists.Glasgow.workstreams.map((row) => row.title).join('|'), 'Local Authority 10-year Lease Agreements|Assembling A Portfolio');

let next = M.setDone(state, 'Glasgow', 'la-lease', 'offer', true);
assert.equal(next.checklists.Glasgow.workstreams[0].items[0].status, 'done');
assert.equal(state.checklists.Glasgow.workstreams[0].items[0].done, false);
next = M.addItem(next, 'Glasgow', 'la-lease', 'Who is on the ground?').state;
assert.equal(next.checklists.Glasgow.workstreams[0].items.at(-1).text, 'Who is on the ground?');
next = M.deleteItem(next, 'Glasgow', 'la-lease', next.checklists.Glasgow.workstreams[0].items.at(-1).id).state;
next = M.addWorkstream(next, 'Bristol', 'Local contacts').state;
assert.equal(next.checklists.Bristol.workstreams.at(-1).title, 'Local contacts');
next = M.deleteWorkstream(next, 'Bristol', next.checklists.Bristol.workstreams.at(-1).id).state;
assert.equal(next.checklists.Bristol.workstreams.length, 2);

const round = M.parseImport(M.serialise(next));
assert.equal(round.error, undefined);
assert.equal(round.state.checklists.Manchester.workstreams[1].items[0].notes, 'Yes');
assert.equal(round.state.agents.length, state.agents.length);

const partnerFile = {workstreams: [{id: 'portfolio', title: 'Assembling A Portfolio', items: [{id: 'manchester', text: 'Is Manchester a good market for you?', done: true, notes: 'Yes', status: 'done'}]}]};
const imported = M.replaceChecklist(state, 'Liverpool', partnerFile);
assert.equal(imported.error, '');
assert.equal(imported.state.checklists.Liverpool.workstreams.length, 1);
assert.equal(imported.state.checklists.Manchester.workstreams.length, 2);

const saved = M.saveAgent(state, {area: 'Manchester', name: 'Test Land', type: 'Land agent', website: 'https://example.com/land', contact: '', alertStatus: 'requested', alertDate: '2026-11-17', coverage: 'Manchester'});
assert.equal(saved.error, '');
assert.equal(saved.state.agents.filter((row) => row.name === 'Test Land').length, 1);
const removed = M.deleteAgent(saved.state, saved.id);
assert.equal(removed.agents.some((row) => row.id === saved.id), false);
assert.equal(M.saveAgent(state, {area: 'Manchester', name: '', type: 'Other'}).error, 'An agent needs a name.');
assert.equal(M.saveAgent(state, {area: 'Manchester', name: 'Bad', website: 'javascript:alert(1)'}).error, 'Agent website must be an http or https link.');

const person = M.saveStakeholder(state, {area: 'Edinburgh', name: 'A charity', category: 'charity', role: 'Local charity', relationship: 'introduced', website: 'https://example.org/'});
assert.equal(person.error, '');
const deal = M.saveIntake(person.state, {area: 'Edinburgh', date: '2026-11-17', sourceKind: 'stakeholder', sourceId: person.id, sourceName: 'A charity', address: '1 High Street', postcode: 'eh1 1aa', type: 'House', beds: '3', planning: 'Not stated', guide: '£250,000', notes: 'Brought off market', status: 'New'});
assert.equal(deal.error, '');
assert.equal(deal.state.intake[0].postcode, 'EH1 1AA');
assert.equal(deal.state.intake[0].guide, '250000');
assert.equal(deal.state.intake[0].planning, 'Not stated');
assert.equal(M.saveIntake(state, {area: 'Edinburgh', planning: 'Reserved matters discharged', beds: 'maybe'}).error.includes('Beds'), true);

assert.equal(state.criteria.Birmingham.summary, 'Sites with planning where reserved matters have been discharged, and 3 to 4 bed homes.');
assert.equal(state.criteria.Birmingham.bedsMin, 3);
assert.equal(state.criteria.Birmingham.bedsMax, 4);
const tuned = M.setCriteria(state, 'Birmingham', {summary: '4 bed only', bedsMin: 4, bedsMax: 4, planning: 'Reserved matters discharged', notes: ''});
assert.deepEqual(M.bedCounts('A 3 bedroom house and a 4-bed home'), [3, 4]);
assert.equal(M.reservedDischarged('planning permission for 12 apartments'), false);
assert.equal(M.reservedDischarged('reserved matters have been discharged'), true);
const house = {title: '3 bedroom house', address: '1 Road', town: 'Birmingham', status: 'upcoming', auction_date: '2026-12-01', grade_evidence: ''};
assert.equal(M.classifyLot(house, state.criteria.Birmingham).partial, true);
assert.equal(M.classifyLot(house, state.criteria.Birmingham).full, false);
assert.equal(M.classifyLot(house, state.criteria.Birmingham).planning, 'Not stated');
assert.equal(M.classifyLot(house, tuned.criteria.Birmingham).bedMatch, false);
const discharged = {title: '3 bed house', grade_evidence: 'Reserved matters have been discharged.'};
assert.equal(M.classifyLot(discharged, state.criteria.Manchester).full, true);
const consented = {title: 'Land', grade_evidence: 'Consent for 12 apartments'};
assert.equal(M.classifyLot(consented, state.criteria.Manchester).planning, 'Planning is mentioned. Reserved matters are not stated');
assert.equal(M.classifyLot(consented, state.criteria.Manchester).full, false);
assert.equal(M.currentLot({status: 'sold', auction_date: '2026-12-01'}, '2026-11-17'), false);
assert.equal(M.currentLot({status: 'upcoming', auction_date: '2026-10-01'}, '2026-11-17'), false);
assert.equal(M.currentLot(house, '2026-11-17'), true);

const names = new Set();
for (const agent of state.agents) {
  assert.equal(M.AREAS.includes(agent.area), true, agent.name);
  assert.equal(agent.contact, '');
  assert.equal(agent.alertStatus, 'not-registered');
  assert.equal(/^https?:\/\//.test(agent.website || agent.sourceUrl), true, agent.name);
  assert.equal(names.has(agent.id), false, agent.id);
  names.add(agent.id);
}
assert.equal(state.agents.some((row) => row.area === 'Manchester' && row.name === 'Auction House Manchester'), true);
assert.equal(state.agents.some((row) => row.area === 'Glasgow' && /Auction House Scotland|Future Property Auctions|Braveheart/.test(row.name)), true);
assert.equal(state.agents.some((row) => row.area === 'Cheshire' && row.name === 'Cheshire East Council'), true);
assert.equal(state.stakeholders.some((row) => row.category === 'contractor'), false);
assert.equal(state.stakeholders.filter((row) => row.area === 'Glasgow' && row.category === 'funder').length, 1);
assert.equal(state.intake.length, 0);
assert.equal(M.agentCategory('Auction house'), 'agent');
assert.equal(M.agentCategory('Local authority contact'), 'local-authority');
assert.equal(M.relationshipFromAlert('registered'), 'active');

console.log('market-entry model tests passed');
