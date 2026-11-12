/**
 * AI Analysis Engine — JTL Super App
 *
 * Performs rule-based + statistical analysis on raw samples to produce
 * human-readable insights, severity ratings, and root-cause suggestions.
 *
 * No external AI API needed — all analysis runs locally on your data.
 */

// ─── Severity levels ─────────────────────────────────────────────────────────
const SEV = { CRITICAL: 'critical', WARNING: 'warning', INFO: 'info', OK: 'ok' };

// ─── Helpers ─────────────────────────────────────────────────────────────────
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function stdDev(values, mean) {
  if (values.length < 2) return 0;
  const sq = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0);
  return Math.sqrt(sq / values.length);
}

function bucketByTime(samples, bucketMs = 10000) {
  const map = {};
  for (const s of samples) {
    const bucket = Math.floor(s.ts / bucketMs) * bucketMs;
    if (!map[bucket]) map[bucket] = [];
    map[bucket].push(s);
  }
  return Object.entries(map)
    .sort(([a], [b]) => a - b)
    .map(([ts, items]) => ({ ts: parseInt(ts), items }));
}
// ─── Individual detectors ─────────────────────────────────────────────────────

function detectErrorSpikes(buckets) {
  const findings = [];
  const errorRates = buckets.map(b => {
    const errors = b.items.filter(s => !s.success).length;
    return { ts: b.ts, rate: (errors / b.items.length) * 100, count: errors, total: b.items.length };
  });

  const spikes = errorRates.filter(b => b.rate > 10);
  if (!spikes.length) return findings;

  const worstSpike = spikes.reduce((a, b) => b.rate > a.rate ? b : a);
  const timeLabel = new Date(worstSpike.ts).toLocaleTimeString();

  findings.push({
    id: 'error_spike',
    severity: worstSpike.rate > 50 ? SEV.CRITICAL : SEV.WARNING,
    title: `Error spike detected — ${worstSpike.rate.toFixed(1)}% failure rate`,
    detail: `At ${timeLabel}, ${worstSpike.count} out of ${worstSpike.total} requests failed (${worstSpike.rate.toFixed(1)}%). This is well above normal thresholds.`,
    cause: 'Possible causes: server overload at that moment, a downstream service going down, database connection pool exhaustion, or a deployment happening mid-test.',
    suggestion: 'Cross-check server logs at this exact timestamp. Look for OOM kills, GC pauses, or connection refused errors.',
    data: spikes.map(s => ({ time: new Date(s.ts).toLocaleTimeString(), errorRate: parseFloat(s.rate.toFixed(2)) })),
  });

  return findings;
}

function detectLatencyDegradation(buckets, overallAvg) {
  const findings = [];
  if (buckets.length < 3) return findings;

  // Split into first third and last third of test
  const third = Math.floor(buckets.length / 3);
  const early = buckets.slice(0, third);
  const late  = buckets.slice(-third);

  const avgOf = (bkts) => {
    const all = bkts.flatMap(b => b.items.map(s => s.elapsed));
    return all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0;
  };

  const earlyAvg = avgOf(early);
  const lateAvg  = avgOf(late);
  const drift    = earlyAvg > 0 ? ((lateAvg - earlyAvg) / earlyAvg) * 100 : 0;

  if (drift > 20) {
    findings.push({
      id: 'latency_degradation',
      severity: drift > 50 ? SEV.CRITICAL : SEV.WARNING,
      title: `Response time degraded ${drift.toFixed(0)}% over the test duration`,
      detail: `Average response time started at ${earlyAvg.toFixed(0)}ms and ended at ${lateAvg.toFixed(0)}ms — a ${drift.toFixed(0)}% increase. This is a classic sign of a resource leak or saturation building under load.`,
      cause: 'Likely causes: memory leak causing GC pressure, database query plan degrading as temp tables grow, thread pool saturation, or connection pool filling up over time.',
      suggestion: 'Monitor heap memory and thread count on the server over the same time window. A flat then sharp rise in memory usually confirms a leak.',
      data: { earlyAvg: parseFloat(earlyAvg.toFixed(0)), lateAvg: parseFloat(lateAvg.toFixed(0)), driftPercent: parseFloat(drift.toFixed(1)) },
    });
  }

  return findings;
}

