# New-deal source inventory

Checked 24 Nov 2026. A source is collected only when `scripts/auctions/sources.json` records `public_metadata_only`: a public catalogue, no automation ban found in the inspected terms, factual lot fields only. That is not an open-data licence. Anything else stays in the registry and is not collected.

Dedup is by premise, postcode, unit and auction date. A later observation of the same lot keeps the earliest `first_seen`. A new auction date is a separate deal. Laurito gates defaults to lots first seen in the last 14 days.

## Collected

| Source | New-deal value | Access | Terms | Reliability | Effort |
| --- | --- | --- | --- | --- | --- |
| Auction House (Manchester, North West, Cheshire, Birmingham, South West, Scotland) | New auction lots and the occasional receiver instruction, in the target towns | Public catalogue pages | No automation ban found on the inspected pages. Metadata only. [auctionhouse.co.uk](https://www.auctionhouse.co.uk/) | Already on the scheduled crawl | In the pipeline |
| Future Property Auctions | Scottish and some English auction lots | Public pages | No automation ban found. [buying terms](https://www.futurepropertyauctions.co.uk/buying_terms.asp) | Catalogue is often script-rendered, so counts are partial | In the pipeline |
| Braveheart | Edinburgh and Glasgow lots | Public pages | No automation ban found. [terms](https://braveheartauctions.co.uk/terms-conditions/) | Live check has sometimes found a lot the structured catalogue missed | In the pipeline |

## Not collected

| Source | New-deal value | Access that would be compliant | Why it is not scraped | What Patrick would set up |
| --- | --- | --- | --- | --- |
| Allsop | National residential auctions | A licensed feed or written permission | Catalogues were turned off on 17 Nov 2026. Do not turn the source back on. | Written reuse permission, then a reviewed adapter |
| Savills auctions | London and national lots, including receivership | Written permission. Terms forbid a permanent copy. [Savills terms](https://www.savills.co.uk/footer/terms-and-conditions.aspx) | “You may not make a permanent copy of or reproduce this website or any of its contents.” | Ask Savills for a data licence |
| Pugh, Mark Jenkinson | North West auction lots | Written consent for commercial use | Terms allow a personal hard copy and forbid commercial exploitation without consent | Written consent from the auctioneer |
| SDL, Network Auctions | National auction lots | A BTG licensed route | General reuse terms were not found, or the terms page 404s. Bidder terms are not a scraping licence | Ask BTG Eddisons for the canonical feed |
| Bond Wolfe | Birmingham lots | Written consent. The terms also restrict linking | Copying into another work is prohibited except for personal use | Written consent |
| Barnard Marcus | London and south-east lots | Manual research, or a licence | Terms say the site may only be accessed manually, not by an automated agent | A licensed feed. Do not automate |
| Strettons | London lots | A written commercial licence | Personal copy only | Written licence |
| iamsold | Online auction instructions | A licensed feed | Robots disallow lot pages. Commercial use of content needs a licence | Ask iamsold for a feed |
| EIG | Auction catalogues | A republishing licence. A normal subscription is not one | Terms forbid copying into electronic form. Robots disallow the crawl | A republishing licence |
| Countrywide, Town & Country, Bruton Knowles, Moore Allen, Hollis Morgan, Maggs & Allen | Regional instructions | Written permission | Personal or non-commercial use only, or reproduction needs prior permission | One written permission per firm |
| Clive Emson | South-east auctions, often ground rents | A reuse licence | No reuse licence was found. A privacy policy is not one | Ask before any collection |
| Bradleys | Local auctions | Unknown until the site answers | The live page and robots were challenged. Terms were not verified | Do not bypass the challenge |
| OPA | Scottish lots | Approval. Terms prohibit aggregation for another site | Not enabled | Written approval |
| Rightmove | New instructions across the agency market | Their partner or data licence. Email alerts are a manual route | The terms page says Rightmove prohibits scraping of its content. [Terms](https://www.rightmove.co.uk/this-site/terms-of-use.html) | A Rightmove data agreement, or parse alerts Patrick already receives. No scraper |
| Zoopla | New instructions | A partner API or licensed feed | This environment received HTTP 403 from the terms page, so the clause was not re-read. It is not collected | A Zoopla partner agreement. No scraper |
| OnTheMarket | New instructions | A permitted program that respects robots, limited to the home page, or a commercial licence | Terms forbid an automated program that searches or copies any page other than the home page. [Terms](https://www.onthemarket.com/terms/) | A data licence. Listing pages are out of scope |
| BidX1 | Online auction lots, including some receiver sales | Their catalogue terms, once the host resolves | `www.bidx1.com` did not resolve from this environment on 24 Nov 2026. Nothing was inferred | Confirm the live host and read the terms before any adapter |
| Receiver / LPA portals | The instruction itself, which the auction listing often already states | The auction catalogue, when that catalogue is already permitted | There is no separate receiver feed in this repo. A receiver tag is set only when the permitted lot page says so | None until a portal publishes terms that allow reuse |

Commercial portals other than the auctioneers above are not in the registry. They are not added here.
