/**
 * Net working capital (NWC) trend metrics.
 * Works in the browser (global NWC) and in Node (module.exports).
 *
 * Period convention: inputs are monthly (not TTM / annual).
 *
 *   NWC                      = currentAssets − currentLiabilities
 *   NWC-to-revenue           = NWC / monthly revenue
 *   Working capital turnover = monthly revenue / NWC
 *   Months-of-coverage       = NWC / monthly operating expenses (opex)
 *
 * Unsafe inputs (null/empty, non-finite, zero denominators) return null.
 * Never returns NaN or Infinity.
 */
(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    global.NWC = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var DEFAULT_POLARITY = {
    nwc: true,
    nwcToRevenue: false,
    turnover: true,
    monthsCoverage: true,
  };

  function toNum(value) {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "string" && value.trim() === "") return null;
    var n = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  function finiteOrNull(n) {
    if (n === null || n === undefined) return null;
    if (!Number.isFinite(n)) return null;
    return n;
  }

  function ratio(numer, denom) {
    var n = toNum(numer);
    var d = toNum(denom);
    if (n === null || d === null || d === 0) return null;
    return finiteOrNull(n / d);
  }

  function nwc(currentAssets, currentLiabilities) {
    var assets = toNum(currentAssets);
    var liabilities = toNum(currentLiabilities);
    if (assets === null || liabilities === null) return null;
    return finiteOrNull(assets - liabilities);
  }

  function nwcToRevenue(nwcValue, revenue) {
    return ratio(nwcValue, revenue);
  }

  function turnover(revenue, nwcValue) {
    return ratio(revenue, nwcValue);
  }

  function monthsCoverage(nwcValue, opex) {
    return ratio(nwcValue, opex);
  }

  function emptyRow() {
    return {
      month: null,
      currentAssets: null,
      currentLiabilities: null,
      revenue: null,
      opex: null,
      nwc: null,
      nwcToRevenue: null,
      turnover: null,
      monthsCoverage: null,
      mom: {
        nwc: null,
        nwcToRevenue: null,
        turnover: null,
        monthsCoverage: null,
      },
      vsTarget: {
        nwc: null,
        nwcToRevenue: null,
        turnover: null,
        monthsCoverage: null,
      },
    };
  }

  function computeRow(input) {
    if (!input || typeof input !== "object") {
      return emptyRow();
    }
    var assets = toNum(input.currentAssets);
    var liabilities = toNum(input.currentLiabilities);
    var revenue = toNum(input.revenue);
    var opex = toNum(input.opex);
    var nwcValue = nwc(assets, liabilities);
    var row = emptyRow();
    row.month = input.month == null ? null : String(input.month);
    row.currentAssets = assets;
    row.currentLiabilities = liabilities;
    row.revenue = revenue;
    row.opex = opex;
    row.nwc = nwcValue;
    row.nwcToRevenue = nwcToRevenue(nwcValue, revenue);
    row.turnover = turnover(revenue, nwcValue);
    row.monthsCoverage = monthsCoverage(nwcValue, opex);
    return row;
  }

  function momTrend(current, previous, higherIsBetter, roundDigits) {
    var c = toNum(current);
    var p = toNum(previous);
    if (c === null || p === null) return null;
    var delta = c - p;
    if (!Number.isFinite(delta)) return null;
    var digits = roundDigits == null ? 2 : roundDigits;
    var factor = Math.pow(10, digits);
    var rounded = Math.round(delta * factor) / factor;
    if (!Number.isFinite(rounded)) return null;
    if (rounded === 0) rounded = 0;
    var direction = rounded > 0 ? "up" : rounded < 0 ? "down" : "flat";
    var improving = false;
    if (direction !== "flat" && higherIsBetter != null) {
      improving = higherIsBetter ? rounded > 0 : rounded < 0;
    }
    var pct = p === 0 ? null : finiteOrNull(delta / Math.abs(p));
    return {
      delta: rounded,
      pct: pct,
      direction: direction,
      improving: improving,
      flat: direction === "flat",
    };
  }

  function vsTarget(value, target, higherIsBetter) {
    var v = toNum(value);
    var t = toNum(target);
    if (v === null || t === null) return null;
    var delta = finiteOrNull(v - t);
    if (delta === null) return null;
    var pct = t === 0 ? null : finiteOrNull(delta / Math.abs(t));
    var betterHigh = higherIsBetter !== false;
    var meeting = betterHigh ? v >= t : v <= t;
    return {
      value: v,
      target: t,
      delta: delta,
      pct: pct,
      meeting: meeting,
      higherIsBetter: betterHigh,
    };
  }

  function polarityFromDataset(dataset) {
    var out = {
      nwc: DEFAULT_POLARITY.nwc,
      nwcToRevenue: DEFAULT_POLARITY.nwcToRevenue,
      turnover: DEFAULT_POLARITY.turnover,
      monthsCoverage: DEFAULT_POLARITY.monthsCoverage,
    };
    var raw = dataset && dataset.targetPolarity;
    if (!raw || typeof raw !== "object") return out;
    var keys = ["nwc", "nwcToRevenue", "turnover", "monthsCoverage"];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var flag = raw[key];
      if (flag === "floor" || flag === true) out[key] = true;
      else if (flag === "ceiling" || flag === false) out[key] = false;
    }
    return out;
  }

  function attachMom(months, polarity) {
    for (var i = 0; i < months.length; i++) {
      var row = months[i];
      var prev = i === 0 ? null : months[i - 1];
      row.mom = {
        nwc: momTrend(row.nwc, prev ? prev.nwc : null, polarity.nwc, 0),
        nwcToRevenue: momTrend(
          row.nwcToRevenue,
          prev ? prev.nwcToRevenue : null,
          polarity.nwcToRevenue,
          4
        ),
        turnover: momTrend(
          row.turnover,
          prev ? prev.turnover : null,
          polarity.turnover,
          4
        ),
        monthsCoverage: momTrend(
          row.monthsCoverage,
          prev ? prev.monthsCoverage : null,
          polarity.monthsCoverage,
          4
        ),
      };
    }
  }

  function attachTargets(months, targets, polarity) {
    var t = targets && typeof targets === "object" ? targets : {};
    for (var i = 0; i < months.length; i++) {
      var row = months[i];
      row.vsTarget = {
        nwc: vsTarget(row.nwc, t.nwc, polarity.nwc),
        nwcToRevenue: vsTarget(row.nwcToRevenue, t.nwcToRevenue, polarity.nwcToRevenue),
        turnover: vsTarget(row.turnover, t.turnover, polarity.turnover),
        monthsCoverage: vsTarget(
          row.monthsCoverage,
          t.monthsCoverage,
          polarity.monthsCoverage
        ),
      };
    }
  }

  function extrema(months, key) {
    var best = null;
    var worst = null;
    for (var i = 0; i < months.length; i++) {
      var row = months[i];
      var v = toNum(row[key]);
      if (v === null) continue;
      if (!best || v > toNum(best[key])) best = row;
      if (!worst || v < toNum(worst[key])) worst = row;
    }
    return { best: best, worst: worst };
  }

  function mean(months, key) {
    var sum = 0;
    var count = 0;
    for (var i = 0; i < months.length; i++) {
      var v = toNum(months[i][key]);
      if (v === null) continue;
      sum += v;
      count += 1;
    }
    if (count === 0) return null;
    return finiteOrNull(sum / count);
  }

  function emptyResult() {
    return {
      company: null,
      currency: null,
      period: "month",
      conventions: null,
      targets: {
        nwc: null,
        nwcToRevenue: null,
        turnover: null,
        monthsCoverage: null,
      },
      polarity: {
        nwc: DEFAULT_POLARITY.nwc,
        nwcToRevenue: DEFAULT_POLARITY.nwcToRevenue,
        turnover: DEFAULT_POLARITY.turnover,
        monthsCoverage: DEFAULT_POLARITY.monthsCoverage,
      },
      months: [],
      latest: null,
      previous: null,
      best: null,
      worst: null,
      averageNwc: null,
      monthCount: 0,
    };
  }

  function computeTracker(dataset) {
    if (!dataset || typeof dataset !== "object") {
      return emptyResult();
    }
    var polarity = polarityFromDataset(dataset);
    var targetsIn = dataset.targets && typeof dataset.targets === "object" ? dataset.targets : {};
    var targets = {
      nwc: toNum(targetsIn.nwc),
      nwcToRevenue: toNum(targetsIn.nwcToRevenue),
      turnover: toNum(targetsIn.turnover),
      monthsCoverage: toNum(targetsIn.monthsCoverage),
    };
    var rawMonths = Array.isArray(dataset.months) ? dataset.months : [];
    var months = [];
    for (var i = 0; i < rawMonths.length; i++) {
      if (!rawMonths[i] || typeof rawMonths[i] !== "object") continue;
      months.push(computeRow(rawMonths[i]));
    }
    months.sort(function (a, b) {
      var am = a.month || "";
      var bm = b.month || "";
      if (am < bm) return -1;
      if (am > bm) return 1;
      return 0;
    });
    attachMom(months, polarity);
    attachTargets(months, targets, polarity);
    var ext = extrema(months, "nwc");
    var result = emptyResult();
    result.company = dataset.company == null ? null : String(dataset.company);
    result.currency = dataset.currency == null ? null : String(dataset.currency);
    result.period = dataset.period == null ? "month" : String(dataset.period);
    result.conventions = dataset.conventions && typeof dataset.conventions === "object"
      ? dataset.conventions
      : null;
    result.targets = targets;
    result.polarity = polarity;
    result.months = months;
    result.latest = months.length ? months[months.length - 1] : null;
    result.previous = months.length > 1 ? months[months.length - 2] : null;
    result.best = ext.best;
    result.worst = ext.worst;
    result.averageNwc = mean(months, "nwc");
    result.monthCount = months.length;
    return result;
  }

  function formatRatio(value, digits) {
    var n = toNum(value);
    if (n === null) return null;
    var d = digits == null ? 2 : digits;
    return n.toFixed(d);
  }

  function formatPct(value, digits) {
    var n = toNum(value);
    if (n === null) return null;
    var d = digits == null ? 1 : digits;
    return (n * 100).toFixed(d);
  }

  function formatMoney(value, digits) {
    var n = toNum(value);
    if (n === null) return null;
    var d = digits == null ? 0 : digits;
    return n.toFixed(d);
  }

  return {
    toNum: toNum,
    nwc: nwc,
    nwcToRevenue: nwcToRevenue,
    turnover: turnover,
    monthsCoverage: monthsCoverage,
    ratio: ratio,
    computeRow: computeRow,
    momTrend: momTrend,
    vsTarget: vsTarget,
    computeTracker: computeTracker,
    formatRatio: formatRatio,
    formatPct: formatPct,
    formatMoney: formatMoney,
    DEFAULT_POLARITY: DEFAULT_POLARITY,
  };
});
