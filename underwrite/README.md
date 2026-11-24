# Ecosystem Underwrite

A separate static page from the Deals screens. It uses the same `assets/laurito.css` and `assets/ios.css` as Deals: the same header, tab bar, cards, tables, pills and buttons. It joins a recorded framework to a recorded lot, shows why the score moved, and opens the existing monthly model.

GitHub Pages serves it at `/underwrite/` on this repository. To move it into its own repository later, copy this folder and the shared scripts listed below, and keep the same relative layout (`../assets`, `../data`, `../comps`) or change the paths in `underwrite.js`.

## Flow

1. **Demand.** Frameworks and partners are read from the live Partners site. Each framework is linked to a partner when the partner record names it, or when the framework lists that partner as a supplier. Provider evidence (`presence.json`) adds contract, framework, block-contract, council-report and ownership rows whose text names the framework.
2. **Requirement.** Towns, regions, house / flat / HMO, bed counts, lease term and rent basis are read off the framework text. A range such as “3 or 5 years”, a maximum, or “the council keeps a share” does not become a single number.
3. **Supply.** Live auction lots use the same current-lot test as Deals (`assets/current-lots.js`). Watchlist titles come from `pre_distress.json`. A commercial, land or development lot is not matched to a residential requirement.
4. **Evidence.** Sold-price medians, £ per sq ft, Local Housing Allowance against open-market rent, and area yields are the published area figures. They are not a valuation of the lot. `valuation_audit.json` is not joined, because a lot has no shared transaction id.
5. **Underwrite.** Guide price is prefilled. Rent is prefilled only when the framework states a figure paid to the owner. The 14 gates run through `assets/gates-model.js` on the output of `assets/quick-model.js`. “Open the deal sheet” stores those inputs in this browser and opens the Deals deal sheet.

## Score

Each part is out of a fixed maximum. A part with no evidence is **not recorded** and is left out of the total, not scored as zero.

| Part | Maximum | How the points are given |
| --- | ---: | --- |
| Location | 30 | 30 when the lot’s town is named on the framework. 22 when no town is named and the region matches. 12 when the framework is national and a linked partner records the town. Any other case is not a match. |
| Type | 25 | 18 when the lot’s form is one the framework records, plus 7 when the bed count is inside a recorded range. 16 when the lot is residential and the framework does not record a form. 8 when the lot’s type is not recorded. 6 when the form is recorded and does not match. Commercial, land and development lots drop out. |
| Rent cover | 15 | Scored only when a rent paid to the owner is recorded. A published maximum, or a basis that says a share is kept, is shown and not used as the rent. |
| Distress | 15 | 15 insolvency wording, 12 receiver or mortgagee wording, 8 watchlist title, 5 live auction with no distress wording. |
| Gates | 15 | `cleared / 14 × 15` after the monthly model runs. Until rent and operating costs are both present this part is not recorded. Qualitative gates stay on “needs evidence”. A full pass is all 14. |

The default shortlist keeps town-level matches (location 30) and live lots. Region-only and watchlist rows are still calculated; the filters show them. The eight highest supplies are kept for each framework so one wide framework cannot fill the page.

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
- `../comps/area-yields.json` and `../comps/yields.json` via `assets/area-yields.js` and `assets/niy.js`
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
- `niy.js` — net initial yield comps
- `area-yields.js` — published yield sets
- `current-lots.js` — which auction rows are still live

`underwrite/match-model.js` is the scoring for this page. `node --test underwrite/match-model.test.js` checks it against the JSON in this repo.
