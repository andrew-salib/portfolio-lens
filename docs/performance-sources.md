# ETF performance source audit

Fetched and verified on 2026-09-19 using the official issuer URLs stored beside
each record in `lib/performance-snapshots.json`. These are reviewed snapshots,
not a live price feed. No unattended issuer refresh job is configured.

| Funds                                       | Selected source series                                                | Reporting date | Currency |
| ------------------------------------------- | --------------------------------------------------------------------- | -------------- | -------- |
| VGS                                         | Vanguard factsheet, **ETF total** column (not ETF gross or benchmark) | 2026-08-31     | AUD      |
| NDQ, XMET                                   | Betashares **Fund returns after fees**, Fund column                   | 2026-08-31     | AUD      |
| AINF                                        | Global X **Total Return (Fund)** row                                  | 2026-09-17     | AUD      |
| IVV, ITOT, IXUS, IWM, IYW, SOXX, IEFA, IEMG | iShares **Average Annual**, Total Return row                          | 2026-06-30     | USD      |

The iShares pages have multiple dates and return tables. The displayed average
annual table reports June 30; do not substitute a newer NAV date or another date
in its dropdown. IVV here is the existing US-listed fund in the catalogue, not
the Australian listing. The issuer's structured performance data also records
the selected date in its `dateModified` field.

One year is a trailing one-year total return. Three, five and ten years are
annualised returns, not cumulative returns or individual calendar-year returns.
All selected series are fund returns including distributions, rather than
benchmark, market-price or investor after-tax returns. See each record's basis
for fee details. Preserve negative and zero returns. A missing period is `null`.

XMET began on 2022-10-26 and has no five-/ten-year fund return. Its five-year
index performance must not fill that gap. AINF began on 2025-04-28 and has no
three-/five-/ten-year fund return. Custom imported funds have no performance
until an official issuer report is verified and entered.

## Updating the records

1. Fetch the official URL recorded for the ETF and inspect the fund-return table.
2. Verify the correct fund/listing, currency, reporting date and net total-return
   series. For PDFs, check the column headings against the return values.
3. Update the four values, `asOf`, `fetchedAt`, source and basis in
   `lib/performance-snapshots.json`. Never infer an unreported period.
4. Run `npm run db:seed-performance` after applying the performance migration.
   It upserts by `etf_id` without overwriting a newer stored reporting date.
5. Rebuild the front end through the review/merge process to update its offline
   copy. Database seeding alone does not update the GitHub Pages bundle.

This workflow deliberately requires issuer review when refreshing data. Runtime
API requests only read the database; they do not scrape or trigger paid feeds.
