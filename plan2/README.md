# Laurito gates

A separate static page from the Deals screens. It uses the same `assets/laurito.css` and `assets/ios.css` as Deals: the same header, tab bar, cards, tables, pills and buttons. It joins a recorded framework to a recorded lot, shows why the score moved, and opens the existing monthly model.

GitHub Pages serves it at `/plan2/` on this repository. The Deals nav label is Laurito gates. The folder stays `plan2/` so existing links keep working. To move it into its own repository later, copy this folder and the shared scripts listed below, and keep the same relative layout (`../assets`, `../data`, `../comps`) or change the paths in `plan2/underwrite.js`.

## Flow

1. **Demand.** Frameworks and partners are read from the live Partners site. Each framework is linked to a partner when the partner record names it, or when the framework lists that partner as a supplier. Provider evidence (`presence.json`) adds contract, framework, block-contract, council-report and ownership rows whose text names the framework.
2. **Requirement.** Each framework shows the asset: homes needed, unit type, bedrooms, locations, lease term, rent basis, rent level, repairs, voids, breaks, indexation, start, end and contract value. A field with no recorded fact says not recorded, and those fields are listed as what is still needed. A range, a maximum, or “the council keeps a share” does not become a single rent.
3. **Supply.** Live auction lots use the same current-lot test as Deals (`assets/current-lots.js`). Watchlist titles come from `pre_distress.json`. A commercial, land or development lot is not matched to a residential requirement.
4. **Evidence.** Sold-price medians, £ per sq ft, Local Housing Allowance against open-market rent, and area yields are the published area figures. They are not a valuation of the lot. `valuation_audit.json` is not joined, because a lot has no shared transaction id.
5. **Underwrite.** The monthly cash flow is `assets/quick-model.js`, the same model as the Deals deal sheet: rent review, rent-free, headlease, ground rent, service charge, NIA and GIA, capex, renovation per sq ft, and the purchase and construction loans. Guide price is prefilled. Rent is prefilled only when the framework states a figure paid to the owner. Blank lease and debt fields change nothing. “Download this underwriting” saves the inputs and the monthly rows. The 14 gates run through `assets/gates-model.js`. Until rent and operating costs are recorded they say needs evidence.

## Procurement feeds

Find a Tender and Contracts Finder both serve OCDS JSON under the Open Government Licence. No API key was required for:

- `https://www.find-tender.service.gov.uk/api/1.0/ocdsReleasePackages`
- `https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search`

A sample page of 100 Contracts Finder releases, requested with the keyword “temporary accommodation”, still contained unrelated notices (vehicle fit-out, conference venues). The keyword was echoed in the next-page link and did not restrict the page. Where a notice does match, the structured fields are title, description, a contract value and sometimes a contract period. Items in the sample had no quantity and no unit. None of the three checked frameworks (Wigan lease management, Manchester long-term TA, Bristol EA DN677298) is a Contracts Finder notice in the framework source list. Wigan is a council landlord page. Manchester is a council decision. Bristol EA is on other tender sites.

So the feeds cannot fill homes needed, lease term, rent basis or the rent paid to the owner for these frameworks. Patrick does not need to register for the public read. A useful fill would need the notice id for each framework, and even then the rent and repair terms are usually only in the tender documents, which these calls do not return.

## BiP

`BiP` does not appear in this repository. It is on the Partners site. `v4-enrich.json` is published at `https://pgraham974.github.io/ecosystem-partners/v4-enrich.json` (HTTP 200). It was built 3 Nov 2026 from the Laurito opportunities workbook and includes licensed BiP Intelligence rows: 20 BiP records, 6 notices in `newItems`, and framework links. Laurito gates reads that file and lists schemes still to open, with the opening date and any homes figure in the text. It does not copy the file. A value there is a ceiling unless the file says actual. There is no separate BiP login in this repo. A newer BiP pull is a Partners-site rebuild, not a key for Laurito gates.