function detectLatencySpikes(buckets, overallAvg) {
  const findings = [];
  const spikeThreshold = overallAvg * 3; // 3x average = spike

  const spikes = buckets.filter(b => {
    const avg = b.items.reduce((s, i) => s + i.elapsed, 0) / b.items.length;
    return avg > spikeThreshold;
  });

  if (spikes.length > 0) {
    const worst = spikes.reduce((a, b) => {
      const aAvg = a.items.reduce((s, i) => s + i.elapsed, 0) / a.items.length;
      const bAvg = b.items.reduce((s, i) => s + i.elapsed, 0) / b.items.length;
      return bAvg > aAvg ? b : a;
    });
    const worstAvg = worst.items.reduce((s, i) => s + i.elapsed, 0) / worst.items.length;

    findings.push({
      id: 'latency_spike',
      severity: SEV.WARNING,
      title: `${spikes.length} latency spike${spikes.length > 1 ? 's' : ''} detected (up to ${worstAvg.toFixed(0)}ms vs ${overallAvg.toFixed(0)}ms avg)`,
      detail: `${spikes.length} time interval${spikes.length > 1 ? 's' : ''} had average response times more than 3× the overall average. The worst spike was ${worstAvg.toFixed(0)}ms at ${new Date(worst.ts).toLocaleTimeString()}.`,
      cause: 'Spikes of this pattern usually indicate: garbage collection pauses (JVM/Node.js), lock contention in the database, or a periodic background job competing for resources.',
      suggestion: 'Check if spike intervals are periodic (e.g., every 30s = GC, every 60s = scheduled job). Correlate with GC logs or cron job schedules.',
      data: spikes.map(b => ({
        time: new Date(b.ts).toLocaleTimeString(),
        avgElapsed: parseFloat((b.items.reduce((s, i) => s + i.elapsed, 0) / b.items.length).toFixed(0)),
      })),
    });
  }

  return findings;
}

function detectSlowLabels(samples, overallP95) {
  const findings = [];
  const labelMap = {};

  for (const s of samples) {
    if (!labelMap[s.label]) labelMap[s.label] = [];
    labelMap[s.label].push(s.elapsed);
  }

  const slowLabels = [];
  for (const [label, times] of Object.entries(labelMap)) {
    const sorted = [...times].sort((a, b) => a - b);
    const p95 = percentile(sorted, 95);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const errorCount = samples.filter(s => s.label === label && !s.success).length;
    const errorRate = (errorCount / times.length) * 100;

    if (p95 > overallP95 * 1.5 || errorRate > 5) {
      slowLabels.push({ label, p95, avg: parseFloat(avg.toFixed(0)), count: times.length, errorRate: parseFloat(errorRate.toFixed(2)) });
    }
  }

  if (slowLabels.length) {
    slowLabels.sort((a, b) => b.p95 - a.p95);
    const worst = slowLabels[0];

    findings.push({
      id: 'slow_transactions',
      severity: worst.p95 > overallP95 * 2 ? SEV.CRITICAL : SEV.WARNING,
      title: `${slowLabels.length} slow/failing transaction type${slowLabels.length > 1 ? 's' : ''} identified`,
      detail: `The transaction "${worst.label}" has a P95 of ${worst.p95}ms — ${((worst.p95 / overallP95) * 100 - 100).toFixed(0)}% worse than the overall P95. ${worst.errorRate > 0 ? `It also has a ${worst.errorRate}% error rate.` : ''}`,
      cause: 'A specific endpoint or transaction being slow while others are fine points to: an unindexed database query in that endpoint, an N+1 query problem, a missing cache, or a heavy computation on that code path.',
      suggestion: `Profile the "${worst.label}" endpoint specifically. Run EXPLAIN ANALYZE on its database queries. Check if it fetches data it doesn't use.`,
      data: slowLabels.slice(0, 10),
    });
  }

  return findings;
}

