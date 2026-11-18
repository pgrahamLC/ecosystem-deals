/* Live location test. Status wording only. */
(function (root) {
  'use strict';
  const ROUTES = ['Mack Living', 'LHA', 'Both'];
  function blank() {
    return {availability: 'Needs evidence', availabilityNote: 'Not on file.', route: 'Needs evidence', routeNote: 'Not on file.', manager: 'Needs evidence', managerNote: 'Not on file.'};
  }
  function rowFor(book, area) {
    const row = book && book.areas && book.areas[area];
    return Object.assign(blank(), row || {});
  }
  function overall(row) {
    const routeOk = ROUTES.indexOf(row.route) >= 0;
    if (row.availability === 'Yes' && routeOk && row.manager === 'Yes') return 'Live';
    if (row.availability === 'No' || row.manager === 'No' || row.route === 'No') return 'Not live';
    return 'Needs evidence';
  }
  function status(book, area) {
    const row = rowFor(book, area);
    return Object.assign({}, row, {area: area, overall: overall(row)});
  }
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
  }
  function toneFor(value, kind) {
    if (kind === 'route') {
      if (ROUTES.indexOf(value) >= 0) return 'pass';
      if (value === 'No') return 'fail';
      return 'wait';
    }
    if (value === 'Yes' || value === 'Live') return 'pass';
    if (value === 'No' || value === 'Not live') return 'fail';
    return 'wait';
  }
  function badge(value, kind, large) {
    return '<b class="verdict-badge ' + (large ? 'lg ' : '') + toneFor(value, kind) + '">' + esc(value) + '</b>';
  }
  function nextLine(row) {
    if (row.overall === 'Live') return 'Next: this area is a live location. You can look at homes here.';
    if (row.overall === 'Not live') return 'Next: this area is not live. Change the item marked No before you treat it as live.';
    if (row.availability === 'Yes' && ROUTES.indexOf(row.route) >= 0 && row.manager !== 'Yes') return 'Next: confirm that Mack Living can manage the homes here. Until then this is not a live location.';
    return 'Next: collect the missing answers. An area is live only when all three are in place.';
  }
  function criterion(label, help, value, note, kind) {
    return '<div class="live-row"><div><span>' + label + '</span><small class="deal-help">' + help + '</small><p>' + esc(note) + '</p></div>' + badge(value, kind) + '</div>';
  }
  function leaseLine(area) {
    const box = root.BuyBox || (typeof window !== 'undefined' ? window.BuyBox : null);
    const rule = box ? box.ruleFor(area) : null;
    const note = rule && rule.lease && rule.lease.sevenNote;
    return 'Laurito needs a lease of 7 years or more. This is hurdle 14. ' + (note || 'The term is not on file.');
  }
  function cardHtml(book, area) {
    const row = status(book, area);
    return '<article class="bd-chart live-location"><div class="bd-buy-h"><h2>Live location</h2>' + badge(row.overall, 'overall', true) + '</div>'
      + '<p class="deal-help">A location is live only when three things are true. The right leases are available. The lease route is Mack Living, LHA, or both. Mack Living can manage the homes.</p>'
      + '<p class="deal-next">' + esc(nextLine(row)) + '</p>'
      + criterion('Are the right leases available?', 'Plenty of the right leases, from Mack Living or from LHA backed demand.', row.availability, row.availabilityNote, 'yes')
      + criterion('Who is the lease with?', 'Mack Living, LHA, or both. LHA is demand backed by the housing allowance.', row.route, row.routeNote, 'route')
      + criterion('Can Mack Living manage the homes?', 'Mack Living would be the property manager in this location.', row.manager, row.managerNote, 'yes')
      + '<p class="deal-next">' + esc(leaseLine(area)) + '</p></article>';
  }
  root.LiveLocation = Object.freeze({status, overall, cardHtml, ROUTES});
})(typeof globalThis !== 'undefined' ? globalThis : this);
