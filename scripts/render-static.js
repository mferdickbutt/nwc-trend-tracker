#!/usr/bin/env node
/**
 * Bake computed NWC metrics into index.html so first paint needs no JavaScript.
 *
 * Usage: node scripts/render-static.js
 */
"use strict";

var fs = require("fs");
var path = require("path");
var NWC = require("../js/nwc.js");

var ROOT = path.resolve(__dirname, "..");
var DATA_PATH = path.join(ROOT, "data", "nwc.json");
var OUT_PATH = path.join(ROOT, "index.html");

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function monthLabel(ym) {
  if (!ym || typeof ym !== "string" || ym.length < 7) return ym || "—";
  var parts = ym.split("-");
  var year = Number(parts[0]);
  var month = Number(parts[1]);
  if (!year || !month) return ym;
  return new Date(year, month - 1, 1).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function money(n, currency) {
  if (n === null || n === undefined) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);
  } catch (err) {
    return String(n);
  }
}

function signedMoney(n, currency) {
  if (n === null || n === undefined) return "—";
  var formatted = money(Math.abs(n), currency);
  if (n > 0) return "+" + formatted;
  if (n < 0) return "−" + formatted;
  return formatted;
}

function ratioText(n, digits) {
  var formatted = NWC.formatRatio(n, digits == null ? 2 : digits);
  return formatted === null ? "—" : formatted;
}

function pctText(n, digits) {
  var formatted = NWC.formatPct(n, digits == null ? 1 : digits);
  return formatted === null ? "—" : formatted + "%";
}

function trendHtml(mom, unit) {
  if (!mom) return '<span class="trend na">MoM n/a</span>';
  var arrow = mom.direction === "up" ? "↑" : mom.direction === "down" ? "↓" : "→";
  var cls = mom.flat ? "flat" : mom.improving ? "improving" : "worsening";
  var delta;
  if (mom.flat) {
    delta = unit === "money" ? money(0) : unit === "pct" ? "0.0pp" : "0.00";
  } else if (unit === "money") {
    delta = signedMoney(mom.delta);
  } else if (unit === "pct") {
    delta = (mom.delta > 0 ? "+" : "") + (mom.delta * 100).toFixed(1) + "pp";
  } else if (unit === "ratio") {
    delta = (mom.delta > 0 ? "+" : "") + mom.delta.toFixed(4);
  } else {
    delta = (mom.delta > 0 ? "+" : "") + String(mom.delta);
  }
  var word = mom.flat ? "unchanged" : mom.improving ? "improving" : "worsening";
  var pct =
    mom.pct === null || mom.pct === undefined
      ? ""
      : " · " + (mom.pct > 0 ? "+" : mom.pct < 0 ? "−" : "") + Math.abs(mom.pct * 100).toFixed(1) + "%";
  return (
    '<span class="trend ' +
    cls +
    '">' +
    arrow +
    " " +
    esc(delta) +
    pct +
    " MoM (" +
    word +
    ")</span>"
  );
}

function pill(vs) {
  if (!vs) return '<span class="pill">no target</span>';
  var cls = vs.meeting ? "meeting" : "missing";
  var word = vs.meeting ? "meeting" : "missing";
  return '<span class="pill ' + cls + '">' + word + " target</span>";
}

function sparkline(months) {
  var width = 1040;
  var height = 64;
  var values = months.map(function (m) {
    return m.nwc;
  });
  var usable = values.filter(function (v) {
    return v !== null;
  });
  if (usable.length < 2) return "";
  var min = Math.min.apply(null, usable);
  var max = Math.max.apply(null, usable);
  var span = max - min || 1;
  var coords = [];
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    if (v === null) continue;
    var x = (i / (values.length - 1)) * width;
    var y = height - ((v - min) / span) * (height - 8) - 4;
    coords.push(x.toFixed(1) + "," + y.toFixed(1));
  }
  var last = months[months.length - 1];
  var first = months[0];
  return (
    '<div class="spark" id="nwc-sparkline">' +
    '<p class="note">NWC trend (' +
    esc(monthLabel(first.month)) +
    " → " +
    esc(monthLabel(last.month)) +
    ")</p>" +
    '<svg viewBox="0 0 ' +
    width +
    " " +
    height +
    '" role="img" aria-label="Net working capital sparkline from ' +
    esc(money(first.nwc)) +
    " to " +
    esc(money(last.nwc)) +
    '">' +
    '<polyline fill="none" stroke="#0f6e6e" stroke-width="3" points="' +
    coords.join(" ") +
    '" />' +
    "</svg></div>"
  );
}

function cardHtml(latest, key, title, name, valueHtml, unit, momUnit) {
  var mom = latest.mom ? latest.mom[key] : null;
  var vs = latest.vsTarget ? latest.vsTarget[key] : null;
  return (
    '<article class="card" id="card-' +
    key +
    '">' +
    '<p class="label">' +
    esc(title) +
    "</p>" +
    '<p class="name">' +
    esc(name) +
    "</p>" +
    '<p class="metric-value" data-metric="' +
    key +
    '">' +
    valueHtml +
    (unit ? ' <span class="unit">' + esc(unit) + "</span>" : "") +
    "</p>" +
    '<div class="meta">' +
    trendHtml(mom, momUnit) +
    pill(vs) +
    "</div></article>"
  );
}