function detectConcurrencyCorrelation(buckets) {
  const findings = [];
  if (buckets.length < 5) return findings;

  // Find the bucket with max concurrent threads
  const withThreads = buckets.map(b => ({
    ts: b.ts,
    maxThreads: b.items.reduce((m, s) => Math.max(m, s.all_threads || 0), 0),
    avgElapsed: b.items.reduce((s, i) => s + i.elapsed, 0) / b.items.length,
    errorRate: (b.items.filter(s => !s.success).length / b.items.length) * 100,
  })).filter(b => b.maxThreads > 0);

  if (!withThreads.length) return findings;

  const maxThreadBucket = withThreads.reduce((a, b) => b.maxThreads > a.maxThreads ? b : a);
  const minThreadBucket = withThreads.reduce((a, b) => b.maxThreads < a.maxThreads ? b : a);

  const latencyAtMax  = maxThreadBucket.avgElapsed;
  const latencyAtMin  = minThreadBucket.avgElapsed;
  const latencyGrowth = latencyAtMin > 0 ? ((latencyAtMax - latencyAtMin) / latencyAtMin) * 100 : 0;

  if (latencyGrowth > 40 && maxThreadBucket.maxThreads > minThreadBucket.maxThreads * 1.5) {
    findings.push({
      id: 'concurrency_impact',
      severity: latencyGrowth > 100 ? SEV.CRITICAL : SEV.WARNING,
      title: `Response time scales poorly with concurrency (+${latencyGrowth.toFixed(0)}% at peak load)`,
      detail: `At ${minThreadBucket.maxThreads} concurrent users, avg response was ${latencyAtMin.toFixed(0)}ms. At ${maxThreadBucket.maxThreads} users, it rose to ${latencyAtMax.toFixed(0)}ms — a ${latencyGrowth.toFixed(0)}% increase. This non-linear scaling indicates a bottleneck.`,
      cause: 'Non-linear latency growth under concurrency is typically caused by: a single-threaded resource (global lock, serial queue), database connection pool limit reached, or CPU saturation causing thread starvation.',
      suggestion: 'Identify what serialises access. Run the test again with thread dump captures at peak load. Look for threads waiting on the same lock or the same DB connection.',
      data: { minThreads: minThreadBucket.maxThreads, maxThreads: maxThreadBucket.maxThreads, latencyAtMin: parseFloat(latencyAtMin.toFixed(0)), latencyAtMax: parseFloat(latencyAtMax.toFixed(0)) },
    });
  }

  return findings;
}

function detectConnectVsLatency(samples) {
  const findings = [];
  const withConnect = samples.filter(s => s.latency > 0 && s.elapsed > 0);
  if (withConnect.length < 10) return findings;

  // Connect time = time to establish TCP connection
  // Latency = time to first byte (TTFB)
  // Elapsed = total round trip
  // If elapsed - latency is very high → server processing is slow
  // If latency is very high → network or connection overhead

  const processingTimes = withConnect.map(s => s.elapsed - s.latency);
  const avgProcessing = processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length;
  const avgLatency = withConnect.reduce((a, b) => a + b.latency, 0) / withConnect.length;
  const avgElapsed = withConnect.reduce((a, b) => a + b.elapsed, 0) / withConnect.length;

  const networkPct    = avgElapsed > 0 ? (avgLatency / avgElapsed) * 100 : 0;
  const processingPct = avgElapsed > 0 ? (avgProcessing / avgElapsed) * 100 : 0;

  if (networkPct > 40) {
    findings.push({
      id: 'network_overhead',
      severity: SEV.WARNING,
      title: `High network/connection overhead — ${networkPct.toFixed(0)}% of response time is network`,
      detail: `Average elapsed: ${avgElapsed.toFixed(0)}ms. Of that, ${avgLatency.toFixed(0)}ms (${networkPct.toFixed(0)}%) is network latency and ${avgProcessing.toFixed(0)}ms (${processingPct.toFixed(0)}%) is server processing.`,
      cause: 'High network proportion means: load generator is far from the server, too many TCP connection setups (HTTP/1.1 without keep-alive), or DNS resolution happening repeatedly.',
      suggestion: 'Ensure keep-alive connections are enabled in JMeter (HTTP Request Defaults → Keep-Alive). Move the load generator closer to the server. Consider HTTP/2.',
      data: { avgElapsedMs: parseFloat(avgElapsed.toFixed(0)), avgLatencyMs: parseFloat(avgLatency.toFixed(0)), networkPercent: parseFloat(networkPct.toFixed(1)) },
    });
  }

  if (processingPct > 80 && avgProcessing > 500) {
    findings.push({
      id: 'server_processing_slow',
      severity: avgProcessing > 2000 ? SEV.CRITICAL : SEV.WARNING,
      title: `Server processing is the bottleneck — avg ${avgProcessing.toFixed(0)}ms server time`,
      detail: `${processingPct.toFixed(0)}% of response time (${avgProcessing.toFixed(0)}ms) is spent inside the server. Network overhead is only ${avgLatency.toFixed(0)}ms. The problem is definitely server-side.`,
      cause: 'Slow server processing means: expensive database queries, synchronous blocking I/O, missing caching layer, or CPU-bound computation on the request path.',
      suggestion: 'Add APM tracing (Jaeger, Zipkin, or New Relic) to get per-function timing. Profile the slowest endpoints and look for repeated database calls.',
      data: { avgProcessingMs: parseFloat(avgProcessing.toFixed(0)), processingPercent: parseFloat(processingPct.toFixed(1)) },
    });
  }

  return findings;
}

