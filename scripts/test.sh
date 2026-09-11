#!/usr/bin/env bash
# NWC trend tracker tests: metric edge cases + static first-paint HTML.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

passed=0
failed=0

pass() {
  echo "PASS: $1"
  passed=$((passed + 1))
}

fail() {
  echo "FAIL: $1"
  failed=$((failed + 1))
}

node_ok() {
  local name="$1"
  local code="$2"
  if node -e "$code"; then
    pass "$name"
  else
    fail "$name"
  fi
}

# --- Metric engine ---

node_ok "NWC is current assets minus current liabilities" '
const NWC = require("./js/nwc.js");
const v = NWC.nwc(5690000, 2860000);
if (v !== 2830000) { console.error(v); process.exit(1); }
'

node_ok "zero assets and positive liabilities yields negative NWC" '
const NWC = require("./js/nwc.js");
const v = NWC.nwc(0, 400000);
if (v !== -400000) { console.error(v); process.exit(1); }
const row = NWC.computeRow({ month: "2024-01", currentAssets: 0, currentLiabilities: 400000, revenue: 100000, opex: 80000 });
if (row.nwc !== -400000) process.exit(1);
if (!Number.isFinite(row.nwc) || Number.isNaN(row.nwc)) process.exit(1);
'

node_ok "zero liabilities yields NWC equal to assets" '
const NWC = require("./js/nwc.js");
const v = NWC.nwc(500000, 0);
if (v !== 500000) { console.error(v); process.exit(1); }
'

node_ok "zero assets and zero liabilities yields NWC 0 not null" '
const NWC = require("./js/nwc.js");
const v = NWC.nwc(0, 0);
if (v !== 0) { console.error(v); process.exit(1); }
if (v === null || Number.isNaN(v)) process.exit(1);
'

node_ok "zero revenue yields null NWC-to-revenue not Infinity" '
const NWC = require("./js/nwc.js");
const ratio = NWC.nwcToRevenue(2500000, 0);
if (ratio !== null) { console.error(ratio); process.exit(1); }
if (ratio === Infinity || Number.isNaN(ratio)) process.exit(1);
const row = NWC.computeRow({ month: "2024-01", currentAssets: 300, currentLiabilities: 100, revenue: 0, opex: 50 });
if (row.nwc !== 200) process.exit(1);
if (row.nwcToRevenue !== null) process.exit(1);
if (row.turnover !== 0) process.exit(1);
'

node_ok "zero NWC yields null turnover not Infinity" '
const NWC = require("./js/nwc.js");
const t = NWC.turnover(1800000, 0);
if (t !== null) { console.error(t); process.exit(1); }
if (t === Infinity || Number.isNaN(t)) process.exit(1);
const row = NWC.computeRow({ month: "2024-01", currentAssets: 100, currentLiabilities: 100, revenue: 50, opex: 40 });
if (row.nwc !== 0) process.exit(1);
if (row.turnover !== null) process.exit(1);
if (row.nwcToRevenue !== 0) process.exit(1);
if (row.monthsCoverage !== 0) process.exit(1);
'

node_ok "zero opex yields null months-of-coverage not Infinity" '
const NWC = require("./js/nwc.js");
const c = NWC.monthsCoverage(2500000, 0);
if (c !== null) { console.error(c); process.exit(1); }
if (c === Infinity || Number.isNaN(c)) process.exit(1);
const row = NWC.computeRow({ month: "2024-01", currentAssets: 400, currentLiabilities: 100, revenue: 80, opex: 0 });
if (row.monthsCoverage !== null) process.exit(1);
if (row.nwc !== 300) process.exit(1);
'

node_ok "null inputs return null not NaN" '
const NWC = require("./js/nwc.js");
if (NWC.nwc(null, 1) !== null) process.exit(1);
if (NWC.nwc(1, null) !== null) process.exit(1);
if (NWC.nwc(undefined, undefined) !== null) process.exit(1);
if (NWC.nwcToRevenue(null, 10) !== null) process.exit(1);
if (NWC.turnover(10, null) !== null) process.exit(1);
if (NWC.monthsCoverage(null, null) !== null) process.exit(1);
const row = NWC.computeRow({ month: "2024-01", currentAssets: null, currentLiabilities: null, revenue: null, opex: null });
if (row.nwc !== null || row.nwcToRevenue !== null || row.turnover !== null || row.monthsCoverage !== null) process.exit(1);
if (Number.isNaN(row.nwc) || row.nwc === Infinity) process.exit(1);
if (NWC.computeRow(null).nwc !== null) process.exit(1);
'

node_ok "empty series returns empty months and null latest" '
const NWC = require("./js/nwc.js");
const r = NWC.computeTracker({ company: "T", months: [] });
if (r.months.length !== 0 || r.latest !== null || r.best !== null || r.worst !== null) process.exit(1);
if (r.averageNwc !== null || r.monthCount !== 0) process.exit(1);
'

