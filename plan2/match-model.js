/* Framework to lot. Every point is explained. A blank field stays "not recorded". */
(function (root) {
  'use strict';

  const NOT = 'not recorded';
  const WEIGHTS = {location: 30, type: 25, rent: 15, distress: 15, gates: 15};
  const EVIDENCE = {
    contract: 'Contract',
    'contract (verify current)': 'Contract (verify)',
    'block contract': 'Homes called off',
    framework: 'On framework',
    'council report': 'Council report',
    'framework (ended)': 'Framework ended',
    'owns homes': 'Owns property'
  };
  const TOWNS = [
    ['Wigan', 'GM', /\bwigan\b|skelmersdale|\bleigh\b|atherton|hindley|ashton-in-makerfield/i],
    ['Salford', 'GM', /\bsalford\b/i],
    ['Bolton', 'GM', /\bbolton\b/i],
    ['Bury', 'GM', /\bbury\b/i],
    ['Oldham', 'GM', /\boldham\b|chadderton|failsworth|royton/i],
    ['Rochdale', 'GM', /\brochdale\b|heywood|middleton/i],
    ['Stockport', 'GM', /\bstockport\b/i],
    ['Trafford', 'GM', /\btrafford\b|stretford|altrincham/i],
    ['Tameside', 'GM', /\btameside\b|ashton-under-lyne|droylsden|denton/i],
    ['Manchester', 'GM', /\bmanchester\b/i],
    ['South Gloucestershire', 'BRS', /south gloucestershire/i],
    ['Bristol', 'BRS', /\bbristol\b/i],
    ['Cheltenham', 'GLOS', /\bcheltenham\b|winchcombe/i],
    ['Gloucester', 'GLOS', /\bgloucester\b/i],
    ['Birmingham', 'WM', /\bbirmingham\b/i],
    ['Liverpool', 'NW', /\bliverpool\b/i],
    ['Cheshire', 'NW', /\bcheshire\b|\bchester\b|\bcrewe\b/i],
    ['Edinburgh', 'SC', /\bedinburgh\b/i],
    ['Glasgow', 'SC', /\bglasgow\b/i]
  ];

  function norm(value) {
    return String(value || '').toLowerCase().replace(/&/g, ' and ').replace(/\b(limited|ltd|plc|the)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function closeName(a, b) {
    const x = norm(a);
    const y = norm(b);
    if (!x || !y) return false;
    if (x === y) return true;
    const short = x.length <= y.length ? x : y;
    const long = x.length <= y.length ? y : x;
    return short.length >= 6 && long.indexOf(short) >= 0;
  }
  function held(frameworkName, label) {
    const a = norm(frameworkName);
    const b = norm(label);
    if (!a || !b) return false;
    if (a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return true;
    const code = String(label || '').match(/DN\d+|P-\d+|TC\d+/i);
    return !!(code && String(frameworkName).toUpperCase().indexOf(code[0].toUpperCase()) >= 0);
  }
  function outward(postcode) {
    const match = String(postcode || '').toUpperCase().match(/[A-Z]{1,2}\d{1,2}[A-Z]?/);
    return match ? match[0] : '';
  }
  function prefixOf(postcode) {
    return outward(postcode).replace(/\d.*/, '');
  }
  function districtNumber(postcode) {
    const match = outward(postcode).match(/\d+/);
    return match ? +match[0] : null;
  }
  function bedsFrom(text) {
    const match = String(text || '').match(/\b([1-9])\s*[- ]?bed(?:room)?s?\b/i);
    return match ? +match[1] : null;
  }
  function townsIn(text) {
    const stripped = String(text || '').replace(/greater manchester/gi, ' ');
    const found = [];
    TOWNS.forEach(function (row) {
      if (row[2].test(stripped) && found.indexOf(row[0]) < 0) found.push(row[0]);
    });
    return found;
  }
  function regionOfTown(town) {
    const row = TOWNS.filter(function (item) { return item[0] === town; })[0];
    return row ? row[1] : '';
  }
  function cityToTown(city) {
    const text = String(city || '');
    if (/bristol/i.test(text)) return 'Bristol';
    if (/cheltenham/i.test(text)) return 'Cheltenham';
    if (/liverpool/i.test(text)) return 'Liverpool';
    if (/birmingham/i.test(text)) return 'Birmingham';
    if (/edinburgh/i.test(text)) return 'Edinburgh';
    if (/glasgow/i.test(text)) return 'Glasgow';
    if (/cheshire/i.test(text)) return 'Cheshire';
    if (/manchester/i.test(text)) return 'Manchester';
    return '';
  }
  function postcodePlace(postcode, address) {
    const prefix = prefixOf(postcode);
    const num = districtNumber(postcode);
    const where = String(address || '');
    if (prefix === 'WN') return {town: 'Wigan', region: 'GM'};
    if (prefix === 'BL') return {town: 'Bolton', region: 'GM'};
    if (prefix === 'M') return {town: 'Manchester', region: 'GM'};
    if (prefix === 'OL') {
      if (/rossendale|stacksteads|bacup|rawtenstall/i.test(where)) return {town: 'Rossendale', region: ''};
      if (/rochdale|heywood|middleton/i.test(where)) return {town: 'Rochdale', region: 'GM'};
      return {town: 'Oldham', region: 'GM'};
    }
    if (prefix === 'SK') return num != null && num >= 9 ? {town: 'Cheshire', region: 'NW'} : {town: 'Stockport', region: 'GM'};
    if (prefix === 'BS') return {town: 'Bristol', region: 'BRS'};
    if (prefix === 'GL') return num != null && num >= 50 && num <= 56 ? {town: 'Cheltenham', region: 'GLOS'} : {town: 'Gloucester', region: 'GLOS'};
    if (prefix === 'B') return {town: 'Birmingham', region: 'WM'};
    if (prefix === 'L') return {town: 'Liverpool', region: 'NW'};
    if (prefix === 'EH') return {town: 'Edinburgh', region: 'SC'};
    if (prefix === 'G') return {town: 'Glasgow', region: 'SC'};
    if (prefix === 'CH' || prefix === 'CW' || prefix === 'WA') return {town: 'Cheshire', region: 'NW'};
    return null;
  }
  function placeOf(record) {
    const address = [record.address, record.title, record.town].filter(Boolean).join(' ');
    const named = townsIn(address);
    if (named.length) return {town: named[0], region: regionOfTown(named[0])};
    const fromPc = postcodePlace(record.postcode || record.pc, address);
    if (fromPc) return fromPc;
    const town = cityToTown(record.city);
    return {town: town, region: regionOfTown(town)};
  }

  function lotKind(lot) {
    const type = [lot.property_type, lot.residential_subtype, lot.lot_type].filter(Boolean).join(' ');
    const title = lot.title || lot.address || '';
    const beds = bedsFrom(title) || bedsFrom(type);
    const blob = type + ' ' + title;
    const house = /house|bungalow|cottage|terrace|semi-detached|detached/i.test(blob);
    const flat = /flat|maisonette|apartment|studio/i.test(blob);
    if (/hmo/i.test(blob)) return {form: 'hmo', beds: beds};
    if (flat) return {form: 'flat', beds: beds};
    if (house) return {form: 'house', beds: beds};
    if (/land/i.test(type) || /^land\b/i.test(title)) return {form: 'land', beds: beds};
    if (/development/i.test(type)) return {form: 'development', beds: beds};
    if (/commercial|retail|office|industrial|warehouse|garage/i.test(type)) return {form: 'commercial', beds: beds};
    return {form: 'unknown', beds: beds};
  }
  function lotBand(lot) {
    const text = [lot.sale_tag, lot.grade_evidence, lot.sale_tag_evidence, lot.title, lot.verification_note].join(' ');
    if (/liquidat|in administration|\badministrator\b|\bliquidator\b|insolvency|bankrupt/i.test(text)) {
      return {band: 'A', why: 'The listing records an insolvency office-holder.'};
    }
    if (/receiver|mortgagee|law of property act|\blpa\b/i.test(text)) {
      return {band: 'B', why: 'The listing records a receiver or mortgagee sale.'};
    }
    if (lot.grade === 'C') return {band: 'C', why: 'The lot is graded C on the auction file.'};
    return {band: '', why: ''};
  }

  function parseSpec(text) {
    const source = String(text || '');
    const forms = [];
    const add = function (form) { if (forms.indexOf(form) < 0) forms.push(form); };
    if (/shared|\bhmo\b|house share/i.test(source)) add('hmo');
    if (/house|family home/i.test(source)) add('house');
    if (/flat|apartment|maisonette/i.test(source)) add('flat');
    if (/self-contained|self contained/i.test(source) && !forms.length) { add('house'); add('flat'); }
    if (/self-contained|self contained/i.test(source)) { add('house'); add('flat'); }
    const numbers = [];
    const range = source.match(/(\d)\s*[-–]{1,2}\s*(\d)\s*[- ]?bed/i);
    if (range) { numbers.push(+range[1], +range[2]); }
    const singles = source.match(/\d\s*[- ]?bed/gi) || [];
    singles.forEach(function (token) {
      const n = token.match(/\d/);
      if (n) numbers.push(+n[0]);
    });
    const residential = /accommodat|home|house|flat|hmo|hostel|bed|leas|temporary|family/i.test(source);
    return {
      forms: forms,
      bedsMin: numbers.length ? Math.min.apply(null, numbers) : null,
      bedsMax: numbers.length ? Math.max.apply(null, numbers) : null,
      residential: residential,
      text: source
    };
  }
  function parseRent(text) {
    const source = String(text || '').trim();
    if (!source) return {annual: null, ceiling: null, note: NOT};
    const ceiling = {};
    const finder = /(?:(room)|([1-4])\s*[- ]?bed)\s*£\s*([0-9][0-9,]*)/gi;
    let match;
    while ((match = finder.exec(source))) ceiling[match[1] ? 'shared' : match[2]] = Number(match[3].replace(/,/g, ''));
    const hasCeiling = Object.keys(ceiling).length > 0;
    if (hasCeiling && /max|cap|up to|ceiling/i.test(source)) {
      return {annual: null, ceiling: ceiling, note: 'Published as a maximum, not the rent paid to the owner.'};
    }
    if (/keeps a share|share of the rent|share for management/i.test(source)) {
      return {annual: null, ceiling: hasCeiling ? ceiling : null, note: 'The basis says a share is kept. The rent paid to the owner is not recorded.'};
    }
    if (/support/i.test(source) && /unit rate/i.test(source)) {
      return {annual: null, ceiling: null, note: 'The figures are support rates, not the rent paid to the owner.'};
    }
    const year = source.match(/£\s*([0-9][0-9,]*)\s*(?:a year|pa|p\.a\.|per annum)/i);
    const month = source.match(/£\s*([0-9][0-9,]*)\s*(?:a month|pcm|per month)/i);
    if (year && !/max|cap|up to/i.test(source)) return {annual: Number(year[1].replace(/,/g, '')), ceiling: null, note: 'Taken from the published rent basis.'};
    if (month && !hasCeiling && !/max|cap|up to/i.test(source)) return {annual: Number(month[1].replace(/,/g, '')) * 12, ceiling: null, note: 'Monthly figure from the rent basis, times 12.'};
    return {annual: null, ceiling: hasCeiling ? ceiling : null, note: hasCeiling ? 'A rent figure is published without a statement that it is paid to the owner.' : 'Rent paid to the owner: not recorded.'};
  }
  function parseTerm(text) {
    const source = String(text || '').trim();
    if (!source) return {years: null, note: NOT};
    const plus = source.match(/(\d+)\s*years?\s*(?:\+|plus)\s*(?:1|one)\s*day/i);
    if (plus) return {years: +plus[1], note: source};
    if (/\bor\b|\d\s*[-–]\s*\d|up to|several|spot purchase/i.test(source)) return {years: null, note: source};
    const usual = source.match(/usually\s*(\d+)\s*years?/i);
    if (usual) return {years: +usual[1], note: source};
    const all = source.match(/(\d+)\s*years?/gi) || [];
    if (all.length === 1) return {years: +all[0].match(/\d+/)[0], note: source};
    return {years: null, note: source};
  }
  function recorded(value) {
    const text = String(value == null ? '' : value).trim();
    if (!text || /^(none|null|n\/a|not published\b.*|not stated|unverified)$/i.test(text)) return NOT;
    return text;
  }
  function homesLine(text) {
    const source = String(text || '');
    const parts = [];
    const target = source.match(/target units:[^.]*/i);
    if (target) parts.push(target[0].trim());
    const hits = source.match(/\b(?:up to\s+)?\d[\d,]*\s+(?:homes|units|properties|bed\s*spaces|bedspaces)\b/gi) || [];
    hits.forEach(function (hit) {
      if (parts.join(' ').toLowerCase().indexOf(hit.toLowerCase()) < 0) parts.push(hit.trim());
    });
    const block = source.match(/blocks?\s+up to\s+\d+\s+units/i);
    if (block && parts.join(' ').toLowerCase().indexOf(block[0].toLowerCase()) < 0) parts.push(block[0].trim());
    return parts.length ? parts.join('; ') : NOT;
  }
  function assetNeed(framework, spec, rent, term) {
    const lease = framework.lease_terms || {};
    const beds = spec.bedsMin == null ? NOT : (spec.bedsMin === spec.bedsMax ? String(spec.bedsMin) : spec.bedsMin + '–' + spec.bedsMax);
    const value = framework.value_gbp > 0 ? money(framework.value_gbp) + (framework.value_text ? ' · ' + framework.value_text : '') : recorded(framework.value_text);
    const rows = [
      ['Homes needed', homesLine([framework.accom_type, framework.geography].filter(Boolean).join('. '))],
      ['Unit type', spec.forms.length ? spec.forms.join(', ') : NOT],
      ['Bedrooms', beds],
      ['Locations', recorded(framework.geography)],
      ['Lease term', recorded(term.note)],
      ['Rent basis', recorded((lease.rent_basis) || '')],
      ['Rent level', rent.annual ? money(rent.annual) + ' a year' : NOT],
      ['Repairs', recorded(lease.repairs)],
      ['Voids', recorded(lease.voids)],
      ['Breaks', recorded(lease.breaks)],
      ['Indexation', recorded(lease.indexation)],
      ['Start', recorded(framework.start)],
      ['End', recorded(framework.end)],
      ['Contract value', value]
    ];
    return rows.map(function (row) {
      return {label: row[0], value: row[1] || NOT, recorded: row[1] && row[1] !== NOT};
    });
  }
  function routeFor(framework, rentBasis) {
    const blob = (framework.accom_type || '') + ' ' + (framework.name || '');
    if (/asylum|aasc|home office/i.test(blob)) return 'Home Office provider';
    if (/mack living/i.test(blob)) return 'Mack Living';
    if (/direct bid/i.test(framework.investor_route || '') && /council/i.test(framework.buyer || '')) return 'Council lease';
    if (/\bLHA\b/.test(rentBasis || '') && !/share/i.test(rentBasis || '')) return 'LHA';
    return 'Other';
  }

  function buildRequirements(frameworks, partners, presence, offers) {
    const items = (frameworks && frameworks.items) || [];
    const people = (partners && partners.partners) || [];
    const providers = (presence && presence.providers) || [];
    const offerRows = Array.isArray(offers) ? offers : [];
    return items.map(function (framework, index) {
      const holders = [];
      people.forEach(function (partner) {
        const named = (partner.frameworks || []).some(function (label) { return held(framework.name, label); });
        const supplied = (framework.suppliers || []).some(function (supplier) { return closeName(supplier, partner.name) || closeName(supplier, partner.legal); });
        if (!named && !supplied) return;
        holders.push({
          name: partner.name,
          no: partner.no || '',
          kind: partner.kind || '',
          cities: partner.cities || [],
          how: named ? 'Named on the partner record' : 'Named as a supplier on the framework',
          calledOff: partner.called_off === true
        });
      });
      const evidence = [];
      providers.forEach(function (provider) {
        Object.keys(provider.cities || {}).forEach(function (city) {
          (provider.cities[city] || []).forEach(function (row) {
            if (!held(framework.name, row.d)) return;
            evidence.push({
              provider: provider.name,
              no: provider.no || '',
              city: city,
              code: row.e || '',
              label: EVIDENCE[row.e] || row.e || NOT,
              detail: row.d || '',
              url: row.u || '',
              date: row.dt || ''
            });
          });
        });
      });
      const offer = offerRows.filter(function (row) {
        return holders.some(function (holder) { return closeName(holder.name, row.name); }) || (framework.suppliers || []).some(function (supplier) { return closeName(supplier, row.name); });
      })[0] || null;
      const specText = [framework.accom_type, framework.geography].filter(Boolean).join('. ');
      const spec = parseSpec(specText);
      const rentText = (framework.lease_terms && framework.lease_terms.rent_basis) || (offer && offer.offer && offer.offer.rent_basis) || '';
      const rentFrom = (framework.lease_terms && framework.lease_terms.rent_basis) ? 'framework' : (rentText ? 'provider offer' : '');
      const rent = parseRent(rentText);
      const termText = (framework.lease_terms && framework.lease_terms.term) || (offer && offer.offer && offer.offer.lease_length) || '';
      const termFrom = (framework.lease_terms && framework.lease_terms.term) ? 'framework' : (termText ? 'provider offer' : '');
      const term = parseTerm(termText);
      const towns = townsIn([framework.geography, framework.name, framework.accom_type].filter(Boolean).join(' '));
      const regions = (framework.regions || []).filter(function (region) { return region && region !== 'National'; });
      return {
        id: 'fw:' + index + ':' + framework.name,
        name: framework.name,
        buyer: framework.buyer || NOT,
        status: framework.status_n || framework.status || NOT,
        route: routeFor(framework, rentText),
        investorRoute: framework.investor_route || NOT,
        geography: framework.geography || NOT,
        regions: regions,
        national: (framework.regions || []).indexOf('National') >= 0,
        towns: towns,
        spec: spec,
        termYears: term.years,
        termText: term.note,
        termFrom: termFrom,
        annualRent: rent.annual,
        ceiling: rent.ceiling,
        rentNote: rent.note,
        rentBasis: rentText || NOT,
        rentFrom: rentFrom,
        repairs: (framework.lease_terms && framework.lease_terms.voids) || (framework.lease_terms && framework.lease_terms.repairs) || NOT,
        asset: assetNeed(framework, spec, rent, term),
        nextWindow: framework.next_window || NOT,
        opening: framework.start || NOT,
        holders: holders,
        partnerTowns: holders.reduce(function (list, holder) {
          (holder.cities || []).forEach(function (city) {
            const town = cityToTown(city);
            if (town && list.indexOf(town) < 0) list.push(town);
          });
          return list;
        }, []),
        evidence: evidence,
        offerName: offer ? offer.name : '',
        sources: framework.sources || []
      };
    });
  }

  function firstSeenOf(lot) {
    const times = [lot.first_seen, lot.scraped_at].concat((lot.provenance || []).map(function (row) { return row && row.scraped_at; })).filter(Boolean);
    let best = '';
    let bestN = Infinity;
    times.forEach(function (value) {
      const n = Date.parse(value);
      if (Number.isFinite(n) && n < bestN) { bestN = n; best = new Date(n).toISOString(); }
    });
    return best;
  }
  function auctionSupply(lots, isCurrent) {
    const out = [];
    (lots || []).forEach(function (lot) {
      if (isCurrent && !isCurrent(lot)) return;
      const place = placeOf(lot);
      const kind = lotKind(lot);
      const band = lotBand(lot);
      out.push({
        id: 'lot:' + (lot.source_url || lot.title || lot.address || out.length),
        channel: 'auction',
        live: true,
        address: lot.title || lot.address || NOT,
        postcode: lot.postcode || '',
        city: lot.city || '',
        town: place.town,
        region: place.region,
        guide: lot.guide_price > 0 ? lot.guide_price : null,
        url: lot.source_url || '',
        date: (lot.auction_date || '').slice(0, 10),
        source: lot.source || '',
        form: kind.form,
        beds: kind.beds,
        band: band.band,
        bandWhy: band.why,
        company: '',
        firstSeen: firstSeenOf(lot)
      });
    });
    return out;
  }
  function watchSupply(file) {
    const sites = (file && file.sites) || [];
    return sites.map(function (site, index) {
      const title = (site.titles && site.titles[0]) || {};
      const address = title.a || site.pc || NOT;
      const place = placeOf({address: address, postcode: site.pc, city: site.city});
      let form = 'unknown';
      if (/^land\b|land adjoining/i.test(address)) form = 'land';
      else if (/flat|apartment|maisonette/i.test(address)) form = 'flat';
      else if (/house|bungalow|cottage/i.test(address)) form = 'house';
      return {
        id: 'watch:' + (site.co || index) + ':' + (site.pc || '') + ':' + address,
        channel: 'watchlist',
        live: false,
        address: address,
        postcode: site.pc || '',
        city: site.city || '',
        town: place.town,
        region: place.region,
        guide: null,
        url: '',
        date: title.d || '',
        source: 'pre_distress.json',
        form: form,
        beds: bedsFrom(address),
        band: 'C',
        bandWhy: 'Title in pre_distress.json. Watchlist stock, not a forced sale and not an auction lot.' + (site.n > 1 ? ' ' + site.n + ' titles are recorded at this postcode.' : ''),
        company: site.co || ''
      };
    });
  }

  function locationFit(requirement, supply) {
    const max = WEIGHTS.location;
    if (!supply.town) return null;
    if (requirement.towns.length && requirement.towns.indexOf(supply.town) >= 0) {
      return {key: 'location', points: 30, max: max, reason: supply.town + ' is named on the framework. Geography recorded: ' + requirement.geography + '.'};
    }
    if (requirement.towns.length) return null;
    if (supply.region && requirement.regions.indexOf(supply.region) >= 0) {
      return {key: 'location', points: 22, max: max, reason: 'No town is named. Region ' + supply.region + ' on the framework covers ' + supply.town + '.'};
    }
    if (requirement.national && requirement.partnerTowns.indexOf(supply.town) >= 0) {
      return {key: 'location', points: 12, max: max, reason: 'National framework. A linked partner records ' + supply.town + '. The framework does not name the town.'};
    }
    if (requirement.national && supply.region === 'GM' && requirement.partnerTowns.indexOf('Manchester') >= 0) {
      return {key: 'location', points: 12, max: max, reason: 'National framework. A linked partner records Manchester. This lot is in that book (' + supply.town + ').'};
    }
    return null;
  }
  function typeFit(requirement, supply) {
    const spec = requirement.spec || {forms: [], residential: true};
    const max = WEIGHTS.type;
    if (spec.residential && (supply.form === 'commercial' || supply.form === 'land' || supply.form === 'development')) return null;
    const reasons = [];
    let points = 0;
    if (!spec.forms.length) {
      if (supply.form === 'house' || supply.form === 'flat' || supply.form === 'hmo') {
        points = 16;
        reasons.push('The lot is a ' + supply.form + '. The framework does not record house, flat or HMO.');
      } else if (supply.form === 'unknown') {
        points = 8;
        reasons.push('Property type is not recorded on the supply. The framework does not record a form either.');
      } else return null;
    } else if (spec.forms.indexOf(supply.form) >= 0) {
      points = 18;
      reasons.push(supply.form + ' is one of the recorded forms (' + spec.forms.join(', ') + ').');
    } else if (supply.form === 'unknown') {
      points = 8;
      reasons.push('Property type is not recorded on the supply. The framework records ' + spec.forms.join(', ') + '.');
    } else {
      points = 6;
      reasons.push(supply.form + ' is not one of the recorded forms (' + spec.forms.join(', ') + ').');
    }
    if (spec.bedsMin != null && supply.beds != null) {
      if (supply.beds >= spec.bedsMin && supply.beds <= spec.bedsMax) {
        points = Math.min(max, points + 7);
        reasons.push(supply.beds + '-bed is inside the recorded ' + spec.bedsMin + '–' + spec.bedsMax + '.');
      } else {
        points = Math.max(0, points - 8);
        reasons.push(supply.beds + '-bed is outside the recorded ' + spec.bedsMin + '–' + spec.bedsMax + '.');
      }
    } else if (spec.bedsMin != null) reasons.push('Bedrooms are not recorded on the supply. The framework records ' + spec.bedsMin + '–' + spec.bedsMax + '.');
    else if (supply.beds != null) reasons.push(supply.beds + '-bed is on the supply. The framework does not record a bed count.');
    else reasons.push('Bedrooms are not recorded.');
    if (!(points > 0)) return null;
    return {key: 'type', points: points, max: max, reason: reasons.join(' ')};
  }
  function rentFit(requirement, supply) {
    const max = WEIGHTS.rent;
    if (requirement.annualRent == null) {
      const cap = requirement.ceiling && supply.beds != null ? requirement.ceiling[String(supply.beds)] : null;
      const extra = cap ? ' A maximum of £' + cap.toLocaleString('en-GB') + ' a month is published for this bed count. It is not used as the rent.' : '';
      return {key: 'rent', points: null, max: max, reason: 'Rent cover is not scored. ' + (requirement.rentNote || NOT) + extra};
    }
    const cap = requirement.ceiling && supply.beds != null ? requirement.ceiling[String(supply.beds)] : null;
    if (cap) {
      const annualCap = cap * 12;
      const inside = requirement.annualRent <= annualCap + 1;
      return {key: 'rent', points: inside ? 15 : 4, max: max, reason: 'Recorded rent £' + requirement.annualRent.toLocaleString('en-GB') + ' a year against a published maximum of £' + annualCap.toLocaleString('en-GB') + ' a year.'};
    }
    return {key: 'rent', points: 15, max: max, reason: 'A rent of £' + requirement.annualRent.toLocaleString('en-GB') + ' a year is recorded. No separate cap is published.'};
  }
  function distressFit(supply) {
    const max = WEIGHTS.distress;
    if (supply.band === 'A') return {key: 'distress', points: 15, max: max, reason: supply.bandWhy};
    if (supply.band === 'B') return {key: 'distress', points: 12, max: max, reason: supply.bandWhy};
    if (supply.band === 'C') return {key: 'distress', points: 8, max: max, reason: supply.bandWhy};
    if (supply.live) return {key: 'distress', points: 5, max: max, reason: 'Live auction lot. No insolvency, receiver or watchlist wording is recorded on it.'};
    return {key: 'distress', points: 0, max: max, reason: 'Not a live lot, and no distress band is recorded.'};
  }
  function totals(parts) {
    let points = 0;
    let counted = 0;
    let missed = 0;
    parts.forEach(function (part) {
      if (part.points == null) missed += part.max;
      else { points += part.points; counted += part.max; }
    });
    return {points: points, counted: counted, missed: missed};
  }
  function score(requirement, supply) {
    const location = locationFit(requirement, supply);
    const type = location && typeFit(requirement, supply);
    if (!location || !type) return null;
    const parts = [
      location,
      type,
      rentFit(requirement, supply),
      distressFit(supply),
      {key: 'gates', points: null, max: WEIGHTS.gates, reason: 'Not testable yet. Rent or operating costs are not recorded, so the 14 gates have not been run.'}
    ];
    const sum = totals(parts);
    return {
      id: requirement.id + '|' + supply.id,
      requirement: requirement,
      supply: supply,
      parts: parts,
      points: sum.points,
      counted: sum.counted,
      missed: sum.missed,
      location: location.points,
      townLevel: location.points >= 30
    };
  }
  function byScore(a, b) {
    return b.points - a.points || b.location - a.location || ((b.supply.guide ? 1 : 0) - (a.supply.guide ? 1 : 0)) || ((b.supply.beds != null ? 1 : 0) - (a.supply.beds != null ? 1 : 0)) || ((b.supply.live ? 1 : 0) - (a.supply.live ? 1 : 0)) || String(a.supply.address).localeCompare(String(b.supply.address));
  }
  function rank(requirements, supplies, perRequirement) {
    const cap = perRequirement || 5;
    const out = [];
    (requirements || []).forEach(function (requirement) {
      const hits = [];
      (supplies || []).forEach(function (supply) {
        const match = score(requirement, supply);
        if (match) hits.push(match);
      });
      hits.sort(byScore);
      hits.slice(0, cap).forEach(function (match) { out.push(match); });
    });
    out.sort(byScore);
    return out;
  }
  function withGates(match, underwrite) {
    const parts = match.parts.filter(function (part) { return part.key !== 'gates'; });
    let gates;
    if (!underwrite || !underwrite.ok) {
      const missing = (underwrite && underwrite.missing) || [];
      gates = {key: 'gates', points: null, max: WEIGHTS.gates, reason: 'Not testable yet. ' + (missing.length ? 'Still needed: ' + missing.join(', ') + '.' : 'Rent or operating costs are not recorded.')};
    } else {
      const cleared = underwrite.gates.cleared;
      const takeaway = root.GatesModel && root.GatesModel.takeaway ? root.GatesModel.takeaway(underwrite.gates) : '';
      gates = {key: 'gates', points: Math.round(cleared / 14 * WEIGHTS.gates), max: WEIGHTS.gates, reason: cleared + ' of 14 cleared. ' + takeaway};
    }
    parts.push(gates);
    const sum = totals(parts);
    return Object.assign({}, match, {parts: parts, points: sum.points, counted: sum.counted, missed: sum.missed, underwrite: underwrite || null});
  }

  function sheetInput(match, entryMonth, overrides) {
    const years = match.requirement.termYears;
    const entry = entryMonth || '2026-11';
    const hold = years || 5;
    let exit = '';
    if (root.QuickModel && root.QuickModel.monthIndex && root.QuickModel.monthText) {
      const start = root.QuickModel.monthIndex(entry);
      if (Number.isFinite(start)) exit = root.QuickModel.monthText(start + hold * 12);
    }
    const rent = match.requirement.annualRent;
    return Object.assign({
      name: match.supply.address,
      route: match.requirement.route,
      basis: 'price',
      price: match.supply.guide ? String(match.supply.guide) : '',
      rent1: rent ? String(rent) : '',
      opexPct: '',
      growthPct: '',
      costsPct: '6.8',
      ltvPct: '50',
      ratePct: '6.5',
      loanType: 'io',
      termYears: '25',
      entryMonth: entry,
      exitMonth: exit,
      exitYieldPct: '6',
      saleCostsPct: '2',
      termAssumed: !years,
      termYearsUsed: hold
    }, overrides || {});
  }
  function runUnderwrite(input, config) {
    if (!root.QuickModel || !root.GatesModel) return {ok: false, missing: ['underwriting model']};
    const result = root.QuickModel.compute(input);
    if (!result.ok) return {ok: false, missing: result.missing, input: input};
    if (!config || !config.anchors) return {ok: false, missing: ['gate hurdles'], input: input};
    let downside = null;
    const rent = root.QuickModel.num(input.rent1);
    const exitYield = root.QuickModel.num(input.exitYieldPct);
    const cut = config && config.downsideRentCut != null ? config.downsideRentCut : 0.1;
    const wider = config && config.spreadsBp ? config.spreadsBp.downsideExit : 50;
    if (rent > 0 && exitYield > 0) {
      const down = root.QuickModel.compute(Object.assign({}, input, {
        rent1: String(Math.round(rent * (1 - cut))),
        exitYieldPct: String(exitYield + wider / 100)
      }));
      if (down.ok) downside = {multiple: down.multiple, dscr: down.interestCover, unleveredIrr: down.unleveredIrr, ltv: down.ltv};
    }
    const metrics = {
      noi: result.noi1,
      annualRent: rent,
      annualOpex: rent * (root.QuickModel.num(input.opexPct) / 100),
      fees: result.purchaseCosts + ((result.finance && result.finance.acqFees) || 0),
      allIn: result.allIn,
      price: result.price,
      debt: result.debt,
      interestRate: root.QuickModel.num(input.ratePct) / 100,
      annualInterest: result.interest,
      yieldOnCost: result.yieldOnCost,
      profitOnCost: result.profitOnCost,
      unleveredIrr: result.unleveredIrr,
      leveredIrr: result.leveredIrr,
      leveredMultiple: result.multiple,
      peakEquity: result.equity,
      cheque: null,
      paybackYears: null,
      holdYears: result.holdYears,
      cashOnCash: result.cashOnCash,
      ltv: result.ltv,
      ltc: result.ltc,
      dscr: result.interestCover,
      breakEvenLev: result.breakEvenYield,
      breakEvenUnlev: null,
      operatorCover: null,
      downside: downside
    };
    const gates = root.GatesModel.score(metrics, {attribution: false, bridge: false, fees: false, term: false, cashOut: false}, config);
    return {ok: true, result: result, gates: gates, metrics: metrics, input: input};
  }

  function money(value) {
    if (value == null || !isFinite(+value)) return NOT;
    return '£' + Math.round(+value).toLocaleString('en-GB');
  }
  function soldLine(prices, supply) {
    const key = outward(supply.postcode);
    const row = prices && prices.districts && prices.districts[key];
    if (!row) return {label: 'Sold prices', value: NOT, source: 'No district row in prices.json for ' + (key || 'this postcode') + '.'};
    const field = supply.form === 'flat' ? 'flat_med' : supply.form === 'house' ? 'terr_med' : 'all_med';
    const count = supply.form === 'flat' ? 'flat_n' : supply.form === 'house' ? 'terr_n' : 'sales';
    if (row[field] == null) return {label: 'Sold prices', value: NOT, source: 'prices.json has ' + key + ' but not this property form.'};
    const guide = supply.guide ? ' Guide on the lot is ' + money(supply.guide) + '.' : '';
    return {label: 'Sold prices', value: money(row[field]) + ' median, n=' + row[count], source: 'prices.json. Land Registry standard sales, 1 Oct 2025 to Aug 2026, for postcode district ' + key + '.' + guide};
  }
  function ppsLine(pps, supply) {
    const city = cityToTown(supply.city) || supply.town;
    const key = city === 'City Of Bristol' ? 'Bristol' : city;
    const area = pps && pps.areas && (pps.areas[key] || pps.areas[supply.city]);
    if (!area) return {label: '£ per sq ft', value: NOT, source: 'No floor-area median in comps/home-ppsqft.json for this town.'};
    const block = supply.form === 'flat' ? area.flats : supply.form === 'house' ? area.houses : area.all;
    if (!block || block.median_gbp_per_sqft == null) return {label: '£ per sq ft', value: NOT, source: (pps.method || '')};
    return {label: '£ per sq ft', value: '£' + Math.round(block.median_gbp_per_sqft).toLocaleString('en-GB') + '/sq ft, n=' + block.n, source: 'Town median in comps/home-ppsqft.json. The lot has no floor area, so this is not a value for this building.'};
  }

  function featured(matches) {
    const list = matches || [];
    const pick = function (test) { return list.filter(test).sort(byScore)[0] || null; };
    return [
      {key: 'bristol-ea', title: 'Bristol emergency accommodation', match: pick(function (match) {
        return /Emergency Accommodation \(EA\) Open Framework DN677298/.test(match.requirement.name) && /13 Hanover Street/.test(match.supply.address);
      })},
      {key: 'manchester-ta', title: 'Manchester long-term TA', match: pick(function (match) {
        return /Manchester long-term TA/.test(match.requirement.name) && match.supply.live && match.supply.form === 'house' && /^M\d/.test(match.supply.postcode || '') && match.supply.guide > 0;
      })},
      {key: 'wigan-lease', title: 'Wigan lease management', match: pick(function (match) {
        return /Wigan Council Lease/.test(match.requirement.name) && match.supply.channel === 'auction' && match.supply.town === 'Wigan' && match.supply.form !== 'commercial';
      })}
    ];
  }

  root.MatchModel = Object.freeze({
    NOT: NOT,
    WEIGHTS: WEIGHTS,
    EVIDENCE: EVIDENCE,
    buildRequirements: buildRequirements,
    auctionSupply: auctionSupply,
    watchSupply: watchSupply,
    score: score,
    rank: rank,
    withGates: withGates,
    sheetInput: sheetInput,
    runUnderwrite: runUnderwrite,
    soldLine: soldLine,
    ppsLine: ppsLine,
    featured: featured,
    parseRent: parseRent,
    parseTerm: parseTerm,
    parseSpec: parseSpec,
    placeOf: placeOf,
    lotKind: lotKind,
    money: money
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
