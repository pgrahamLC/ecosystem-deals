/* Pure helpers for the Go / No-Go market-entry workspace. No DOM, network or storage. */
(function (root) {
  'use strict';

  const AREAS = Object.freeze(['Manchester', 'Glasgow', 'Edinburgh', 'Bristol', 'Cheltenham', 'Liverpool', 'Cheshire', 'Birmingham']);
  const CHECK_STATUSES = Object.freeze([
    {id: 'go', label: 'Go'},
    {id: 'open', label: 'Open'},
    {id: 'needs-evidence', label: 'Needs evidence'},
    {id: 'no-go', label: 'No-Go'}
  ]);
  const ALERTS = Object.freeze([
    {id: 'not-registered', label: 'Not registered'},
    {id: 'requested', label: 'Requested'},
    {id: 'registered', label: 'Registered'}
  ]);
  const RELATIONSHIPS = Object.freeze([
    {id: 'not-contacted', label: 'Not contacted'},
    {id: 'introduced', label: 'Introduced'},
    {id: 'in-discussion', label: 'In discussion'},
    {id: 'active', label: 'Active'},
    {id: 'parked', label: 'Parked'}
  ]);
  const CATEGORIES = Object.freeze([
    {id: 'agent', label: 'Agent'},
    {id: 'charity', label: 'Charity'},
    {id: 'contractor', label: 'Contractor'},
    {id: 'local-authority', label: 'Local authority'},
    {id: 'rp', label: 'Registered provider'},
    {id: 'funder', label: 'Funder'}
  ]);
  const AGENT_TYPES = Object.freeze(['Auction house', 'Sales agent', 'Letting agent', 'Sales and letting agent', 'Commercial agent', 'New homes agent', 'Land agent', 'Estate agent', 'Local authority contact', 'Registered provider', 'Other']);
  const INTAKE_STATUSES = Object.freeze(['New', 'Reviewing', 'Go', 'No-go', 'Passed']);
  const PLANNING_CHOICES = Object.freeze(['Not stated', 'Planning granted', 'Reserved matters discharged', 'Reserved matters outstanding', 'No planning']);
  const DEAL_TYPES = Object.freeze(['House', 'Flat', 'Block', 'Site', 'HMO', 'Other']);
  const CHECK_IDS = CHECK_STATUSES.map((row) => row.id);
  const ALERT_IDS = ALERTS.map((row) => row.id);
  const REL_IDS = RELATIONSHIPS.map((row) => row.id);
  const CAT_IDS = CATEGORIES.map((row) => row.id);
  const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/;

  function makeId(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
  }
  function uniqueId(id, used) {
    let next = id;
    let n = 2;
    while (used.has(next)) {
      next = id + '-' + n;
      n += 1;
    }
    used.add(next);
    return next;
  }
  function cleanId(value, fallback) {
    const id = String(value ?? '').trim();
    return ID_RE.test(id) ? id : fallback;
  }
  function clip(value, max) {
    return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max);
  }
  function areaOf(value) {
    const name = String(value ?? '').trim();
    return AREAS.includes(name) ? name : '';
  }
  function cleanUrl(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
      return url.href;
    } catch (error) {
      return '';
    }
  }
  function safeLink(link) {
    if (!link || typeof link !== 'object' || Array.isArray(link)) return null;
    const label = clip(link.label, 160);
    if (!label) return null;
    if (typeof link.hash === 'string' && /^[A-Za-z][A-Za-z0-9/_-]{0,160}$/.test(link.hash)) return {label, hash: link.hash};
    const href = cleanUrl(link.href);
    if (href) return {label, href};
    return null;
  }
  function alignStatus(raw) {
    const legacy = {done: 'go', 'not-started': 'open', 'in-progress': 'open'};
    let status = legacy[raw.status] || (CHECK_IDS.includes(raw.status) ? raw.status : '');
    if (!status) status = raw.done ? 'go' : 'open';
    return {status, done: status === 'go'};
  }
  function tally(items) {
    const list = Array.isArray(items) ? items : [];
    const total = list.length;
    const done = list.filter((item) => item && item.done).length;
    return {done, total, percent: total ? Math.round((done / total) * 100) : 0};
  }
  function summarise(checklist) {
    const streams = ((checklist && checklist.workstreams) || []).map((ws) => Object.assign({id: ws.id, title: ws.title}, tally(ws.items)));
    const done = streams.reduce((sum, row) => sum + row.done, 0);
    const total = streams.reduce((sum, row) => sum + row.total, 0);
    return {done, total, percent: total ? Math.round((done / total) * 100) : 0, streams};
  }
  function marketQuestion(area) {
    return 'Is ' + area + ' a good market for you?';
  }
  function cloneChecklist(seed, area) {
    const answers = (seed.answers && seed.answers[area]) || {};
    const usedWs = new Set();
    const workstreams = (seed.workstreams || []).filter((ws) => !ws.only || ws.only === area).map((ws, index) => {
      const used = new Set();
      const items = (ws.items || []).map((item, itemIndex) => {
        const flags = alignStatus(Object.assign({}, item, answers[item.id] || {}));
        const links = (Array.isArray(item.links) ? item.links : []).filter((link) => !link.only || link.only === area).map(safeLink).filter(Boolean);
        return {
          id: uniqueId(cleanId(item.id, 'item-' + (itemIndex + 1)), used),
          text: item.id === 'manchester' ? marketQuestion(area) : clip(item.text, 500),
          done: flags.done,
          notes: clip(answers[item.id] ? answers[item.id].notes : item.notes, 4000),
          owner: clip(answers[item.id] ? answers[item.id].owner : item.owner, 120),
          status: flags.status,
          links
        };
      });
      return {id: uniqueId(cleanId(ws.id, 'ws-' + (index + 1)), usedWs), title: clip(ws.title, 200), items};
    });
    return {workstreams};
  }
  function blankCriteria(seed) {
    const base = (seed && seed.default) || {};
    return {
      summary: clip(base.summary || 'Sites with planning where reserved matters have been discharged, and 3 to 4 bed homes.', 500),
      bedsMin: numberIn(base.bedsMin, 0, 20, 3),
      bedsMax: numberIn(base.bedsMax, 0, 20, 4),
      planning: clip(base.planning || 'Reserved matters discharged', 160),
      notes: clip(base.notes, 2000)
    };
  }
  function numberIn(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) return fallback;
    return n;
  }
  function normaliseAgent(raw, index, used) {
    if (!raw || typeof raw !== 'object') return {error: 'Agent ' + (index + 1) + ' is not a record.'};
    const name = clip(raw.name, 160);
    const area = areaOf(raw.area);
    if (!name) return {error: 'An agent needs a name.'};
    if (!area) return {error: 'An agent needs an area.'};
    const type = AGENT_TYPES.includes(raw.type) ? raw.type : 'Other';
    const website = cleanUrl(raw.website);
    if (raw.website && !website) return {error: 'Agent website must be an http or https link.'};
    const sourceUrl = cleanUrl(raw.sourceUrl) || website;
    const specialisms = (Array.isArray(raw.specialisms) ? raw.specialisms : []).map((item) => clip(item, 40)).filter(Boolean).slice(0, 8);
    return {
      agent: {
        id: uniqueId(cleanId(raw.id, makeId('agent')), used),
        area,
        name,
        branch: clip(raw.branch, 80),
        subArea: clip(raw.subArea, 40),
        address: clip(raw.address, 200),
        type,
        specialisms,
        coverage: clip(raw.coverage, 200),
        website,
        phone: clip(raw.phone, 40),
        email: clip(raw.email, 80),
        sourceUrl,
        scraped: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.scraped || '')) ? String(raw.scraped) : '',
        contact: clip(raw.contact, 240),
        alertStatus: ALERT_IDS.includes(raw.alertStatus) ? raw.alertStatus : 'not-registered',
        alertDate: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.alertDate || '')) ? String(raw.alertDate) : '',
        notes: clip(raw.notes, 2000),
        source: clip(raw.source, 160)
      }
    };
  }
  function normaliseStakeholder(raw, index, used) {
    if (!raw || typeof raw !== 'object') return {error: 'Stakeholder ' + (index + 1) + ' is not a record.'};
    const name = clip(raw.name, 160);
    const area = areaOf(raw.area);
    if (!name) return {error: 'A stakeholder needs a name.'};
    if (!area) return {error: 'A stakeholder needs an area.'};
    const website = cleanUrl(raw.website);
    if (raw.website && !website) return {error: 'Stakeholder website must be an http or https link.'};
    return {
      stakeholder: {
        id: uniqueId(cleanId(raw.id, makeId('sh')), used),
        area,
        name,
        category: CAT_IDS.includes(raw.category) ? raw.category : 'agent',
        role: clip(raw.role, 300),
        relationship: REL_IDS.includes(raw.relationship) ? raw.relationship : 'not-contacted',
        website,
        notes: clip(raw.notes, 2000),
        source: clip(raw.source, 160)
      }
    };
  }
  function normaliseIntake(raw, index, used) {
    if (!raw || typeof raw !== 'object') return {error: 'Deal ' + (index + 1) + ' is not a record.'};
    const area = areaOf(raw.area);
    if (!area) return {error: 'A deal needs an area.'};
    const bedsRaw = String(raw.beds ?? '').trim();
    let beds = '';
    if (bedsRaw !== '') {
      const n = Number(bedsRaw);
      if (!Number.isInteger(n) || n < 0 || n > 20) return {error: 'Beds must be a whole number from 0 to 20, or blank.'};
      beds = String(n);
    }
    const guideRaw = String(raw.guide ?? '').trim();
    let guide = '';
    if (guideRaw !== '') {
      const n = Number(String(guideRaw).replace(/[£,\s]/g, ''));
      if (!Number.isFinite(n) || n < 0) return {error: 'Guide price must be a number, or blank.'};
      guide = String(Math.round(n));
    }
    return {
      record: {
        id: uniqueId(cleanId(raw.id, makeId('deal')), used),
        date: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || '')) ? String(raw.date) : '',
        area,
        sourceKind: raw.sourceKind === 'agent' || raw.sourceKind === 'stakeholder' ? raw.sourceKind : '',
        sourceId: cleanId(raw.sourceId, ''),
        sourceName: clip(raw.sourceName, 160),
        address: clip(raw.address, 240),
        postcode: clip(raw.postcode, 12).toUpperCase(),
        type: DEAL_TYPES.includes(raw.type) ? raw.type : 'Other',
        beds,
        planning: PLANNING_CHOICES.includes(raw.planning) ? raw.planning : 'Not stated',
        guide,
        notes: clip(raw.notes, 4000),
        status: INTAKE_STATUSES.includes(raw.status) ? raw.status : 'New'
      }
    };
  }
  function normaliseCriteria(raw) {
    const row = raw && typeof raw === 'object' ? raw : {};
    const bedsMin = numberIn(row.bedsMin, 0, 20, 3);
    let bedsMax = numberIn(row.bedsMax, 0, 20, 4);
    if (bedsMax < bedsMin) bedsMax = bedsMin;
    return {
      summary: clip(row.summary, 500),
      bedsMin,
      bedsMax,
      planning: clip(row.planning, 160),
      notes: clip(row.notes, 2000)
    };
  }
  function takeList(list, max, normalise, key, used) {
    if (!Array.isArray(list)) return {error: 'Expected a list.'};
    if (list.length > max) return {error: 'Too many records.'};
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const result = normalise(list[i], i, used);
      if (result.error) return result;
      out.push(result[key]);
    }
    return {list: out};
  }
  function build(seeds) {
    const checklistSeed = seeds.checklist || {};
    const criteriaSeed = seeds.criteria || {};
    const checklists = {};
    const criteria = {};
    AREAS.forEach((area) => {
      checklists[area] = cloneChecklist(checklistSeed, area);
      criteria[area] = blankCriteria(criteriaSeed);
    });
    const usedAgents = new Set();
    const agents = takeList(seeds.agents && seeds.agents.agents, 6000, normaliseAgent, 'agent', usedAgents);
    if (agents.error) throw new Error(agents.error);
    const usedSh = new Set();
    const stakeholders = takeList(seeds.stakeholders && seeds.stakeholders.stakeholders, 400, normaliseStakeholder, 'stakeholder', usedSh);
    if (stakeholders.error) throw new Error(stakeholders.error);
    const usedIn = new Set();
    const intake = takeList(seeds.intake && seeds.intake.records, 500, normaliseIntake, 'record', usedIn);
    if (intake.error) throw new Error(intake.error);
    return {
      version: 1,
      kind: 'market-entry',
      area: 'Manchester',
      section: 'checklist',
      highlight: true,
      checklists,
      criteria,
      agents: agents.list,
      stakeholders: stakeholders.list,
      intake: intake.list,
      meta: {
        purpose: clip(checklistSeed.purpose, 600),
        storageNote: clip(checklistSeed.storageNote, 600)
      }
    };
  }
  function normaliseState(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {error: 'The file is not a market-entry workspace.'};
    const usedAgents = new Set();
    const agents = takeList(data.agents || [], 6000, normaliseAgent, 'agent', usedAgents);
    if (agents.error) return agents;
    const usedSh = new Set();
    const stakeholders = takeList(data.stakeholders || [], 400, normaliseStakeholder, 'stakeholder', usedSh);
    if (stakeholders.error) return stakeholders;
    const usedIn = new Set();
    const intake = takeList(data.intake || [], 500, normaliseIntake, 'record', usedIn);
    if (intake.error) return intake;
    const checklists = {};
    const criteria = {};
    for (let i = 0; i < AREAS.length; i++) {
      const area = AREAS[i];
      const raw = data.checklists && data.checklists[area];
      if (!raw) return {error: 'The file is missing the ' + area + ' checklist.'};
      const parsed = parseChecklist(raw);
      if (parsed.error) return {error: area + ': ' + parsed.error};
      checklists[area] = parsed.state;
      criteria[area] = normaliseCriteria(data.criteria && data.criteria[area]);
    }
    const area = areaOf(data.area) || 'Manchester';
    const section = ['checklist', 'agents', 'intake', 'stakeholders', 'criteria', 'requirements'].includes(data.section) ? data.section : 'checklist';
    return {
      state: {
        version: 1,
        kind: 'market-entry',
        area,
        section,
        highlight: data.highlight !== false,
        checklists,
        criteria,
        agents: agents.list,
        stakeholders: stakeholders.list,
        intake: intake.list,
        meta: {
          purpose: clip(data.meta && data.meta.purpose, 600),
          storageNote: clip(data.meta && data.meta.storageNote, 600)
        }
      }
    };
  }
  function parseChecklist(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.workstreams)) return {error: 'The file needs a workstreams list.'};
    if (data.workstreams.length > 30) return {error: 'Too many workstreams.'};
    const usedWs = new Set();
    const workstreams = [];
    for (let i = 0; i < data.workstreams.length; i++) {
      const raw = data.workstreams[i];
      if (!raw || typeof raw !== 'object') return {error: 'Workstream ' + (i + 1) + ' is not a record.'};
      const title = clip(raw.title, 200);
      if (!title) return {error: 'A workstream needs a title.'};
      if (!Array.isArray(raw.items) || raw.items.length > 80) return {error: 'A workstream needs an items list.'};
      const used = new Set();
      const items = [];
      for (let j = 0; j < raw.items.length; j++) {
        const item = raw.items[j];
        if (!item || typeof item !== 'object') return {error: 'Item ' + (j + 1) + ' is not a record.'};
        const text = clip(item.text, 500);
        if (!text) return {error: 'Item ' + (j + 1) + ' needs text.'};
        const flags = alignStatus(item);
        items.push({
          id: uniqueId(cleanId(item.id, 'item-' + (j + 1)), used),
          text,
          done: flags.done,
          notes: clip(item.notes, 4000),
          owner: clip(item.owner, 120),
          status: flags.status,
          links: (Array.isArray(item.links) ? item.links : []).map(safeLink).filter(Boolean)
        });
      }
      workstreams.push({id: uniqueId(cleanId(raw.id, 'ws-' + (i + 1)), usedWs), title, items});
    }
    return {state: {workstreams}};
  }
  function parseImport(input) {
    let data = input;
    if (typeof input === 'string') {
      try { data = JSON.parse(input); }
      catch (error) { return {error: 'That file is not valid JSON.'}; }
    }
    if (data && Array.isArray(data.workstreams) && !data.checklists) {
      const parsed = parseChecklist(data);
      if (parsed.error) return parsed;
      return {checklist: parsed.state};
    }
    return normaliseState(data);
  }
  function serialise(state) {
    return JSON.stringify({
      version: 1,
      kind: 'market-entry',
      area: state.area,
      section: state.section,
      highlight: state.highlight !== false,
      meta: state.meta || {},
      checklists: state.checklists,
      criteria: state.criteria,
      agents: state.agents,
      stakeholders: state.stakeholders,
      intake: state.intake
    }, null, 2);
  }
  function mapChecklist(state, area, fn) {
    const next = Object.assign({}, state, {checklists: Object.assign({}, state.checklists)});
    next.checklists[area] = fn(state.checklists[area]);
    return next;
  }
  function mapItem(state, area, wsId, itemId, fn) {
    return mapChecklist(state, area, (list) => ({
      workstreams: list.workstreams.map((ws) => ws.id === wsId
        ? Object.assign({}, ws, {items: ws.items.map((item) => item.id === itemId ? fn(item) : item)})
        : ws)
    }));
  }
  function setDone(state, area, wsId, itemId, done) {
    return mapItem(state, area, wsId, itemId, (item) => {
      const next = Object.assign({}, item, {done: !!done});
      if (next.done) next.status = 'go';
      else if (next.status === 'go' || next.status === 'done') next.status = 'open';
      return next;
    });
  }
  function setStatus(state, area, wsId, itemId, status) {
    if (!CHECK_IDS.includes(status)) return state;
    return mapItem(state, area, wsId, itemId, (item) => Object.assign({}, item, {status, done: status === 'go'}));
  }
  function setField(state, area, wsId, itemId, field, value) {
    if (field !== 'notes' && field !== 'owner') return state;
    const clean = field === 'notes' ? clip(value, 4000) : clip(value, 120);
    return mapItem(state, area, wsId, itemId, (item) => Object.assign({}, item, {[field]: clean}));
  }
  function addItem(state, area, wsId, text) {
    const label = clip(text, 500);
    if (!label) return {state, error: 'Add the item text first.'};
    let found = false;
    const next = mapChecklist(state, area, (list) => ({
      workstreams: list.workstreams.map((ws) => {
        if (ws.id !== wsId) return ws;
        found = true;
        const used = new Set(ws.items.map((item) => item.id));
        const item = {id: uniqueId(makeId('item'), used), text: label, done: false, notes: '', owner: '', status: 'not-started', links: []};
        return Object.assign({}, ws, {items: ws.items.concat([item])});
      })
    }));
    if (!found) return {state, error: 'That workstream is not on the list.'};
    return {state: next, error: ''};
  }
  function deleteItem(state, area, wsId, itemId) {
    return {
      state: mapChecklist(state, area, (list) => ({
        workstreams: list.workstreams.map((ws) => ws.id === wsId
          ? Object.assign({}, ws, {items: ws.items.filter((item) => item.id !== itemId)})
          : ws)
      })),
      error: ''
    };
  }
  function addWorkstream(state, area, title) {
    const label = clip(title, 200);
    if (!label) return {state, error: 'Add a workstream name first.'};
    const list = state.checklists[area];
    if (list.workstreams.length >= 30) return {state, error: 'Too many workstreams.'};
    const used = new Set(list.workstreams.map((ws) => ws.id));
    return {
      state: mapChecklist(state, area, (current) => ({workstreams: current.workstreams.concat([{id: uniqueId(makeId('ws'), used), title: label, items: []}])})),
      error: ''
    };
  }
  function deleteWorkstream(state, area, wsId) {
    return {
      state: mapChecklist(state, area, (list) => ({workstreams: list.workstreams.filter((ws) => ws.id !== wsId)})),
      error: ''
    };
  }
  function replaceChecklist(state, area, checklist) {
    const parsed = parseChecklist(checklist);
    if (parsed.error) return {state, error: parsed.error};
    return {state: mapChecklist(state, area, () => parsed.state), error: ''};
  }
  function saveAgent(state, raw) {
    const used = new Set(state.agents.map((row) => row.id));
    if (raw.id) used.delete(raw.id);
    const result = normaliseAgent(raw, 0, used);
    if (result.error) return {state, error: result.error};
    const others = state.agents.filter((row) => row.id !== result.agent.id);
    return {state: Object.assign({}, state, {agents: others.concat([result.agent])}), error: '', id: result.agent.id};
  }
  function deleteAgent(state, id) {
    return Object.assign({}, state, {agents: state.agents.filter((row) => row.id !== id)});
  }
  function saveStakeholder(state, raw) {
    const used = new Set(state.stakeholders.map((row) => row.id));
    if (raw.id) used.delete(raw.id);
    const result = normaliseStakeholder(raw, 0, used);
    if (result.error) return {state, error: result.error};
    const others = state.stakeholders.filter((row) => row.id !== result.stakeholder.id);
    return {state: Object.assign({}, state, {stakeholders: others.concat([result.stakeholder])}), error: '', id: result.stakeholder.id};
  }
  function deleteStakeholder(state, id) {
    return Object.assign({}, state, {stakeholders: state.stakeholders.filter((row) => row.id !== id)});
  }
  function saveIntake(state, raw) {
    const used = new Set(state.intake.map((row) => row.id));
    if (raw.id) used.delete(raw.id);
    const result = normaliseIntake(raw, 0, used);
    if (result.error) return {state, error: result.error};
    const others = state.intake.filter((row) => row.id !== result.record.id);
    return {state: Object.assign({}, state, {intake: [result.record].concat(others)}), error: '', id: result.record.id};
  }
  function deleteIntake(state, id) {
    return Object.assign({}, state, {intake: state.intake.filter((row) => row.id !== id)});
  }
  function setCriteria(state, area, raw) {
    const criteria = Object.assign({}, state.criteria);
    criteria[area] = normaliseCriteria(raw);
    return Object.assign({}, state, {criteria});
  }
  function agentCategory(type) {
    if (type === 'Local authority contact') return 'local-authority';
    if (type === 'Registered provider') return 'rp';
    return 'agent';
  }
  function relationshipFromAlert(status) {
    if (status === 'registered') return 'active';
    if (status === 'requested') return 'introduced';
    return 'not-contacted';
  }
  function labelOf(list, id) {
    const row = list.find((item) => item.id === id);
    return row ? row.label : id;
  }
  function townOf(value) {
    const raw = String(value || '').trim();
    if (/^(city of bristol|bristol, city of)$/i.test(raw)) return 'Bristol';
    if (/^(city of edinburgh|edinburgh, city of)$/i.test(raw)) return 'Edinburgh';
    return AREAS.find((area) => area.toLowerCase() === raw.toLowerCase()) || '';
  }
  function londonDay(date) {
    return new Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit'}).format(date || new Date());
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
  function lotText(lot) {
    return ['title', 'address', 'lot_type', 'property_type', 'residential_subtype', 'grade_evidence'].map((key) => lot && lot[key] ? String(lot[key]) : '').join(' ');
  }
  function bedCounts(text) {
    const found = new Set();
    const re = /\b(10|[1-9])\s*-?\s*bed(?:room)?s?\b/gi;
    let match;
    while ((match = re.exec(String(text || '')))) found.add(Number(match[1]));
    return Array.from(found).sort((a, b) => a - b);
  }
  function reservedDischarged(text) {
    return /reserved matters[\s\S]{0,80}discharg|discharg[\s\S]{0,80}reserved matters/i.test(String(text || ''));
  }
  function classifyLot(lot, criteria) {
    const text = lotText(lot);
    const beds = bedCounts(text);
    const min = criteria && Number.isInteger(criteria.bedsMin) ? criteria.bedsMin : 3;
    const max = criteria && Number.isInteger(criteria.bedsMax) ? criteria.bedsMax : 4;
    const bedMatch = beds.some((n) => n >= min && n <= max);
    const reserved = reservedDischarged(text);
    const mentionsPlanning = /\bplanning\b/i.test(text) || /\bconsent\b/i.test(text);
    let planning = 'Not stated';
    if (reserved) planning = 'Reserved matters discharged';
    else if (mentionsPlanning) planning = 'Planning is mentioned. Reserved matters are not stated';
    return {
      beds,
      bedMatch,
      reserved,
      planning,
      full: bedMatch && reserved,
      partial: bedMatch && !reserved
    };
  }

  root.MarketEntryModel = Object.freeze({
    AREAS, CHECK_STATUSES, ALERTS, RELATIONSHIPS, CATEGORIES, AGENT_TYPES, INTAKE_STATUSES, PLANNING_CHOICES, DEAL_TYPES,
    tally, summarise, build, parseImport, parseChecklist, serialise, marketQuestion,
    setDone, setStatus, setField, addItem, deleteItem, addWorkstream, deleteWorkstream, replaceChecklist,
    saveAgent, deleteAgent, saveStakeholder, deleteStakeholder, saveIntake, deleteIntake, setCriteria,
    agentCategory, relationshipFromAlert, labelOf, townOf, londonDay, currentLot, lotText, bedCounts, reservedDischarged, classifyLot,
    cleanUrl
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
