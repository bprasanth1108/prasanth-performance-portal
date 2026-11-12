/**
 * Chart Builder — produces all chart datasets matching JMeter HTML report sections.
 * Called once after upload; results cached in run_charts table.
 */

// Safe alternatives to Math.max/min spread (avoids call stack overflow on large arrays)
function safeMax(arr) { return arr.reduce((m, v) => v > m ? v : m, -Infinity); }
function safeMin(arr) { return arr.reduce((m, v) => v < m ? v : m, Infinity); }

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1)];
}

function bucketSamples(samples, bucketMs = 10000) {
  const map = {};
  for (const s of samples) {
    const b = Math.floor(s.ts / bucketMs) * bucketMs;
    if (!map[b]) map[b] = [];
    map[b].push(s);
  }
  return Object.entries(map).sort(([a], [b]) => +a - +b)
    .map(([ts, items]) => ({ ts: +ts, items }));
}

function relSec(ts, minTs) { return Math.round((ts - minTs) / 1000); }

// ── 1. APDEX per label ───────────────────────────────────────────────────────
// Satisfied < T, Tolerating < 4T, Frustrated >= 4T  (default T=500ms)
function buildApdex(samples, T = 500) {
  const labels = {};
  for (const s of samples) {
    if (!labels[s.label]) labels[s.label] = { satisfied: 0, tolerating: 0, frustrated: 0, total: 0 };
    const g = labels[s.label];
    g.total++;
    if (s.elapsed <= T) g.satisfied++;
    else if (s.elapsed <= 4 * T) g.tolerating++;
    else g.frustrated++;
  }
  return Object.entries(labels).map(([label, g]) => ({
    label,
    apdex: parseFloat(((g.satisfied + g.tolerating / 2) / g.total).toFixed(3)),
    satisfied: g.satisfied,
    tolerating: g.tolerating,
    frustrated: g.frustrated,
    total: g.total,
    rating: ((g.satisfied + g.tolerating / 2) / g.total) >= 0.94 ? 'Excellent'
          : ((g.satisfied + g.tolerating / 2) / g.total) >= 0.85 ? 'Good'
          : ((g.satisfied + g.tolerating / 2) / g.total) >= 0.70 ? 'Fair'
          : ((g.satisfied + g.tolerating / 2) / g.total) >= 0.50 ? 'Poor' : 'Unacceptable',
  })).sort((a, b) => a.apdex - b.apdex);
}

// ── 2. Full statistics table per label ───────────────────────────────────────
function buildStatistics(samples) {
  const labels = {};
  for (const s of samples) {
    if (!labels[s.label]) labels[s.label] = [];
    labels[s.label].push(s);
  }
  const minTs = safeMin(samples.map(s => s.ts));
  const maxTs = safeMax(samples.map(s => s.ts));
  const durationSec = Math.max((maxTs - minTs) / 1000, 1);

  return Object.entries(labels).map(([label, rows]) => {
    const sorted = rows.map(r => r.elapsed).sort((a, b) => a - b);
    const errors = rows.filter(r => !r.success).length;
    const totalBytes = rows.reduce((s, r) => s + (r.bytes || 0), 0);
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const variance = sorted.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / sorted.length;
    return {
      label,
      samples: rows.length,
      errorPct: parseFloat(((errors / rows.length) * 100).toFixed(2)),
      errors,
      mean: Math.round(avg),
      median: pct(sorted, 50),
      p90: pct(sorted, 90),
      p95: pct(sorted, 95),
      p99: pct(sorted, 99),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      stdDev: Math.round(Math.sqrt(variance)),
      throughput: parseFloat((rows.length / durationSec).toFixed(3)),
      kbPerSec: parseFloat((totalBytes / 1024 / durationSec).toFixed(2)),
    };
  }).sort((a, b) => a.label.localeCompare(b.label));
}

// ── 3. Response times over time (per label) ──────────────────────────────────
function buildResponseTimesOverTime(samples) {
  const minTs = safeMin(samples.map(s => s.ts));
  const buckets = bucketSamples(samples);
  const labelSet = [...new Set(samples.map(s => s.label))];

  return buckets.map(b => {
    const point = { time: relSec(b.ts, minTs) };
    for (const label of labelSet) {
      const sub = b.items.filter(s => s.label === label);
      if (sub.length) point[label] = Math.round(sub.reduce((s, r) => s + r.elapsed, 0) / sub.length);
    }
    return point;
  });
}

// ── 4. Response time percentiles over time ───────────────────────────────────
function buildPercentilesOverTime(samples) {
  const minTs = safeMin(samples.map(s => s.ts));
  return bucketSamples(samples).map(b => {
    const sorted = b.items.map(s => s.elapsed).sort((a, b) => a - b);
    return {
      time: relSec(b.ts, minTs),
      p50: pct(sorted, 50),
      p90: pct(sorted, 90),
      p95: pct(sorted, 95),
      p99: pct(sorted, 99),
      max: sorted[sorted.length - 1] || 0,
    };
  });
}

// ── 5. Active threads over time ──────────────────────────────────────────────
function buildActiveThreadsOverTime(samples) {
  const minTs = safeMin(samples.map(s => s.ts));
  return bucketSamples(samples).map(b => ({
    time: relSec(b.ts, minTs),
    threads: safeMax(b.items.map(s => s.all_threads || 0)),
  }));
}