## Supply

Auction lots already in `data/auctions/lots.json` are the supply, plus the watchlist in `pre_distress.json`. The source inventory is `data/auctions/SOURCE-INVENTORY.md`. Rightmove states that scraping is prohibited. OnTheMarket forbids an automated copy of any page except the home page. Zoopla’s terms page returned 403 here and is not collected. BidX1 did not resolve. Those sites are not scraped. New only means the lot was first seen in the last 14 days.

## Score

Each part is out of a fixed maximum. A part with no evidence is **not recorded** and is left out of the total, not scored as zero.

| Part | Maximum | How the points are given |
| --- | ---: | --- |
| Location | 30 | 30 when the lot’s town is named on the framework. 22 when no town is named and the region matches. 12 when the framework is national and a linked partner records the town. Any other case is not a match. |
| Type | 25 | 18 when the lot’s form is one the framework records, plus 7 when the bed count is inside a recorded range. 16 when the lot is residential and the framework does not record a form. 8 when the lot’s type is not recorded. 6 when the form is recorded and does not match. Commercial, land and development lots drop out. |
| Rent cover | 15 | Scored only when a rent paid to the owner is recorded. A published maximum, or a basis that says a share is kept, is shown and not used as the rent. |
| Distress | 15 | 15 insolvency wording, 12 receiver or mortgagee wording, 8 watchlist title, 5 live auction with no distress wording. |
| Gates | 15 | `cleared / 14 × 15` after the monthly model runs. Until rent and operating costs are both present this part is not recorded. Qualitative gates stay on “needs evidence”. A full pass is all 14. |

The default shortlist keeps town-level matches (location 30) and live lots. Region-only and watchlist rows are still calculated; the filters show them. Twenty live lots and eight watchlist titles are kept for each framework, so one wide framework cannot fill the page. The shortlist can export the rows on screen as CSV.

Purchase costs 6.8%, a 50% loan, a 6.5% rate and a 6% exit yield are the deal sheet’s starting figures. They are labelled as such. Operating costs are left blank.

## Data URLs

Partners, read at runtime:

- `https://pgraham974.github.io/ecosystem-partners/frameworks.json`
- `https://pgraham974.github.io/ecosystem-partners/partners.json`
- `https://pgraham974.github.io/ecosystem-partners/provider_offers.json` and `presence.json` are not published on that site (they 404). The page loads `../provider_offers.json` and `../presence.json` from this repository instead, and says so. Requesting the missing URLs would log a browser error.

Deals files, same paths the Deals page uses, relative to this folder:

- `../data/auctions/lots.json`
- `../pre_distress.json`
- `../data/rent-scenarios.json` via `assets/rent-gap.js` (`build`, `areaOf`)
- `../comps/area-yields.json` via `assets/area-yields.js`. The NIY comparison is not shown.
- `https://pgraham974.github.io/ecosystem-partners/v4-enrich.json` for future schemes. That file includes licensed BiP Intelligence rows. It is read from the Partners site and is not copied into this repository.
- `../comps/home-ppsqft.json`
- `../prices.json`
- `../data/market-entry/gates.json`

Supabase, same project and anon key as `index.html`:

- `https://kkdfprhrgxbkydqeifgz.supabase.co/rest/v1/owners?select=company_no,name,distress_class&distress_class=neq.unknown`

A classified owner is shown as text on a watchlist title. It is not turned into an A, B or C grade. That grade is calculated in the Deals page and is not a shared module.

## Shared modules

Loaded from `../assets/` and not copied:

- `quick-model.js` — monthly underwriting
- `gates-model.js` — the 14 gates
- `rent-gap.js` — Local Housing Allowance against open-market rent
- `area-yields.js` — published yield sets
- `current-lots.js` — which auction rows are still live

`plan2/match-model.js` is the scoring for this page. `node --test plan2/match-model.test.js` checks it against the JSON in this repo.