function detectErrorPatterns(samples) {
  const findings = [];
  const errors = samples.filter(s => !s.success);
  if (!errors.length) return findings;

  // Group errors by response code
  const byCode = {};
  for (const e of errors) {
    const code = e.response_code || 'unknown';
    byCode[code] = (byCode[code] || 0) + 1;
  }

  const codeInsights = {
    '500': { cause: 'Internal Server Error — unhandled exception in application code', suggestion: 'Check server error logs for stack traces at these timestamps.' },
    '503': { cause: 'Service Unavailable — server overloaded or downstream dependency down', suggestion: 'Check if load balancer health checks are failing. Verify downstream services are up.' },
    '504': { cause: 'Gateway Timeout — upstream server did not respond in time', suggestion: 'The timeout threshold is being hit. Check proxy/load balancer timeout settings.' },
    '429': { cause: 'Too Many Requests — rate limiting is triggering', suggestion: 'Your test is hitting a rate limiter. Either throttle the test or whitelist the load generator IP.' },
    '401': { cause: 'Unauthorized — authentication tokens expiring mid-test', suggestion: 'Check token TTL vs test duration. Implement token refresh in the test script.' },
    '403': { cause: 'Forbidden — authorization failing for some requests', suggestion: 'Check if session state is being lost or if CSRF tokens are needed.' },
    '404': { cause: 'Not Found — wrong URLs in test or resources being deleted', suggestion: 'Verify all request URLs are correct. Check if test data (IDs) is being created before being referenced.' },
    '0':   { cause: 'Connection error — no HTTP response received at all', suggestion: 'Server crashed or refused connections. Check if the server process is still running.' },
    'Non HTTP response': { cause: 'Socket/connection error at network level', suggestion: 'Server ran out of connections or network layer failed. Check OS ulimits and TCP settings.' },
  };

  const sortedCodes = Object.entries(byCode).sort(([, a], [, b]) => b - a);
  const dominantCode = sortedCodes[0];
  const totalErrors = errors.length;
  const errorRate = (totalErrors / samples.length) * 100;

  const insight = codeInsights[dominantCode[0]] || {
    cause: `HTTP ${dominantCode[0]} errors — check server logs for details`,
    suggestion: 'Review server logs at the timestamps of these errors.',
  };

  findings.push({
    id: 'error_pattern',
    severity: errorRate > 5 ? SEV.CRITICAL : SEV.WARNING,
    title: `${totalErrors} errors found — dominant type: HTTP ${dominantCode[0]} (${dominantCode[1]} occurrences)`,
    detail: `Total error rate: ${errorRate.toFixed(2)}%. Error breakdown by response code: ${sortedCodes.map(([code, count]) => `${code}: ${count}`).join(', ')}.`,
    cause: insight.cause,
    suggestion: insight.suggestion,
    data: Object.fromEntries(sortedCodes),
  });

  return findings;
}

