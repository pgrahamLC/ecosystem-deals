/* Go / No-Go market-entry workspace. Seeds are JSON. Edits stay in this browser. */
(function () {
  'use strict';
  const M = window.MarketEntryModel;
  const KEY = 'ed-market-entry-v1';
  const SECTIONS = [
    ['checklist', 'Checklist'],
    ['agents', 'Agents'],
    ['intake', 'Off-market'],
    ['stakeholders', 'Stakeholders'],
    ['criteria', 'What we want']
  ];
  if (!M) return;

  let state = null;
  let seeds = null;
  const ui = {message: '', editing: null, matches: null, lotsError: '', lotsLoading: false, lotCount: null, painting: false};

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  }
  function save() {
    try { localStorage.setItem(KEY, M.serialise(state)); } catch (error) {}
  }
  function say(text) {
    ui.message = text || '';
    const node = document.getElementById('me-msg');
    if (node) node.textContent = ui.message;
  }
  function options(list, current, valueKey, labelKey) {
    return list.map((row) => {
      const value = valueKey ? row[valueKey] : row;
      const label = labelKey ? row[labelKey] : row;
      return '<option value="' + esc(value) + '"' + (String(value) === String(current) ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
  }
  function money(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 'Guide not published';
    return new Intl.NumberFormat('en-GB', {style: 'currency', currency: 'GBP', maximumFractionDigits: 0}).format(n);
  }
  function safeHref(value) {
    const href = M.cleanUrl(value);
    return href ? '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(href.replace(/^https?:\/\//, '').replace(/\/$/, '')) + '</a>' : '';
  }
  function today() {
    return (window.lcCurrentLot && window.lcCurrentLot.londonDay) ? window.lcCurrentLot.londonDay() : M.londonDay();
  }
  function isCurrent(lot) {
    const fn = window.lcCurrentLot && window.lcCurrentLot.currentLot;
    return (fn || M.currentLot)(lot, today());
  }

  function shell() {
    const area = state.area;
    const summary = M.summarise(state.checklists[area]);
    const agents = state.agents.filter((row) => row.area === area);
    const registered = agents.filter((row) => row.alertStatus === 'registered').length;
    return '<div class="me-hero"><p class="me-kicker">Go / No-Go</p><h1>Market entry</h1><p class="me-purpose">' + esc(state.meta.purpose || '') + '</p></div>'
      + '<div class="kpis"><div class="kpi"><small>' + esc(area) + ' checklist</small><b>' + summary.done + ' of ' + summary.total + ' done</b></div>'
      + '<div class="kpi"><small>Agents registered</small><b>' + registered + ' of ' + agents.length + '</b></div>'
      + '<div class="kpi"><small>Off-market deals</small><b>' + state.intake.filter((row) => row.area === area).length + '</b></div></div>'
      + '<div class="card"><div class="ctl"><label>Area <select id="me-area" data-act="area">' + M.AREAS.map((name) => '<option' + (name === area ? ' selected' : '') + '>' + esc(name) + '</option>').join('') + '</select></label>'
      + '<div class="me-tabs" role="tablist">' + SECTIONS.map(([id, label]) => '<button type="button" data-act="section" data-section="' + id + '"' + (state.section === id ? ' class="on"' : '') + '>' + label + '</button>').join('') + '</div></div>'
      + '<div id="me-panel"></div>'
      + '<div class="gn-tools"><button type="button" class="btn sec" data-act="export">Export JSON</button><button type="button" class="btn sec" data-act="import">Import JSON</button><input id="me-file" type="file" accept="application/json,.json" hidden></div>'
      + '<p role="status" id="me-msg">' + esc(ui.message) + '</p>'
      + '<p class="foot">' + esc(state.meta.storageNote || '') + '</p></div>';
  }

  function linkButtons(links) {
    return (links || []).map((link) => {
      if (link.hash) return '<button type="button" class="btn sec" data-act="hash" data-hash="' + esc(link.hash) + '">' + esc(link.label) + '</button>';
      return '<a class="btn sec" href="' + esc(link.href) + '" target="_blank" rel="noopener">' + esc(link.label) + '</a>';
    }).join('');
  }
  function checklistPanel() {
    const area = state.area;
    const list = state.checklists[area];
    const summary = M.summarise(list);
    const sections = list.workstreams.map((ws) => {
      const count = summary.streams.find((row) => row.id === ws.id) || {done: 0, total: 0, percent: 0};
      const items = ws.items.map((item) => {
        const statuses = M.CHECK_STATUSES.map((row) => '<option value="' + row.id + '"' + (item.status === row.id ? ' selected' : '') + '>' + row.label + '</option>').join('');
        return '<article class="gn-item' + (item.done ? ' done' : '') + '"><div class="gn-top"><label class="gn-check"><input type="checkbox" data-act="done" data-ws="' + esc(ws.id) + '" data-id="' + esc(item.id) + '"' + (item.done ? ' checked' : '') + '> Done</label><p class="gn-q">' + esc(item.text) + '</p></div>'
          + '<div class="gn-meta"><label>Status <select data-act="status" data-ws="' + esc(ws.id) + '" data-id="' + esc(item.id) + '">' + statuses + '</select></label>'
          + '<label>Owner <input data-act="owner" data-ws="' + esc(ws.id) + '" data-id="' + esc(item.id) + '" value="' + esc(item.owner) + '" placeholder="Name" autocomplete="off"></label>'
          + '<button type="button" class="btn sec" data-act="del-item" data-ws="' + esc(ws.id) + '" data-id="' + esc(item.id) + '">Delete</button></div>'
          + '<label class="gn-notes">Notes or answer <textarea data-act="notes" data-ws="' + esc(ws.id) + '" data-id="' + esc(item.id) + '" placeholder="Short answer">' + esc(item.notes) + '</textarea></label>'
          + (item.links && item.links.length ? '<div class="gn-links">' + linkButtons(item.links) + '</div>' : '')
          + '</article>';
      }).join('');
      return '<section class="card" id="gn-' + esc(ws.id) + '"><div class="gn-ws-h"><h2>' + esc(ws.title) + '</h2><p class="foot">' + count.done + ' of ' + count.total + ' done</p></div><div class="gn-bar" aria-hidden="true"><span style="width:' + count.percent + '%"></span></div>'
        + '<details class="bd-fold"' + (ui.editing ? ' open' : '') + '><summary>Show the questions</summary>'
        + items
        + '<form class="gn-add" data-act="add-item" data-ws="' + esc(ws.id) + '"><input name="text" placeholder="New checklist item" aria-label="New item in ' + esc(ws.title) + '" autocomplete="off"><button class="btn" type="submit">Add item</button></form>'
        + '<details><summary class="foot">Remove this workstream</summary><button type="button" class="btn sec" data-act="del-ws" data-ws="' + esc(ws.id) + '">Delete workstream</button></details></details></section>';
    }).join('');
    return sections + '<section class="card"><h2>Add a workstream</h2><form class="gn-add" data-act="add-ws"><input name="title" placeholder="New workstream name" aria-label="New workstream name" autocomplete="off"><button class="btn" type="submit">Add workstream</button></form><p class="foot">This checklist is for ' + esc(area) + ' only. Switch area to see the others. Manchester starts with Yes on the market question.</p></section>';
  }

  function agentForm(row) {
    const blank = {id: '', name: '', type: 'Auction house', coverage: state.area, website: '', contact: '', alertStatus: 'not-registered', alertDate: '', notes: ''};
    const item = row || blank;
    return '<form class="me-form" id="me-agent-form" data-id="' + esc(item.id) + '" data-act="save-agent">'
      + '<label>Name <input name="name" required value="' + esc(item.name) + '" autocomplete="off"></label>'
      + '<label>Type <select name="type">' + options(M.AGENT_TYPES, item.type) + '</select></label>'
      + '<label>Coverage <input name="coverage" value="' + esc(item.coverage) + '" autocomplete="off"></label>'
      + '<label>Website <input name="website" type="url" value="' + esc(item.website) + '" placeholder="https://"></label>'
      + '<label>Contact route <input name="contact" value="' + esc(item.contact) + '" placeholder="Leave blank unless you have a checked route" autocomplete="off"></label>'
      + '<label>Deal alerts <select name="alertStatus">' + options(M.ALERTS, item.alertStatus, 'id', 'label') + '</select></label>'
      + '<label>Date <input name="alertDate" type="date" value="' + esc(item.alertDate) + '"></label>'
      + '<label class="wide">Notes <textarea name="notes">' + esc(item.notes) + '</textarea></label>'
      + '<div class="wide gn-tools"><button class="btn" type="submit">' + (item.id ? 'Save agent' : 'Add agent') + '</button><button type="button" class="btn sec" data-act="cancel">Cancel</button></div></form>';
  }
  function agentsPanel() {
    const rows = state.agents.filter((row) => row.area === state.area).slice().sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
    const editing = ui.editing && ui.editing.kind === 'agent' ? (state.agents.find((row) => row.id === ui.editing.id) || null) : null;
    const showForm = ui.editing && ui.editing.kind === 'agent';
    const body = rows.map((row) => '<article class="me-row"><h3>' + esc(row.name) + '</h3><p class="foot">' + esc(row.type) + (row.coverage ? ' · ' + esc(row.coverage) : '') + '</p><p>Deal alerts: <b>' + esc(M.labelOf(M.ALERTS, row.alertStatus)) + '</b>' + (row.alertDate ? ' · ' + esc(row.alertDate) : '') + '</p>'
      + (row.website ? '<p>' + safeHref(row.website) + '</p>' : '')
      + (row.contact ? '<p>Contact route: ' + esc(row.contact) + '</p>' : '<p class="foot">No contact name, email or phone stored.</p>')
      + (row.notes ? '<p class="foot">' + esc(row.notes) + '</p>' : '')
      + '<div class="gn-tools"><button type="button" class="btn sec" data-act="edit-agent" data-id="' + esc(row.id) + '">Edit</button><button type="button" class="btn sec" data-act="log-agent" data-id="' + esc(row.id) + '">Log a deal</button><button type="button" class="btn sec" data-act="del-agent" data-id="' + esc(row.id) + '">Delete</button></div></article>').join('');
    return '<section class="card"><h2>Agents and contacts in ' + esc(state.area) + '</h2><p class="lead">Register with the auction houses, estate agents, land agents, council housing teams and registered providers who can bring a deal before it reaches the open market.</p><button type="button" class="btn" data-act="new-agent">Add a contact</button>'
      + (showForm ? agentForm(editing) : '')
      + '<details class="bd-fold"' + (ui.editing && ui.editing.kind === 'agent' ? ' open' : '') + '><summary>Show the register (' + rows.length + ')</summary>' + (body || '<p>No contacts for this area yet.</p>') + '</details></section>';
  }

  function sourceChoices() {
    const area = state.area;
    const agents = state.agents.filter((row) => row.area === area).map((row) => ['agent:' + row.id, row.name + ' (agent)']);
    const people = state.stakeholders.filter((row) => row.area === area).map((row) => ['stakeholder:' + row.id, row.name + ' (' + M.labelOf(M.CATEGORIES, row.category) + ')']);
    return [['', 'Not linked']].concat(agents, people);
  }
  function intakeForm(row) {
    const item = row || {id: '', date: today(), sourceKind: '', sourceId: '', sourceName: '', address: '', postcode: '', type: 'House', beds: '', planning: 'Not stated', guide: '', notes: '', status: 'New'};
    const selected = item.sourceKind && item.sourceId ? item.sourceKind + ':' + item.sourceId : '';
    return '<form class="me-form" id="me-intake-form" data-id="' + esc(item.id) + '" data-act="save-intake">'
      + '<label>Date <input name="date" type="date" value="' + esc(item.date) + '"></label>'
      + '<label>Source <select name="source">' + sourceChoices().map(([value, label]) => '<option value="' + esc(value) + '"' + (value === selected ? ' selected' : '') + '>' + esc(label) + '</option>').join('') + '</select></label>'
      + '<label>Source name, if not linked <input name="sourceName" value="' + esc(item.sourceName) + '" autocomplete="off"></label>'
      + '<label>Address <input name="address" value="' + esc(item.address) + '" autocomplete="off"></label>'
      + '<label>Postcode <input name="postcode" value="' + esc(item.postcode) + '" autocomplete="off"></label>'
      + '<label>Type <select name="type">' + options(M.DEAL_TYPES, item.type) + '</select></label>'
      + '<label>Beds <input name="beds" inputmode="numeric" value="' + esc(item.beds) + '" placeholder="Blank if not stated"></label>'
      + '<label>Planning status <select name="planning">' + options(M.PLANNING_CHOICES, item.planning) + '</select></label>'
      + '<label>Guide price £ <input name="guide" inputmode="numeric" value="' + esc(item.guide) + '" placeholder="Blank if not stated"></label>'
      + '<label>Status <select name="status">' + options(M.INTAKE_STATUSES, item.status) + '</select></label>'
      + '<label class="wide">Notes <textarea name="notes" placeholder="What the source told you">' + esc(item.notes) + '</textarea></label>'
      + '<div class="wide gn-tools"><button class="btn" type="submit">' + (item.id ? 'Save deal' : 'Add deal') + '</button><button type="button" class="btn sec" data-act="cancel">Cancel</button></div></form>';
  }
  function intakePanel() {
    const rows = state.intake.filter((row) => row.area === state.area);
    const editing = ui.editing && ui.editing.kind === 'intake' ? (state.intake.find((row) => row.id === ui.editing.id) || ui.editing.draft || null) : null;
    const showForm = ui.editing && ui.editing.kind === 'intake';
    const body = rows.map((row) => '<article class="me-row"><h3>' + esc(row.address || 'Address not stated') + (row.postcode ? ', ' + esc(row.postcode) : '') + '</h3><p class="foot">' + esc(row.date || 'No date') + ' · ' + esc(row.type) + (row.beds ? ' · ' + esc(row.beds) + ' bed' : '') + ' · ' + esc(row.status) + '</p><p>Source: <b>' + esc(row.sourceName || 'Not linked') + '</b></p><p>Planning: ' + esc(row.planning) + (row.guide ? ' · Guide £' + esc(Number(row.guide).toLocaleString('en-GB')) : '') + '</p>' + (row.notes ? '<p class="foot">' + esc(row.notes) + '</p>' : '') + '<div class="gn-tools"><button type="button" class="btn sec" data-act="edit-intake" data-id="' + esc(row.id) + '">Edit</button><button type="button" class="btn sec" data-act="del-intake" data-id="' + esc(row.id) + '">Delete</button></div></article>').join('');
    return '<section class="card"><h2>Off-market deals in ' + esc(state.area) + '</h2><p class="lead">Deals that come from an agent or stakeholder often never reach the open market. Log them here. Planning status is what you were told. Not stated means it was not given. Do not guess.</p><button type="button" class="btn" data-act="new-intake">Add a deal</button>'
      + (showForm ? intakeForm(editing) : '')
      + '<details class="bd-fold"' + (showForm ? ' open' : '') + '><summary>Show the log (' + rows.length + ')</summary>' + (body || '<p>No off-market deals logged for this area.</p>') + '</details></section>';
  }

  function mapCards() {
    const area = state.area;
    const columns = M.CATEGORIES.map((cat) => {
      const agents = state.agents.filter((row) => row.area === area && M.agentCategory(row.type) === cat.id);
      const people = state.stakeholders.filter((row) => row.area === area && row.category === cat.id);
      const agentCards = agents.map((row) => '<article class="me-card"><b>' + esc(row.name) + '</b><p class="foot">' + esc(row.type) + '</p><p>Relationship: ' + esc(M.labelOf(M.RELATIONSHIPS, M.relationshipFromAlert(row.alertStatus))) + '</p><p>Deal alerts: ' + esc(M.labelOf(M.ALERTS, row.alertStatus)) + '</p>' + (row.website ? '<p>' + safeHref(row.website) + '</p>' : '') + '<button type="button" class="btn sec" data-act="edit-agent" data-id="' + esc(row.id) + '">Edit in agents</button></article>').join('');
      const personCards = people.map((row) => '<article class="me-card"><b>' + esc(row.name) + '</b><p>' + esc(row.role || 'Role not stated') + '</p><p>Relationship: ' + esc(M.labelOf(M.RELATIONSHIPS, row.relationship)) + '</p>' + (row.website ? '<p>' + safeHref(row.website) + '</p>' : '') + (row.notes ? '<p class="foot">' + esc(row.notes) + '</p>' : '') + '<div class="gn-tools"><button type="button" class="btn sec" data-act="edit-sh" data-id="' + esc(row.id) + '">Edit</button><button type="button" class="btn sec" data-act="del-sh" data-id="' + esc(row.id) + '">Delete</button></div></article>').join('');
      const empty = !agents.length && !people.length ? '<p class="foot">None yet. Add one when you have the organisation and a public website.</p>' : '';
      return '<div class="me-col"><h3>' + esc(cat.label) + ' <span class="foot">' + (agents.length + people.length) + '</span></h3>' + agentCards + personCards + empty + '</div>';
    }).join('');
    return '<div class="me-map">' + columns + '</div>';
  }
  function stakeholderForm(row) {
    const item = row || {id: '', name: '', category: 'charity', role: '', relationship: 'not-contacted', website: '', notes: ''};
    return '<form class="me-form" id="me-sh-form" data-id="' + esc(item.id) + '" data-act="save-sh">'
      + '<label>Name <input name="name" required value="' + esc(item.name) + '" autocomplete="off"></label>'
      + '<label>Category <select name="category">' + options(M.CATEGORIES, item.category, 'id', 'label') + '</select></label>'
      + '<label>Relationship <select name="relationship">' + options(M.RELATIONSHIPS, item.relationship, 'id', 'label') + '</select></label>'
      + '<label>Website <input name="website" type="url" value="' + esc(item.website) + '" placeholder="https://"></label>'
      + '<label class="wide">Role <input name="role" value="' + esc(item.role) + '" autocomplete="off"></label>'
      + '<label class="wide">Notes <textarea name="notes">' + esc(item.notes) + '</textarea></label>'
      + '<div class="wide gn-tools"><button class="btn" type="submit">' + (item.id ? 'Save stakeholder' : 'Add stakeholder') + '</button><button type="button" class="btn sec" data-act="cancel">Cancel</button></div></form>';
  }
  function stakeholdersPanel() {
    const editing = ui.editing && ui.editing.kind === 'stakeholder' ? (state.stakeholders.find((row) => row.id === ui.editing.id) || null) : null;
    const showForm = ui.editing && ui.editing.kind === 'stakeholder';
    return '<section class="card"><h2>Stakeholder map for ' + esc(state.area) + '</h2><p class="lead">Agents, charities, contractors, the local authority, registered providers and funders. Auction houses, councils and registered providers in the agent register appear here too. Relationship for those rows follows the deal-alert status.</p><button type="button" class="btn" data-act="new-sh">Add a stakeholder</button>'
      + (showForm ? stakeholderForm(editing) : '') + '</section>' + mapCards();
  }

  function criteriaPanel() {
    const row = state.criteria[state.area];
    const matches = ui.matches;
    let result = '<p class="foot">Check the auction feed to see current lots whose own text states a bed count in this range. Planning is flagged only when the text says reserved matters have been discharged.</p>';
    if (ui.lotsLoading) result = '<p role="status">Reading the auction feed...</p>';
    else if (ui.lotsError) result = '<p role="alert">The auction feed did not load. No matches were assumed. ' + esc(ui.lotsError) + '</p>';
    else if (matches) {
      const full = matches.filter((item) => item.flag.full);
      const partial = matches.filter((item) => item.flag.partial);
      const line = (item) => {
        const lot = item.lot;
        const href = M.cleanUrl(lot.source_url);
        return '<tr class="' + (item.flag.full ? 'full' : '') + '"><td>' + esc(lot.address || lot.title || 'Untitled lot') + '</td><td>' + esc(item.flag.beds.join(', ') || 'Not stated') + '</td><td>' + esc(item.flag.planning) + '</td><td>' + esc(money(lot.guide_price)) + '</td><td>' + (href ? '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(lot.source || 'Source') + '</a>' : esc(lot.source || '')) + '</td></tr>';
      };
      result = '<p><b>' + full.length + '</b> full matches. <b>' + partial.length + '</b> current lots state a bed count in range, with planning not confirmed. ' + (ui.lotCount == null ? '' : esc(String(ui.lotCount)) + ' current lots in ' + esc(state.area) + '.') + '</p>'
        + (full.length ? '<h3>Full matches</h3><div class="scroll"><table><thead><tr><th>Address</th><th>Beds stated</th><th>Planning from the listing</th><th>Guide</th><th>Source</th></tr></thead><tbody>' + full.map(line).join('') + '</tbody></table></div>' : '<p>No current lot in this area says both. None of the loaded text states that reserved matters have been discharged unless a row below says so.</p>')
        + (partial.length ? '<h3>Bed count matches, planning not stated</h3><div class="scroll"><table><thead><tr><th>Address</th><th>Beds stated</th><th>Planning from the listing</th><th>Guide</th><th>Source</th></tr></thead><tbody>' + partial.slice(0, 40).map(line).join('') + '</tbody></table></div>' + (partial.length > 40 ? '<p class="foot">Showing 40 of ' + partial.length + '.</p>' : '') : '');
    }
    return '<section class="card"><h2>What we want in ' + esc(state.area) + '</h2><p class="lead">The starting brief is sites with planning where reserved matters have been discharged, and 3 to 4 bed homes. Edit it for this area. The auction feed has no planning field, so a lot is never marked discharged unless its own text says so.</p>'
      + '<form class="me-form" id="me-criteria" data-act="criteria">'
      + '<label class="wide">Summary <textarea name="summary" data-act="criteria-field">' + esc(row.summary) + '</textarea></label>'
      + '<label>Beds from <input name="bedsMin" type="number" min="0" max="20" step="1" value="' + esc(row.bedsMin) + '" data-act="criteria-field"></label>'
      + '<label>Beds to <input name="bedsMax" type="number" min="0" max="20" step="1" value="' + esc(row.bedsMax) + '" data-act="criteria-field"></label>'
      + '<label class="wide">Planning we require <input name="planning" value="' + esc(row.planning) + '" data-act="criteria-field" autocomplete="off"></label>'
      + '<label class="wide">Notes <textarea name="notes" data-act="criteria-field">' + esc(row.notes) + '</textarea></label>'
      + '</form><label class="gn-check"><input type="checkbox" data-act="highlight"' + (state.highlight ? ' checked' : '') + '> Highlight current auction lots whose listing text states this bed count</label>'
      + '<div class="gn-tools"><button type="button" class="btn" data-act="check-lots">Check the auction feed</button></div>' + result + '</section>';
  }

  function render() {
    const host = document.getElementById('entry_body');
    if (!host || !state) return;
    const panel = {checklist: checklistPanel, agents: agentsPanel, intake: intakePanel, stakeholders: stakeholdersPanel, criteria: criteriaPanel}[state.section] || checklistPanel;
    host.innerHTML = shell().replace('<div id="me-panel"></div>', '<div id="me-panel">' + panel() + '</div>');
  }

  function setSection(section, push) {
    state.section = section;
    if (ui.editing && ui.editing.kind !== section && !(section === 'agents' && ui.editing.kind === 'agent') && !(section === 'stakeholders' && ui.editing.kind === 'stakeholder') && !(section === 'intake' && ui.editing.kind === 'intake')) ui.editing = null;
    save();
    const hash = '#entry/' + section;
    if (push !== false && location.hash !== hash) history.replaceState(null, '', hash);
    render();
  }
  function followHash(hash) {
    if (hash === 'auctions') {
      if (typeof viewMode === 'function') viewMode('auctions');
      return;
    }
    const section = (hash.split('/')[1] || 'checklist');
    const known = SECTIONS.some((row) => row[0] === section);
    setSection(known ? section : 'checklist', false);
  }

  function onDone(box) {
    state = M.setDone(state, state.area, box.dataset.ws, box.dataset.id, box.checked);
    save();
    render();
  }
  function formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  }
  function applySource(data) {
    const raw = String(data.source || '');
    const split = raw.split(':');
    data.sourceKind = split[0] === 'agent' || split[0] === 'stakeholder' ? split[0] : '';
    data.sourceId = split.length > 1 ? split.slice(1).join(':') : '';
    if (data.sourceKind === 'agent') {
      const agent = state.agents.find((row) => row.id === data.sourceId);
      if (agent) data.sourceName = agent.name;
    }
    if (data.sourceKind === 'stakeholder') {
      const person = state.stakeholders.find((row) => row.id === data.sourceId);
      if (person) data.sourceName = person.name;
    }
    data.area = state.area;
    return data;
  }

  function handleClick(event) {
    const button = event.target.closest('[data-act]');
    if (!button || button.tagName === 'INPUT' || button.tagName === 'SELECT' || button.tagName === 'TEXTAREA') return;
    const act = button.dataset.act;
    if (act === 'section') { setSection(button.dataset.section); return; }
    if (act === 'hash') { followHash(button.dataset.hash); return; }
    if (act === 'export') {
      const blob = new Blob([M.serialise(state)], {type: 'application/json'});
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'market-entry.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      return;
    }
    if (act === 'import') { const file = document.getElementById('me-file'); if (file) file.click(); return; }
    if (act === 'del-item') { state = M.deleteItem(state, state.area, button.dataset.ws, button.dataset.id).state; save(); render(); return; }
    if (act === 'del-ws') { state = M.deleteWorkstream(state, state.area, button.dataset.ws).state; save(); render(); return; }
    if (act === 'new-agent') { ui.editing = {kind: 'agent', id: ''}; render(); return; }
    if (act === 'edit-agent') { ui.editing = {kind: 'agent', id: button.dataset.id}; state.section = 'agents'; save(); render(); return; }
    if (act === 'del-agent') { state = M.deleteAgent(state, button.dataset.id); ui.editing = null; save(); render(); return; }
    if (act === 'log-agent') {
      const agent = state.agents.find((row) => row.id === button.dataset.id);
      ui.editing = {kind: 'intake', id: '', draft: {date: today(), sourceKind: 'agent', sourceId: agent ? agent.id : '', sourceName: agent ? agent.name : '', planning: 'Not stated', type: 'House', status: 'New', address: '', postcode: '', beds: '', guide: '', notes: ''}};
      setSection('intake');
      return;
    }
    if (act === 'new-intake') { ui.editing = {kind: 'intake', id: ''}; render(); return; }
    if (act === 'edit-intake') { ui.editing = {kind: 'intake', id: button.dataset.id}; render(); return; }
    if (act === 'del-intake') { state = M.deleteIntake(state, button.dataset.id); ui.editing = null; save(); render(); return; }
    if (act === 'new-sh') { ui.editing = {kind: 'stakeholder', id: ''}; render(); return; }
    if (act === 'edit-sh') { ui.editing = {kind: 'stakeholder', id: button.dataset.id}; render(); return; }
    if (act === 'del-sh') { state = M.deleteStakeholder(state, button.dataset.id); ui.editing = null; save(); render(); return; }
    if (act === 'cancel') { ui.editing = null; render(); return; }
    if (act === 'check-lots') { checkLots(); }
  }
  function handleChange(event) {
    const node = event.target;
    if (node.id === 'me-area') {
      state.area = node.value;
      ui.editing = null;
      ui.matches = null;
      save();
      render();
      decorate(document.getElementById('auctions_body'));
      return;
    }
    if (node.dataset.act === 'done') onDone(node);
    if (node.dataset.act === 'status') {
      state = M.setStatus(state, state.area, node.dataset.ws, node.dataset.id, node.value);
      save();
      render();
    }
    if (node.dataset.act === 'highlight') {
      state.highlight = node.checked;
      save();
      decorate(document.getElementById('auctions_body'));
    }
  }
  function handleInput(event) {
    const node = event.target;
    if (node.dataset.act === 'owner' || node.dataset.act === 'notes') {
      state = M.setField(state, state.area, node.dataset.ws, node.dataset.id, node.dataset.act === 'owner' ? 'owner' : 'notes', node.value);
      save();
    }
    if (node.dataset.act === 'criteria-field') {
      const form = document.getElementById('me-criteria');
      if (!form) return;
      state = M.setCriteria(state, state.area, formData(form));
      ui.matches = null;
      save();
      decorate(document.getElementById('auctions_body'));
    }
  }
  function handleSubmit(event) {
    const form = event.target;
    if (!form.dataset || !form.dataset.act) return;
    event.preventDefault();
    const data = formData(form);
    if (form.dataset.act === 'add-item') {
      const result = M.addItem(state, state.area, form.dataset.ws, data.text);
      if (result.error) { say(result.error); return; }
      state = result.state;
      save();
      render();
      return;
    }
    if (form.dataset.act === 'add-ws') {
      const result = M.addWorkstream(state, state.area, data.title);
      if (result.error) { say(result.error); return; }
      state = result.state;
      save();
      render();
      return;
    }
    if (form.dataset.act === 'save-agent') {
      data.id = form.dataset.id || '';
      data.area = state.area;
      const result = M.saveAgent(state, data);
      if (result.error) { say(result.error); return; }
      state = result.state;
      ui.editing = null;
      ui.message = 'Contact saved for ' + state.area + '.';
      save();
      render();
      return;
    }
    if (form.dataset.act === 'save-sh') {
      data.id = form.dataset.id || '';
      data.area = state.area;
      const result = M.saveStakeholder(state, data);
      if (result.error) { say(result.error); return; }
      state = result.state;
      ui.editing = null;
      ui.message = 'Stakeholder saved for ' + state.area + '.';
      save();
      render();
      return;
    }
    if (form.dataset.act === 'save-intake') {
      data.id = form.dataset.id || '';
      applySource(data);
      const result = M.saveIntake(state, data);
      if (result.error) { say(result.error); return; }
      state = result.state;
      ui.editing = null;
      ui.message = 'Off-market deal saved.';
      save();
      render();
    }
  }
  function handleFile(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = M.parseImport(String(reader.result || ''));
      if (parsed.error) { say(parsed.error); return; }
      if (parsed.checklist) {
        const result = M.replaceChecklist(state, state.area, parsed.checklist);
        if (result.error) { say(result.error); return; }
        state = result.state;
        ui.message = 'Checklist for ' + state.area + ' replaced from the file.';
      } else if (parsed.state) {
        parsed.state.meta = state.meta;
        state = parsed.state;
        ui.editing = null;
        ui.matches = null;
        ui.message = 'Workspace replaced from the file.';
      }
      save();
      render();
    };
    reader.readAsText(file);
  }

  async function checkLots() {
    ui.lotsLoading = true;
    ui.lotsError = '';
    render();
    try {
      const response = await fetch('data/auctions/lots.json?v=' + Date.now(), {cache: 'no-store'});
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      const lots = Array.isArray(data.lots) ? data.lots : [];
      const area = state.area;
      const criteria = state.criteria[area];
      const inArea = lots.filter((lot) => M.townOf(lot.town || lot.city) === area && isCurrent(lot));
      ui.lotCount = inArea.length;
      ui.matches = inArea.map((lot) => ({lot, flag: M.classifyLot(lot, criteria)})).filter((item) => item.flag.full || item.flag.partial);
      ui.matches.sort((a, b) => Number(b.flag.full) - Number(a.flag.full) || String(a.lot.address || '').localeCompare(String(b.lot.address || '')));
    } catch (error) {
      ui.lotsError = error.message || 'The feed failed.';
      ui.matches = null;
    }
    ui.lotsLoading = false;
    render();
  }

  let lotRows = null;
  let lotPromise = null;
  function cardText(card) {
    const clone = card.cloneNode(true);
    clone.querySelectorAll('.me-flag').forEach((node) => node.remove());
    return clone.textContent || '';
  }
  function loadLotRows() {
    if (lotRows || lotPromise) return;
    lotPromise = fetch('data/auctions/lots.json?v=20261117-entry', {cache: 'no-store'}).then((response) => {
      if (!response.ok) throw new Error(String(response.status));
      return response.json();
    }).then((data) => {
      lotRows = Array.isArray(data.lots) ? data.lots : [];
      decorate(document.getElementById('auctions_body'));
    }).catch(() => { lotPromise = null; });
  }
  function flagCopy(flag, town) {
    if (flag.full) return 'Matches what we want in ' + (town || 'this area') + '. The listing states the bed count and says reserved matters have been discharged.';
    const beds = flag.beds.length ? flag.beds.join(' and ') : 'a matching';
    return 'Listing text states ' + beds + ' bed. Planning status is not stated, so this is not a full match.';
  }
  function needles(town) {
    const criteria = state.criteria[town];
    const out = [];
    if (!criteria || !lotRows) return out;
    for (let i = 0; i < lotRows.length; i++) {
      const lot = lotRows[i];
      if (M.townOf(lot.town || lot.city) !== town || !isCurrent(lot)) continue;
      const flag = M.classifyLot(lot, criteria);
      if (!flag.bedMatch && !flag.reserved) continue;
      const address = String(lot.address || lot.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (address.length >= 8) out.push({needle: address.slice(0, 48), flag});
    }
    return out;
  }
  function matchCard(card, cache) {
    const eye = card.querySelector('.aq-eyebrow');
    const town = M.townOf(eye ? eye.textContent.split('·')[0] : '');
    const criteria = state.criteria[town] || state.criteria[state.area];
    if (!criteria) return null;
    const text = cardText(card).toLowerCase().replace(/\s+/g, ' ');
    const fromCard = M.classifyLot({title: text}, criteria);
    if (fromCard.bedMatch || fromCard.reserved) return {flag: fromCard, town};
    if (!lotRows) { loadLotRows(); return null; }
    const rows = cache[town] || (cache[town] = needles(town));
    for (let i = 0; i < rows.length; i++) {
      if (text.includes(rows[i].needle)) return {flag: rows[i].flag, town};
    }
    return null;
  }
  function decorate(root) {
    if (!root || !state) return;
    const cache = {};
    root.querySelectorAll('.aq-lot').forEach((card) => {
      const existing = card.querySelector('.me-flag');
      if (!state.highlight) {
        if (existing) existing.remove();
        return;
      }
      const hit = matchCard(card, cache);
      if (!hit) {
        if (existing) existing.remove();
        return;
      }
      const text = flagCopy(hit.flag, hit.town);
      const key = (hit.flag.full ? 'full:' : 'part:') + text;
      if (existing && existing.dataset.meKey === key) return;
      if (existing) existing.remove();
      const note = document.createElement('p');
      note.className = 'me-flag' + (hit.flag.full ? ' full' : '');
      note.dataset.meKey = key;
      note.textContent = text;
      card.appendChild(note);
    });
  }

  function openEntry() {
    const host = document.getElementById('entry_view');
    if (host) host.classList.remove('hidden');
    if (!state) return;
    const hash = location.hash.replace(/^#/, '');
    if (hash === 'entry' || hash.indexOf('entry/') === 0 || hash === 'go-no-go') {
      const section = hash.split('/')[1] || state.section || 'checklist';
      if (SECTIONS.some((row) => row[0] === section)) state.section = section;
    }
    if (location.hash !== '#entry/' + state.section) history.replaceState(null, '', '#entry/' + state.section);
    const screen = document.getElementById('lc_screen');
    if (screen) screen.hidden = true;
    document.body.classList.remove('ios-find', 'ios-deal');
    document.querySelectorAll('.mainnav .mainb[data-v]').forEach((button) => button.classList.toggle('on', button.getAttribute('data-v') === 'entry'));
    const more = document.getElementById('lc_more_btn');
    if (more) more.classList.remove('on');
    render();
  }

  function boot() {
    const view = document.createElement('section');
    view.id = 'entry_view';
    view.className = 'hidden';
    view.innerHTML = '<main id="entry_body"><p>Loading the market-entry workspace...</p></main>';
    (document.getElementById('app') || document.body).appendChild(view);
    view.addEventListener('click', handleClick);
    view.addEventListener('change', handleChange);
    view.addEventListener('input', handleInput);
    view.addEventListener('submit', handleSubmit);
    view.addEventListener('change', (event) => { if (event.target.id === 'me-file') handleFile(event); });

    const previous = window.viewMode;
    window.viewMode = function (mode) {
      const on = mode === 'entry' || String(mode || '').indexOf('entry/') === 0;
      const host = document.getElementById('entry_view');
      if (!on) {
        if (host) host.classList.add('hidden');
        const screen = document.getElementById('lc_screen');
        if (screen) screen.hidden = false;
        return typeof previous === 'function' ? previous.apply(this, arguments) : undefined;
      }
      if (typeof previous === 'function') previous.call(this, 'entry');
      setTimeout(openEntry, 0);
    };

    const auctions = document.getElementById('auctions_body');
    if (auctions && window.MutationObserver) {
      const observer = new MutationObserver(() => {
        if (ui.painting || !state) return;
        ui.painting = true;
        try { decorate(auctions); } finally { ui.painting = false; }
      });
      observer.observe(auctions, {childList: true, subtree: true});
    }
    window.addEventListener('hashchange', () => {
      const hash = location.hash;
      if (hash === '#entry' || hash.indexOf('#entry/') === 0 || hash === '#go-no-go') {
        if (typeof viewMode === 'function') viewMode('entry');
      }
    });

    const files = ['checklist', 'agents', 'stakeholders', 'criteria', 'intake'];
    Promise.all(files.map((name) => fetch('data/market-entry/' + name + '.json?v=20261117-entry', {cache: 'no-store'}).then((response) => {
      if (!response.ok) throw new Error(name + '.json returned HTTP ' + response.status);
      return response.json();
    }))).then((rows) => {
      seeds = {checklist: rows[0], agents: rows[1], stakeholders: rows[2], criteria: rows[3], intake: rows[4]};
      const fresh = M.build(seeds);
      let stored = null;
      try { stored = localStorage.getItem(KEY); } catch (error) {}
      if (stored) {
        const parsed = M.parseImport(stored);
        state = parsed.state || fresh;
        if (parsed.state) state.meta = fresh.meta;
        if (parsed.error) ui.message = 'Saved workspace could not be read. The starting lists are shown. ' + parsed.error;
      } else state = fresh;
      if (/^#(entry|go-no-go)/.test(location.hash)) openEntry();
      else render();
      decorate(document.getElementById('auctions_body'));
    }).catch((error) => {
      const host = document.getElementById('entry_body');
      if (host) host.innerHTML = '<div class="card"><h2>Market entry did not load</h2><p>' + esc(error.message) + '</p></div>';
    });
  }

  if (/^#(entry|go-no-go)/.test(location.hash)) window.lcUserNav = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(() => {
    if (/^#(entry|go-no-go)/.test(location.hash) && typeof viewMode === 'function') viewMode('entry');
  }, 0);
})();
