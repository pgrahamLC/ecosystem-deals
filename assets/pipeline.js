/* Development pipeline board. Reads data/market-entry/pipeline.json. */
(function (root) {
  'use strict';
  const LENSES = [['distress', 'Distressed'], ['value', 'Value-add'], ['advancing', 'Advancing']];
  let book = null;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  }
  function use(next) { book = next || null; return book; }
  function rows(area, lens) {
    const items = (book && book.items) || [];
    return items.filter((item) => (!area || item.area === area) && (!lens || (item.lenses || []).indexOf(lens) >= 0));
  }
  function counts(area) {
    return (book && book.counts && book.counts[area]) || {schemes: 0, granted: 0, grantedUnits: 0, building: 0, buildingUnits: 0, reserved: 0, distress: 0, value: 0, advancing: 0};
  }
  function buyTag(area, item) {
    if (!root.BuyBox) return 'not yet recorded';
    const lot = {title: item.description || item.name, address: item.name, postcode: item.postcode, lot_type: item.kind === 'lot' ? 'Flat' : 'Development'};
    const tag = root.BuyBox.classify(area, lot);
    return tag.label + '. ' + tag.reason;
  }
  function tiles(area) {
    const row = counts(area);
    const cell = (label, value, note) => '<div class="bd-tile"><span>' + label + '</span><b>' + value + '</b>' + (note ? '<span>' + note + '</span>' : '') + '</div>';
    return '<div class="bd-kpis">'
      + cell('Granted schemes', row.granted, (row.grantedUnits || 0) + ' homes stated')
      + cell('Under construction', row.building, (row.buildingUnits || 0) + ' homes stated')
      + cell('Reserved matters', row.reserved, 'Discharged where the decision says so')
      + cell('Distressed', row.distress, 'Public signals only')
      + cell('Value-add', row.value, 'Stock we can enhance')
      + cell('Advancing', row.advancing, 'Moved on since the grant')
      + '</div>';
  }
  function chart(area, lens) {
    const groups = [
      ['granted', 'Granted', counts(area).granted],
      ['building', 'Under construction', counts(area).building],
      ['reserved', 'Reserved matters', counts(area).reserved],
      ['distress', 'Distressed', counts(area).distress],
      ['value', 'Value-add', counts(area).value],
      ['advancing', 'Advancing', counts(area).advancing]
    ];
    const max = Math.max(1, ...groups.map((row) => row[2]));
    return groups.map((row) => '<button type="button" class="bd-bar' + (lens === row[0] ? ' on' : '') + (row[2] ? '' : ' muted') + '" data-kind="pipe" data-id="' + row[0] + '"><span>' + row[1] + '</span><i><b style="width:' + (row[2] / max * 100) + '%"></b></i><em>' + row[2] + '</em></button>').join('');
  }
  function filters(lens) {
    const all = '<button type="button" data-kind="pipe" data-id=""' + (!lens ? ' class="on"' : '') + '>All</button>';
    return '<div class="bd-auc">' + all + LENSES.map((row) => '<button type="button" data-kind="pipe" data-id="' + row[0] + '"' + (lens === row[0] ? ' class="on"' : '') + '>' + row[1] + '</button>').join('') + '</div>';
  }
  function developers() {
    const list = (book && book.developers) || [];
    if (!list.length) return '';
    return '<article class="bd-chart"><h2>Developers to watch</h2><div class="bd-auc">' + list.map((row) => '<span class="bd-src" title="' + esc(row.locationFocus || '') + '"><b>' + esc(row.name) + '</b> ' + esc(row.schemes) + '</span>').join('') + '</div><p class="bd-src">2nd Street Developments Ltd is on the public company register. Schemes in these areas are not yet recorded. Its registered office is in Kent.</p></article>';
  }
  function line(item, area) {
    const bits = [
      item.council || 'Council not yet recorded',
      item.units == null ? 'Homes not yet recorded' : item.units + ' homes',
      item.approvalDate || 'Approval date not yet recorded',
      item.status || 'not yet recorded',
      item.developer && item.developer !== 'not yet recorded' ? item.developer : 'Developer not yet recorded'
    ];
    const flags = (item.lenses || []).join(', ') || 'no lens';
    return '<li><b>' + esc(item.name) + '</b>. ' + esc(bits.join('. ')) + '. ' + esc(flags) + '. Score ' + ((item.score && item.score.total) || 0) + '. Buy box: ' + esc(buyTag(area, item)) + '. ' + (item.source ? '<a href="' + esc(item.source) + '" target="_blank" rel="noopener">Source</a>' : 'Source not yet recorded') + '</li>';
  }
  function card(area, lens) {
    if (!book) return '';
    const list = rows(area, lens === 'granted' || lens === 'building' || lens === 'reserved' ? '' : lens);
    const narrowed = lens === 'granted' ? list.filter((item) => item.newSupply && item.approvalDate) : lens === 'building' ? list.filter((item) => item.status === 'under construction') : lens === 'reserved' ? list.filter((item) => item.status === 'reserved matters discharged') : list;
    const top = narrowed.slice().sort((a, b) => ((b.score && b.score.total) || 0) - ((a.score && a.score.total) || 0)).slice(0, 10);
    return '<article class="bd-chart" id="dev-pipeline"><h2>Development pipeline</h2><p class="deal-help">Public PlanIt decisions and the current auction file. A blank is not yet recorded. Reserved matters discharged is the base buy box test for a consented site.</p>'
      + (book.limits ? '<p class="bd-src">' + esc(book.limits) + '</p>' : '')
      + tiles(area)
      + filters(lens)
      + '<h3>By status and lens</h3>' + chart(area, lens)
      + '<h3>Top 10</h3><ul class="bd-take">' + (top.length ? top.map((item) => line(item, area)).join('') : '<li>Nothing is recorded for this filter.</li>') + '</ul>'
      + '<details class="bd-fold"><summary>Show the list (' + narrowed.length + ')</summary><ul class="bd-take">' + narrowed.slice(0, 40).map((item) => line(item, area)).join('') + '</ul></details></article>'
      + developers();
  }
  function areaChart() {
    if (!book) return '';
    const max = Math.max(1, ...AREAS().map((area) => counts(area).schemes));
    const bars = AREAS().map((area) => '<button type="button" class="bd-bar" data-act="req-board" data-area="' + esc(area) + '"><span>' + esc(area) + '</span><i><b style="width:' + (counts(area).schemes / max * 100) + '%"></b></i><em>' + counts(area).schemes + '</em></button>').join('');
    const lenses = AREAS().map((area) => area + ' ' + counts(area).distress + ' / ' + counts(area).value + ' / ' + counts(area).advancing).join('. ');
    return '<article class="bd-chart"><h2>Development pipeline</h2><p class="deal-help">Schemes on the public file. The count after each name is distressed, value-add, then advancing.</p>' + bars + '<p class="bd-src">' + esc(lenses) + '.</p></article>';
  }
  function AREAS() { return ['Manchester', 'Glasgow', 'Edinburgh', 'Bristol', 'Cheltenham', 'Liverpool', 'Cheshire', 'Birmingham']; }

  root.Pipeline = Object.freeze({use, card, areaChart, counts, rows});
})(typeof globalThis !== 'undefined' ? globalThis : this);
