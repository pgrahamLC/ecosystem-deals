import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, keepRow, joinLeases, NOT } from './council-leases.mjs';

const ccod = `Title Number,Tenure,Property Address,District,County,Region,Postcode,Multiple Address Indicator,Price Paid,Proprietor Name (1),Company Registration No. (1),Proprietorship Category (1),Proprietor (1) Address (1),Proprietor (1) Address (2),Proprietor (1) Address (3),Proprietor Name (2),Company Registration No. (2),Proprietorship Category (2),Proprietor (2) Address (1),Proprietor (2) Address (2),Proprietor (2) Address (3),Proprietor Name (3),Company Registration No. (3),Proprietorship Category (3),Proprietor (3) Address (1),Proprietor (3) Address (2),Proprietor (3) Address (3),Proprietor Name (4),Company Registration No. (4),Proprietorship Category (4),Proprietor (4) Address (1),Proprietor (4) Address (2),Proprietor (4) Address (3),Date Proprietor Added,Additional Proprietor Indicator
BL12345,Leasehold,"1 Example Street, Bristol",Bristol,Bristol,South West,BS1 1AA,N,,Bristol City Council,,Local Authority,,,,,,,,,,,, ,,,,,,,,,,,2020-01-02,N
MAN9,Freehold,"2 Freehold Road, Manchester",Manchester,Greater Manchester,North West,M1 1AA,N,,Manchester City Council,,Local Authority,,,,,,,,,,,,, ,,,,,,,,,,2021-01-01,N
LON1,Leasehold,"9 Company House, London",Camden,Greater London,London,NW1 1AA,N,,Example Homes Ltd,12345678,Limited Company,,,,,,,,,,,,, ,,,,,,,,,,2019-05-01,N
WG7,Leasehold,"4 Lease Lane, Wigan",Wigan,Greater Manchester,North West,WN1 1AA,N,,Wigan Borough Council,,Local Authority,,,,,,,,,,,,, ,,,,,,,,,,2018-06-01,N
`;

const leases = `Title Number,Date of Lease,Term,Premium Price Paid
BL12345,2019-04-01,125 years,150000
WG7,2018-01-01,99 years,
`;

test('a quoted council leasehold row is kept and a freehold or company row is not', () => {
  const rows = parseCsv(ccod);
  assert.equal(rows.length, 4);
  assert.equal(rows[0]['Property Address'], '1 Example Street, Bristol');
  assert.equal(keepRow(rows[0]).name, 'Bristol City Council');
  assert.equal(keepRow(rows[1]), null);
  assert.equal(keepRow(rows[2]), null);
  assert.equal(keepRow(rows[3]).name, 'Wigan Borough Council');
});

test('registered lease date, term and premium join on the title number', () => {
  const councils = joinLeases(parseCsv(ccod), parseCsv(leases));
  const bristol = councils.find((row) => row.name === 'Bristol City Council');
  assert.equal(bristol.count, 1);
  assert.equal(bristol.rows[0].leaseStart, '2019-04-01');
  assert.equal(bristol.rows[0].term, '125 years');
  assert.equal(bristol.rows[0].premium, '150000');
  assert.equal(bristol.typicalTerm, '125 years');
  const wigan = councils.find((row) => row.name === 'Wigan Borough Council');
  assert.equal(wigan.rows[0].premium, NOT);
  assert.match(wigan.rows[0].orderUrl, /search-by-title-number$/);
});
