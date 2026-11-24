# Council leases

HM Land Registry does not publish the full Corporate and Commercial Ownership Data (now “UK companies that own property in England and Wales”) or the Registered Leases file without an account. On 24 Nov 2026 a request to `https://use-land-property-data.service.gov.uk/api/v1/datasets` with no key returned HTTP 403: “You need to provide your API Key”.

Nothing in those datasets was downloaded. `council-leases.json` records that gap. It does not contain invented titles.

## What Patrick does

1. Create an account at [use-land-property-data.service.gov.uk](https://use-land-property-data.service.gov.uk/) and sign in.
2. Agree the free licence for UK companies that own property in England and Wales (the file still named CCOD).
3. Agree a Registered Leases licence. The service lists non-commercial use as free and commercial use as paid. This site is a business tool, so confirm which licence applies before downloading.
4. Either:
   - add the account’s API key as the GitHub secret `HMLR_API_KEY` and run `node scripts/land-registry/council-leases.mjs`, or
   - download the full CCOD CSV and the full Registered Leases CSV (or their zip files) and put them in `data/land-registry/inbox/`, then run the same command.
5. Commit the regenerated `data/land-registry/council-leases.json`.

The script keeps leasehold titles whose proprietor category or name is a local authority, council or housing association, limited to the towns already used on this site. It joins Registered Leases on the title number for the lease date, the term and any premium. A blank premium stays “not recorded”. Up to 25 titles are stored per proprietor; the count is the full number.

Leases granted for seven years or less are not registered, so they cannot appear. Rent and the parties’ lease terms are not in either file. Each row links to the [title-number search](https://search-property-information.service.gov.uk/search/search-by-title-number), where an online copy of the register is £7.