node_ok "null dataset is safe" '
const NWC = require("./js/nwc.js");
const r = NWC.computeTracker(null);
if (!r || r.months.length !== 0 || r.latest !== null) process.exit(1);
if (r.monthCount !== 0) process.exit(1);
'

node_ok "NWC-to-revenue and turnover are reciprocals when both defined" '
const NWC = require("./js/nwc.js");
const row = NWC.computeRow({ month: "2024-06", currentAssets: 500, currentLiabilities: 200, revenue: 100, opex: 80 });
if (row.nwc !== 300) process.exit(1);
if (Math.abs(row.nwcToRevenue - 3) > 1e-9) process.exit(1);
if (Math.abs(row.turnover - 1 / 3) > 1e-9) process.exit(1);
if (Math.abs(row.nwcToRevenue * row.turnover - 1) > 1e-9) process.exit(1);
if (Math.abs(row.monthsCoverage - 300 / 80) > 1e-9) process.exit(1);
'

node_ok "never emits NaN or Infinity on sample data" '
const NWC = require("./js/nwc.js");
const data = require("./data/nwc.json");
const r = NWC.computeTracker(data);
const keys = ["nwc", "nwcToRevenue", "turnover", "monthsCoverage", "currentAssets", "currentLiabilities", "revenue", "opex"];
function walk(obj) {
  if (obj === null || obj === undefined) return;
  if (typeof obj === "number") {
    if (!Number.isFinite(obj)) process.exit(1);
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) walk(item);
    return;
  }
  if (typeof obj === "object") {
    for (const key of Object.keys(obj)) walk(obj[key]);
  }
}
walk(r);
for (const row of r.months) {
  for (const key of keys) {
    const v = row[key];
    if (v === null) continue;
    if (!Number.isFinite(v)) process.exit(1);
  }
}
if (r.monthCount < 12 || r.monthCount > 18) process.exit(1);
if (r.latest.nwc !== 2830000) process.exit(1);
'

node_ok "MoM is null on first month and signed after" '
const NWC = require("./js/nwc.js");
const data = require("./data/nwc.json");
const r = NWC.computeTracker(data);
if (r.months[0].mom.nwc !== null) process.exit(1);
if (r.months[0].mom.nwcToRevenue !== null) process.exit(1);
const second = r.months[1];
if (!second.mom.nwc || typeof second.mom.nwc.delta !== "number") process.exit(1);
if (!Number.isFinite(second.mom.nwc.delta)) process.exit(1);
if (second.nwc - r.months[0].nwc !== second.mom.nwc.delta) process.exit(1);
'

node_ok "momTrend null previous or current returns null" '
const NWC = require("./js/nwc.js");
if (NWC.momTrend(null, 1, true) !== null) process.exit(1);
if (NWC.momTrend(1, null, true) !== null) process.exit(1);
if (NWC.momTrend(null, null, true) !== null) process.exit(1);
const t = NWC.momTrend(2830000, 2650000, true, 0);
if (!t || t.delta !== 180000 || t.improving !== true) process.exit(1);
const z = NWC.momTrend(10, 0, true);
if (!z || z.delta !== 10 || z.pct !== null) process.exit(1);
'

node_ok "target comparison meeting and missing" '
const NWC = require("./js/nwc.js");
const meet = NWC.vsTarget(2830000, 2500000, true);
if (!meet || meet.meeting !== true || meet.delta !== 330000) process.exit(1);
const miss = NWC.vsTarget(2100000, 2500000, true);
if (!miss || miss.meeting !== false) process.exit(1);
const ceiling = NWC.vsTarget(1.19, 1.4, false);
if (!ceiling || ceiling.meeting !== true) process.exit(1);
const over = NWC.vsTarget(1.5, 1.4, false);
if (!over || over.meeting !== false) process.exit(1);
if (NWC.vsTarget(null, 1, true) !== null) process.exit(1);
if (NWC.vsTarget(1, 0, true).pct !== null) process.exit(1);
'

node_ok "sample data has 12 to 18 months with required inputs and targets" '
const data = require("./data/nwc.json");
if (!Array.isArray(data.months) || data.months.length < 12 || data.months.length > 18) process.exit(1);
if (data.targets == null || data.targets.nwc == null) process.exit(1);
for (const row of data.months) {
  if (!row.month || row.currentAssets == null || row.currentLiabilities == null) process.exit(1);
  if (row.revenue == null || row.opex == null) process.exit(1);
}
const r = require("./js/nwc.js").computeTracker(data);
if (!r.best || !r.worst || r.best.nwc < r.worst.nwc) process.exit(1);
if (r.latest.vsTarget.nwc == null) process.exit(1);
'

