/* Current listings only. Historic rows can stay in the data file. */
(function () {
  'use strict';

  function londonDay(date) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date || new Date());
  }

  function currentLot(lot, today) {
    if (!lot || lot.stale === true) return false;
    const status = String(lot.status || '').toLowerCase();
    const words = String(lot.sale_status || lot.status || '').toLowerCase();
    if (/\b(sold|unsold|withdrawn|passed)\b/.test(words) || /past auction/.test(words)) return false;
    const day = String(lot.auction_date || '').slice(0, 10);
    const now = today || londonDay();
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day < now) return false;
    if (status) return status === 'upcoming' || status === 'available';
    return true;
  }

  window.lcCurrentLot = { londonDay: londonDay, currentLot: currentLot };
})();
