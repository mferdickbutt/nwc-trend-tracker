# Net working capital trend tracker

Public monthly NWC dashboard for **Northwind Components**. **First paint is the metrics and table** — `index.html` is generated with NWC, NWC-to-revenue, working capital turnover, months-of-coverage, MoM, and target comparison already in the markup. JavaScript only adds a `js-enhanced` class.

Sample series: **15 months** (Jan 2025–Mar 2026).

## Formulas

All inputs are **monthly** (not trailing-twelve-month and not annualized). Unsafe math returns `null` (never `NaN` or `Infinity`).

| Metric | Formula | Period convention |
| --- | --- | --- |
| **NWC** | `currentAssets − currentLiabilities` | Point-in-time balances for that month. Zero assets and/or liabilities are valid (`0 − 0 = 0`). Null on either side → `null`. |
| **NWC-to-revenue** | `NWC / monthly revenue` | How many months of that month’s revenue are tied up in NWC. Zero revenue → `null`. |
| **Working capital turnover** | `monthly revenue / NWC` | Revenue generated per dollar of NWC in that month. Reciprocal of NWC-to-revenue when both are defined. Zero NWC → `null`. |
| **Months-of-coverage** | `NWC / monthly opex` | How many months of that month’s operating expenses NWC could cover. Not `revenue / 12`. Zero opex → `null`. |
| **MoM** | `this month − prior month` | First month is `n/a`. Percent change uses `Δ / \|prior\|`; prior of `0` → percent `null`. Higher NWC, turnover, and coverage are treated as improving; lower NWC-to-revenue is improving (less capital tied up). |
| **vs target** | `value − target` | **NWC** and **coverage** and **turnover** are floors (meeting when `value ≥ target`). **NWC-to-revenue** is a ceiling (meeting when `value ≤ target`). |

Zero-denominator and missing-input cases:

- zero assets, positive liabilities → negative NWC (finite)
- zero liabilities → NWC equals assets
- zero revenue → NWC-to-revenue `null`; turnover `0` if NWC ≠ 0
- zero NWC → turnover `null`; NWC-to-revenue `0` if revenue ≠ 0; coverage `0` if opex ≠ 0
- zero opex → months-of-coverage `null`
- null / empty / non-finite inputs → `null`
- empty series / null dataset → empty months, `latest = null`

`js/nwc.js` is a pure browser + Node module (`NWC` global, or `require('./js/nwc.js')`).

## Data schema

`data/nwc.json` (`nwc-trend/v1`):

- `months[]` — `{ month, currentAssets, currentLiabilities, revenue, opex }`
- `targets.nwc` — liquidity floor (USD)
- `targets.nwcToRevenue` — efficiency ceiling (NWC / monthly revenue)
- `targets.turnover` — minimum monthly revenue / NWC
- `targets.monthsCoverage` — minimum NWC / monthly opex
- `targetPolarity` — `floor` or `ceiling` per metric

## How to re-render

After editing `data/nwc.json` or `js/nwc.js`:

```bash
node scripts/render-static.js
```

That rewrites `index.html` (summary cards, target comparison, best/worst, sparkline, monthly table). Do not hand-edit the baked numbers. `.nojekyll` is present so GitHub Pages will serve the site as static files.

```bash
bash scripts/test.sh
```

Tests cover zero assets / zero liabilities / zero revenue / zero opex / null / empty fixtures, plus a static-HTML first-paint check (`curl -sL` of local `index.html`, not a Loading-only shell).

## Files

- `data/nwc.json` — 15 months of balances, revenue, opex, and targets
- `js/nwc.js` — browser + Node module for all metrics, MoM, targets, best/worst
- `js/enhance.js` — optional class flag only; does not supply numbers
- `scripts/render-static.js` — static HTML baker
- `index.html` — first-paint snapshot
- `css/style.css` — minimal layout
- `.nojekyll` — serve as plain files on GitHub Pages

## Suggested next improvements

- Replace the sample JSON with a live pull from the GL (current assets / current liabilities roll-forwards) and the P&L (monthly revenue and opex).
- Add a trailing-twelve-month NWC-to-revenue and annualized turnover (`monthly revenue × 12 / NWC`) next to the period-matched figures for peer comparison.
- Cash conversion cycle (DSO + DIO − DPO) on the same monthly spine.
- Scenario band: what NWC would be if receivables, inventory, or payables moved 10 days.
- Multi-entity consolidation with eliminations, not only Northwind Components.
