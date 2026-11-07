import test from 'node:test';
import assert from 'node:assert/strict';
import { cardsFromHtml } from './catalogues.mjs';

const PAGE = 'https://www.cliveemson.co.uk/properties/268/88/';

test('a lot page date and SOLD PRIOR beside the address are not read from the page head', () => {
  const html = `<!doctype html><html><head><link rel="stylesheet" href="/css/master.css?v=5746"><title>Auction Dates</title></head><body>
<nav>Unsold Lots - Still Available Auction Catalogue</nav>
${'<p>catalogue navigation</p>'.repeat(40)}
<p>Important All lots are sold subject to the Common Auction Conditions.</p>
${'<p>legal text</p>'.repeat(40)}
<h1>Lot 88 Land With Potential<em style="display:none;">Auction Date:<br>24th September 2026</em></h1>
<h2>Land Adj Jemaro, Hyde Lane, Swindon Village, Cheltenham, Gloucestershire, GL51 9QN</h2>
<div class="statusBox status_soldprior"><label style="color:red;">SOLD PRIOR</label></div>
<address class="lot-address"><i></i> Land Adj Jemaro, Hyde Lane, Swindon Village, Cheltenham, Gloucestershire</address>
</body></html>`;
  const cards = cardsFromHtml(html, PAGE);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].status, 'sold');
  assert.equal(cards[0].auction_date, '2026-09-24');
  assert.equal(cards[0].address, 'Land Adj Jemaro, Hyde Lane, Swindon Village, Cheltenham, Gloucestershire, GL51 9QN');
  assert.equal(cards[0].postcode, 'GL51 9QN');
  assert.equal(cards[0].town, 'Cheltenham');
  assert.equal(cards[0].source_url, PAGE);
  assert.doesNotMatch(cards[0].address, /auction date/i);
});

test('boilerplate that every lot is sold does not mark a later dated lot sold', () => {
  const html = `<!doctype html><html><body>
<nav>Unsold Lots - Still Available</nav>
<p>Important All lots are sold subject to the Common Auction Conditions.</p>
${'<p>spacer</p>'.repeat(80)}
<h2>Auction 18th November 2026 10 Lansdown Place, Cheltenham, Gloucestershire, GL50 2HU</h2>
</body></html>`;
  const cards = cardsFromHtml(html, 'https://www.example.test/lot/10');
  assert.equal(cards.length, 1);
  assert.equal(cards[0].status, 'upcoming');
  assert.equal(cards[0].auction_date, '2026-11-18');
  assert.match(cards[0].address, /Lansdown Place/);
});