function signedText(formatFn, n) {
  if (n === null || n === undefined) return "—";
  var text = formatFn(Math.abs(n));
  if (n > 0) return "+" + text;
  if (n < 0) return "−" + text;
  return text;
}

function targetCard(label, vs, formatFn) {
  if (!vs) {
    return (
      '<article class="target-card"><p class="label">' +
      esc(label) +
      '</p><p class="values">—</p></article>'
    );
  }
  return (
    '<article class="target-card" data-target="' +
    esc(label) +
    '">' +
    '<p class="label">' +
    esc(label) +
    "</p>" +
    '<p class="values">' +
    esc(formatFn(vs.value)) +
    " vs " +
    esc(formatFn(vs.target)) +
    " (" +
    esc(signedText(formatFn, vs.delta)) +
    ")</p>" +
    pill(vs) +
    "</article>"
  );
}

function monthTable(report) {
  var currency = report.currency || "USD";
  var head =
    "<thead><tr>" +
    "<th>Month</th>" +
    "<th>Current assets</th><th>Current liabilities</th>" +
    "<th>NWC</th><th>NWC MoM</th><th>NWC vs target</th>" +
    "<th>Revenue</th><th>NWC / revenue</th>" +
    "<th>Turnover</th><th>Opex</th><th>Months-of-coverage</th>" +
    "</tr></thead>";
  var rows = report.months.map(function (row) {
    var momNwc = row.mom && row.mom.nwc;
    var vsNwc = row.vsTarget && row.vsTarget.nwc;
    var missClass = vsNwc && vsNwc.meeting === false ? " class=\"miss\"" : "";
    function momShort(mom) {
      if (!mom) return '<span class="trend na">n/a</span>';
      var arrow = mom.direction === "up" ? "↑" : mom.direction === "down" ? "↓" : "→";
      var cls = mom.flat ? "flat" : mom.improving ? "improving" : "worsening";
      var delta = mom.flat ? money(0, currency) : signedMoney(mom.delta, currency);
      return '<span class="trend ' + cls + '">' + arrow + " " + esc(delta) + "</span>";
    }
    return (
      '<tr data-month="' +
      esc(row.month || "") +
      '"' +
      missClass +
      ">" +
      "<td>" +
      esc(monthLabel(row.month)) +
      ' <span class="note">(' +
      esc(row.month || "") +
      ")</span></td>" +
      "<td>" +
      esc(money(row.currentAssets, currency)) +
      "</td>" +
      "<td>" +
      esc(money(row.currentLiabilities, currency)) +
      "</td>" +
      '<td data-nwc="' +
      esc(money(row.nwc, currency)) +
      '">' +
      esc(money(row.nwc, currency)) +
      "</td>" +
      "<td>" +
      momShort(momNwc) +
      "</td>" +
      "<td>" +
      pill(vsNwc) +
      "</td>" +
      "<td>" +
      esc(money(row.revenue, currency)) +
      "</td>" +
      '<td data-nwc-to-revenue="' +
      esc(ratioText(row.nwcToRevenue)) +
      '">' +
      esc(ratioText(row.nwcToRevenue)) +
      "</td>" +
      '<td data-turnover="' +
      esc(ratioText(row.turnover)) +
      '">' +
      esc(ratioText(row.turnover)) +
      "×</td>" +
      "<td>" +
      esc(money(row.opex, currency)) +
      "</td>" +
      '<td data-coverage="' +
      esc(ratioText(row.monthsCoverage)) +
      '">' +
      esc(ratioText(row.monthsCoverage)) +
      " mo</td>" +
      "</tr>"
    );
  });
  return (
    '<div class="table-wrap"><table id="monthly-nwc">' +
    head +
    "<tbody>" +
    rows.join("") +
    "</tbody></table></div>"
  );
}

