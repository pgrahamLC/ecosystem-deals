import assert from 'node:assert/strict';
import {unitsFrom, residential, stageOf, valueSignals, distressFromText, scoreOf, lensesOf, companyName, clean} from './pipeline-model.mjs';

assert.equal(unitsFrom({other_fields: {n_dwellings: '14'}, description: 'Erection of 14 houses'}), 14);
assert.equal(residential({description: 'Single storey extension to dwelling'}), false);
assert.equal(residential({description: 'Erection of 14 houses', other_fields: {n_dwellings: 14}}), true);
assert.equal(stageOf({app_type: 'Reserved Matters', description: 'Reserved matters for 40 homes'}).status, 'reserved matters discharged');
assert.equal(stageOf({description: 'Works have commenced on site', app_type: 'Full'}).status, 'under construction');
assert.deepEqual(distressFromText('On the instructions of the Joint LPA Receivers'), ['receivership']);
assert.ok(valueSignals('Change of use from HMO to self-contained flats').includes('hmo conversion'));
assert.equal(companyName('See source'), '');
assert.equal(companyName('Jane Smith'), '');
assert.equal(companyName('Keepmoat Homes'), 'Keepmoat Homes');
const item = {distress: ['stalled'], value: ['refurbishment'], stageRank: 3};
const score = scoreOf(item);
assert.equal(score.total, 7);
assert.deepEqual(lensesOf(item), ['distress', 'value', 'advancing']);
assert.equal(clean('a; b\u2014c').includes(';'), false);
console.log('pipeline model tests passed');