# --- Static HTML first paint ---

if [[ ! -f index.html ]]; then
  fail "index.html exists"
else
  pass "index.html exists"
fi

if grep -qi "Loading" index.html; then
  fail "static HTML has no Loading shell"
else
  pass "static HTML has no Loading shell"
fi

if grep -qi "NWC" index.html && grep -qi "NWC-to-revenue\|NWC / monthly revenue\|nwc-to-revenue" index.html && grep -qi "turnover" index.html && grep -qi "coverage" index.html; then
  pass "static HTML contains NWC / ratios / coverage content"
else
  fail "static HTML contains NWC / ratios / coverage content"
fi

if [[ -f .nojekyll ]]; then
  pass ".nojekyll exists for GitHub Pages"
else
  fail ".nojekyll exists for GitHub Pages"
fi

node_ok "static HTML contains computed latest metric numbers" '
const fs = require("fs");
const NWC = require("./js/nwc.js");
const data = require("./data/nwc.json");
const html = fs.readFileSync("index.html", "utf8");
const r = NWC.computeTracker(data);
const nwcText = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(r.latest.nwc);
const ratio = NWC.formatRatio(r.latest.nwcToRevenue, 2);
const turn = NWC.formatRatio(r.latest.turnover, 2);
const cov = NWC.formatRatio(r.latest.monthsCoverage, 2);
if (!html.includes(nwcText)) { console.error("missing NWC", nwcText); process.exit(1); }
if (!ratio || !html.includes(ratio)) { console.error("missing nwc/rev", ratio); process.exit(1); }
if (!turn || !html.includes(turn)) { console.error("missing turnover", turn); process.exit(1); }
if (!cov || !html.includes(cov)) { console.error("missing coverage", cov); process.exit(1); }
if (!html.includes("data-metric=\"nwc\"")) process.exit(1);
if (!html.includes("data-metric=\"nwcToRevenue\"")) process.exit(1);
if (!html.includes("data-metric=\"turnover\"")) process.exit(1);
if (!html.includes("data-metric=\"monthsCoverage\"")) process.exit(1);
if (!html.includes("<table")) process.exit(1);
if (!html.includes("id=\"monthly-nwc\"")) process.exit(1);
if (html.toLowerCase().includes("loading")) process.exit(1);
'

node_ok "static HTML has a row for every sample month" '
const fs = require("fs");
const NWC = require("./js/nwc.js");
const data = require("./data/nwc.json");
const html = fs.readFileSync("index.html", "utf8");
const r = NWC.computeTracker(data);
if (r.months.length < 12) process.exit(1);
for (const row of r.months) {
  if (!html.includes("data-month=\"" + row.month + "\"")) { console.error("missing month", row.month); process.exit(1); }
}
if (!html.includes("target-comparison")) process.exit(1);
if (!html.includes("Best NWC") || !html.includes("Worst NWC")) process.exit(1);
'

# curl first-paint (no JS execution)
PORT=8766
python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/nwc-http.log 2>&1 &
HTTP_PID=$!
cleanup() { kill "$HTTP_PID" 2>/dev/null || true; }
trap cleanup EXIT

ready=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf "http://127.0.0.1:${PORT}/" >/dev/null; then
    ready=1
    break
  fi
  sleep 0.2
done

if [[ "$ready" -ne 1 ]]; then
  fail "local HTTP server started for curl"
else
  pass "local HTTP server started for curl"
  HTML="$(curl -sL "http://127.0.0.1:${PORT}/")"
  if echo "$HTML" | grep -qi "NWC" && echo "$HTML" | grep -qi "turnover" && echo "$HTML" | grep -qi "coverage"; then
    pass "curl first-paint contains NWC / turnover / coverage content"
  else
    fail "curl first-paint contains NWC / turnover / coverage content"
  fi
  if echo "$HTML" | grep -q "\$2,830,000"; then
    pass "curl first-paint contains latest NWC number"
  else
    fail "curl first-paint contains latest NWC number"
  fi
  if echo "$HTML" | grep -q "data-month="; then
    pass "curl first-paint contains monthly table rows"
  else
    fail "curl first-paint contains monthly table rows"
  fi
  if echo "$HTML" | grep -qi "Loading"; then
    fail "curl first-paint has no Loading shell"
  else
    pass "curl first-paint has no Loading shell"
  fi
  MONTH_ROWS="$(echo "$HTML" | grep -c "data-month=" || true)"
  if [[ "$MONTH_ROWS" -ge 12 ]]; then
    pass "curl first-paint has at least 12 month rows"
  else
    fail "curl first-paint has at least 12 month rows"
  fi
fi

echo "Summary: ${passed} passed, ${failed} failed"
if [[ "$failed" -ne 0 ]]; then
  exit 1
fi
exit 0