function detectThroughputDrop(buckets) {
  const findings = [];
  if (buckets.length < 4) return findings;

  const throughputs = buckets.map(b => ({ ts: b.ts, rps: b.items.length / 10 }));
  const maxTps = throughputs.reduce((m, b) => b.rps > m ? b.rps : m, 0);
  const minTps = throughputs.reduce((m, b) => b.rps < m ? b.rps : m, Infinity);
  const dropPercent = maxTps > 0 ? ((maxTps - minTps) / maxTps) * 100 : 0;

  // Find if there's a sustained drop in the second half
  const half = Math.floor(throughputs.length / 2);
  const firstHalfAvg = throughputs.slice(0, half).reduce((s, b) => s + b.rps, 0) / half;
  const secondHalfAvg = throughputs.slice(half).reduce((s, b) => s + b.rps, 0) / (throughputs.length - half);
  const sustainedDrop = firstHalfAvg > 0 ? ((firstHalfAvg - secondHalfAvg) / firstHalfAvg) * 100 : 0;

  if (sustainedDrop > 20) {
    findings.push({
      id: 'throughput_drop',
      severity: sustainedDrop > 40 ? SEV.CRITICAL : SEV.WARNING,
      title: `Throughput dropped ${sustainedDrop.toFixed(0)}% in second half of test`,
      detail: `Average throughput in first half: ${firstHalfAvg.toFixed(1)} req/s. Second half: ${secondHalfAvg.toFixed(1)} req/s. A sustained throughput drop means the server was processing fewer requests per second over time — not just slower responses.`,
      cause: 'Sustained throughput drop (not just slower responses) indicates: thread pool saturation causing request queuing, circuit breaker triggering, or the server progressively running out of a resource (file handles, DB connections, memory).',
      suggestion: 'Check thread pool queue depth over time. Look for "connection refused" or "thread pool full" in server logs. Monitor open file descriptor count.',
      data: { firstHalfRps: parseFloat(firstHalfAvg.toFixed(2)), secondHalfRps: parseFloat(secondHalfAvg.toFixed(2)), dropPercent: parseFloat(sustainedDrop.toFixed(1)) },
    });
  }

  return findings;
}

function computeHealthScore(findings, totalRequests, errorRate) {
  let score = 100;
  for (const f of findings) {
    if (f.severity === SEV.CRITICAL) score -= 25;
    else if (f.severity === SEV.WARNING) score -= 10;
  }
  // Error rate penalty
  if (errorRate > 1)  score -= 10;
  if (errorRate > 5)  score -= 15;
  if (errorRate > 10) score -= 20;

  score = Math.max(0, Math.min(100, score));
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
  const label = score >= 90 ? 'Healthy' : score >= 75 ? 'Acceptable' : score >= 60 ? 'Degraded' : score >= 40 ? 'Poor' : 'Critical';
  return { score, grade, label };
}

// ─── Main exported function ───────────────────────────────────────────────────

function analyzeRun(samples, stats) {
  if (!samples || samples.length < 2) {
    return {
      healthScore: { score: 0, grade: 'N/A', label: 'Insufficient data' },
      findings: [],
      summary: 'Not enough data to analyze.',
    };
  }

  const buckets   = bucketByTime(samples, 10000); // 10-second buckets
  const sortedElapsed = [...samples.map(s => s.elapsed)].sort((a, b) => a - b);
  const overallAvg    = sortedElapsed.reduce((a, b) => a + b, 0) / sortedElapsed.length;
  const overallP95    = percentile(sortedElapsed, 95);
  const errorRate     = stats?.errorRate || 0;

  const findings = [
    ...detectErrorPatterns(samples),
    ...detectErrorSpikes(buckets),
    ...detectLatencyDegradation(buckets, overallAvg),
    ...detectLatencySpikes(buckets, overallAvg),
    ...detectSlowLabels(samples, overallP95),
    ...detectConcurrencyCorrelation(buckets),
    ...detectConnectVsLatency(samples),
    ...detectThroughputDrop(buckets),
  ];

  // Sort: critical first, then warning, then info
  const sevOrder = { critical: 0, warning: 1, info: 2, ok: 3 };
  findings.sort((a, b) => (sevOrder[a.severity] || 3) - (sevOrder[b.severity] || 3));

  const healthScore = computeHealthScore(findings, samples.length, errorRate);

  const criticals = findings.filter(f => f.severity === SEV.CRITICAL).length;
  const warnings  = findings.filter(f => f.severity === SEV.WARNING).length;

  const summary = findings.length === 0
    ? 'No significant issues detected. The test run looks healthy.'
    : `Found ${findings.length} issue${findings.length > 1 ? 's' : ''}: ${criticals} critical, ${warnings} warning${warnings !== 1 ? 's' : ''}. ${healthScore.label} overall.`;

  return { healthScore, findings, summary };
}

module.exports = { analyzeRun };