// ── 6. Bytes throughput over time (KB/s) ─────────────────────────────────────
function buildBytesOverTime(samples) {
  const minTs = safeMin(samples.map(s => s.ts));
  return bucketSamples(samples).map(b => {
    const received = b.items.reduce((s, r) => s + (r.bytes || 0), 0) / 1024 / 10; // per sec
    const sent = b.items.reduce((s, r) => s + (r.sent_bytes || 0), 0) / 1024 / 10;
    return { time: relSec(b.ts, minTs), receivedKbps: parseFloat(received.toFixed(2)), sentKbps: parseFloat(sent.toFixed(2)) };
  });
}

// ── 7. Latency over time ─────────────────────────────────────────────────────
function buildLatencyOverTime(samples) {
  const minTs = safeMin(samples.map(s => s.ts));
  const withLatency = samples.filter(s => s.latency > 0);
  if (!withLatency.length) return [];
  return bucketSamples(withLatency).map(b => ({
    time: relSec(b.ts, minTs),
    avgLatency: Math.round(b.items.reduce((s, r) => s + r.latency, 0) / b.items.length),
  }));
}

// ── 8. Hits per second + errors per second ───────────────────────────────────
function buildHitsPerSecond(samples) {
  const minTs = safeMin(samples.map(s => s.ts));
  return bucketSamples(samples).map(b => ({
    time: relSec(b.ts, minTs),
    hits: parseFloat((b.items.length / 10).toFixed(2)),
    errors: parseFloat((b.items.filter(s => !s.success).length / 10).toFixed(2)),
  }));
}

// ── 9. HTTP response codes per second ────────────────────────────────────────
function buildCodesPerSecond(samples) {
  const minTs = safeMin(samples.map(s => s.ts));
  const allCodes = [...new Set(samples.map(s => s.response_code || 'unknown'))];
  return bucketSamples(samples).map(b => {
    const point = { time: relSec(b.ts, minTs) };
    for (const code of allCodes) {
      const count = b.items.filter(s => s.response_code === code).length;
      if (count) point[code] = parseFloat((count / 10).toFixed(2));
    }
    return point;
  });
}

// ── 10. Response time distribution (histogram) ───────────────────────────────
function buildResponseTimeDistribution(samples) {
  // Dynamic bucket boundaries based on data range
  const max = safeMax(samples.map(s => s.elapsed));
  const bucketCount = Math.min(30, Math.max(10, Math.floor(max / 100)));
  const bucketSize = Math.ceil(max / bucketCount);

  const dist = {};
  for (let i = 0; i < bucketCount; i++) {
    const lo = i * bucketSize;
    const hi = lo + bucketSize;
    dist[`${lo}-${hi}`] = 0;
  }
  for (const s of samples) {
    const idx = Math.min(Math.floor(s.elapsed / bucketSize), bucketCount - 1);
    const lo = idx * bucketSize;
    const hi = lo + bucketSize;
    dist[`${lo}-${hi}`]++;
  }
  return Object.entries(dist).map(([range, count]) => ({ range, count }));
}

// ── 11. Response time percentiles per label (box-plot style) ─────────────────
function buildPercentilesPerLabel(samples) {
  const labels = {};
  for (const s of samples) {
    if (!labels[s.label]) labels[s.label] = [];
    labels[s.label].push(s.elapsed);
  }
  return Object.entries(labels).map(([label, times]) => {
    const sorted = [...times].sort((a, b) => a - b);
    return {
      label,
      p50: pct(sorted, 50),
      p75: pct(sorted, 75),
      p90: pct(sorted, 90),
      p95: pct(sorted, 95),
      p99: pct(sorted, 99),
      min: sorted[0],
      max: sorted[sorted.length - 1],
    };
  }).sort((a, b) => b.p95 - a.p95).slice(0, 20); // top 20 by P95
}

// ── 12. Top 5 errors table ───────────────────────────────────────────────────
function buildTopErrors(samples) {
  const errorMap = {};
  const errors = samples.filter(s => !s.success);
  for (const e of errors) {
    const key = `${e.label}||${e.response_code || 'unknown'}`;
    if (!errorMap[key]) errorMap[key] = { label: e.label, responseCode: e.response_code || 'unknown', count: 0 };
    errorMap[key].count++;
  }
  const total = samples.length;
  return Object.values(errorMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(e => ({ ...e, pctOfTotal: parseFloat(((e.count / total) * 100).toFixed(2)), pctOfErrors: parseFloat(((e.count / errors.length) * 100).toFixed(2)) }));
}

// ── 13. Request summary (pie) ────────────────────────────────────────────────
function buildRequestSummary(samples) {
  const passed = samples.filter(s => s.success).length;
  const failed = samples.length - passed;
  return { passed, failed, total: samples.length, passRate: parseFloat(((passed / samples.length) * 100).toFixed(2)) };
}

// ── Main export ───────────────────────────────────────────────────────────────
function buildAllCharts(samples) {
  if (!samples || samples.length === 0) return null;
  return {
    apdex:                   buildApdex(samples),
    statistics:              buildStatistics(samples),
    requestSummary:          buildRequestSummary(samples),
    responseTimesOverTime:   buildResponseTimesOverTime(samples),
    percentilesOverTime:     buildPercentilesOverTime(samples),
    activeThreadsOverTime:   buildActiveThreadsOverTime(samples),
    bytesOverTime:           buildBytesOverTime(samples),
    latencyOverTime:         buildLatencyOverTime(samples),
    hitsPerSecond:           buildHitsPerSecond(samples),
    codesPerSecond:          buildCodesPerSecond(samples),
    responseTimeDistribution:buildResponseTimeDistribution(samples),
    percentilesPerLabel:     buildPercentilesPerLabel(samples),
    topErrors:               buildTopErrors(samples),
  };
}

module.exports = { buildAllCharts };