function render(dataset) {
  var report = NWC.computeTracker(dataset);
  if (!report.latest) {
    throw new Error("No months to render");
  }
  var latest = report.latest;
  var currency = report.currency || "USD";

  var cards =
    cardHtml(
      latest,
      "nwc",
      "Net working capital",
      "Current assets − current liabilities",
      esc(money(latest.nwc, currency)),
      "",
      "money"
    ) +
    cardHtml(
      latest,
      "nwcToRevenue",
      "NWC-to-revenue",
      "NWC / monthly revenue (period-matched)",
      esc(ratioText(latest.nwcToRevenue)),
      "months of revenue",
      "ratio"
    ) +
    cardHtml(
      latest,
      "turnover",
      "Working capital turnover",
      "Monthly revenue / NWC",
      esc(ratioText(latest.turnover)),
      "×",
      "ratio"
    ) +
    cardHtml(
      latest,
      "monthsCoverage",
      "Months-of-coverage",
      "NWC / monthly opex",
      esc(ratioText(latest.monthsCoverage)),
      "mo of opex",
      "ratio"
    );

  var nwcVs = latest.vsTarget && latest.vsTarget.nwc;
  var targets =
    '<div class="target-grid" id="target-comparison">' +
    targetCard("NWC vs liquidity floor", nwcVs, function (n) {
      return money(n, currency);
    }) +
    targetCard("NWC / revenue vs efficiency ceiling", latest.vsTarget.nwcToRevenue, function (n) {
      return ratioText(n);
    }) +
    targetCard("Turnover vs floor", latest.vsTarget.turnover, function (n) {
      return ratioText(n) + "×";
    }) +
    targetCard("Coverage vs floor", latest.vsTarget.monthsCoverage, function (n) {
      return ratioText(n) + " mo";
    }) +
    "</div>";

  var best = report.best;
  var worst = report.worst;
  var extremaHtml =
    '<div class="extrema" id="nwc-extrema">' +
    "<article><h3>Best NWC</h3><p>" +
    (best
      ? esc(monthLabel(best.month)) +
        " (" +
        esc(best.month) +
        "): " +
        esc(money(best.nwc, currency))
      : "—") +
    "</p></article>" +
    "<article><h3>Worst NWC</h3><p>" +
    (worst
      ? esc(monthLabel(worst.month)) +
        " (" +
        esc(worst.month) +
        "): " +
        esc(money(worst.nwc, currency))
      : "—") +
    "</p></article></div>";

  var avgLine =
    "Average NWC across " +
    report.monthCount +
    " months: " +
    money(report.averageNwc, currency) +
    ". NWC target is a liquidity floor (meeting when NWC ≥ target). NWC-to-revenue is an efficiency ceiling (meeting when ratio ≤ target). Turnover and months-of-coverage are floors.";

  return (
    "<!DOCTYPE html>\n" +
    '<html lang="en">\n' +
    "<head>\n" +
    '  <meta charset="utf-8" />\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
    "  <title>NWC trend tracker — " +
    esc(report.company || "Tracker") +
    "</title>\n" +
    '  <link rel="stylesheet" href="css/style.css" />\n' +
    "</head>\n" +
    "<body>\n" +
    '  <header class="hero">\n' +
    '    <div class="wrap">\n' +
    '      <p class="kicker">Working capital</p>\n' +
    "      <h1>Net working capital trend tracker</h1>\n" +
    '      <p class="sub">' +
    esc(report.company || "Sample company") +
    " · " +
    String(report.monthCount) +
    " months of monthly current assets, current liabilities, revenue, and opex. NWC, NWC-to-revenue, working capital turnover, months-of-coverage, MoM, and target comparison are baked into this HTML for first paint without JavaScript.</p>\n" +
    '      <div class="formula-strip" aria-label="Formulas">\n' +
    "        <code>NWC = current assets − current liabilities</code>\n" +
    "        <code>NWC-to-revenue = NWC / monthly revenue</code>\n" +
    "        <code>turnover = monthly revenue / NWC</code>\n" +
    "        <code>months-of-coverage = NWC / monthly opex</code>\n" +
    "      </div>\n" +
    "    </div>\n" +
    "  </header>\n" +
    '  <main class="wrap">\n' +
    '    <section class="section" id="latest">\n' +
    "      <h2>Latest month · " +
    esc(monthLabel(latest.month)) +
    " (" +
    esc(latest.month) +
    ") — NWC, ratios, and coverage</h2>\n" +
    '      <p class="note">' +
    esc(avgLine) +
    " All ratios use the same month’s revenue or opex (not trailing-twelve-month or annualized).</p>\n" +
    '      <div class="cards">' +
    cards +
    "</div>\n" +
    targets +
    extremaHtml +
    sparkline(report.months) +
    "    </section>\n" +
    '    <section class="section" id="monthly">\n' +
    "      <h2>Monthly NWC, NWC-to-revenue, turnover, and months-of-coverage</h2>\n" +
    '      <p class="note">Rows are calendar months. NWC MoM is latest minus prior month. A missing NWC target means the month is below the liquidity floor of ' +
    esc(money(report.targets.nwc, currency)) +
    ".</p>\n" +
    monthTable(report) +
    "    </section>\n" +
    "  </main>\n" +
    '  <footer class="wrap">\n' +
    "    <p>Static snapshot generated from <code>data/nwc.json</code> via <code>node scripts/render-static.js</code>. JavaScript only enhances; it does not supply these numbers.</p>\n" +
    "  </footer>\n" +
    '  <script src="js/nwc.js" defer></script>\n' +
    '  <script src="js/enhance.js" defer></script>\n' +
    "</body>\n" +
    "</html>\n"
  );
}

function main() {
  var raw = fs.readFileSync(DATA_PATH, "utf8");
  var dataset = JSON.parse(raw);
  var html = render(dataset);
  fs.writeFileSync(OUT_PATH, html);
  var report = NWC.computeTracker(dataset);
  process.stdout.write(
    "Wrote " +
      path.relative(ROOT, OUT_PATH) +
      " (" +
      report.monthCount +
      " months, latest NWC " +
      money(report.latest.nwc, report.currency) +
      ")\n"
  );
}

main();
