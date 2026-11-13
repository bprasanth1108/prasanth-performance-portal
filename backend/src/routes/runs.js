const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query, getClient } = require('../db');
const { verifyToken, requireAdmin, requireManager, requireProjectAccess } = require('../middleware/auth');
const { parseJtlFile, computeStats } = require('../utils/jtlParser');
const { analyzeRun } = require('../utils/aiAnalyzer');
const { buildAllCharts } = require('../utils/chartBuilder');

const router = express.Router({ mergeParams: true });

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: (parseInt(process.env.MAX_FILE_SIZE_MB) || 500) * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.jtl', '.csv'].includes(ext)) return cb(null, true);
    cb(new Error('Only .jtl and .csv files are allowed'));
  },
});

// GET /api/projects/:projectId/scenarios/:scenarioId/runs
router.get('/', verifyToken, requireProjectAccess, async (req, res) => {
  try {
    const result = await query(`
      SELECT r.*, rs.total_requests, rs.error_rate, rs.avg_response_time,
             rs.p95_response_time, rs.throughput
      FROM jtl.runs r
      LEFT JOIN jtl.run_stats rs ON rs.run_id = r.id
      WHERE r.scenario_id = $1
      ORDER BY r.uploaded_at DESC
    `, [req.params.scenarioId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch runs' });
  }
});

// GET /api/.../runs/compare?ids=id1,id2[,id3]  — compare 2–3 runs in this scenario.
// NOTE: declared before '/:id' so "compare" is not captured as a run id.
router.get('/compare', verifyToken, requireProjectAccess, async (req, res) => {
  try {
    const ids = String(req.query.ids || '')
      .split(',').map(s => s.trim()).filter(Boolean);

    if (ids.length < 2 || ids.length > 3) {
      return res.status(400).json({ error: 'Select 2 or 3 runs to compare' });
    }

    // Fetch run + stats + insights + charts, restricted to this scenario.
    const result = await query(
      `SELECT r.id, r.test_name, r.environment, r.note, r.start_time, r.duration,
              r.uploaded_at,
              rs.total_requests, rs.error_count, rs.error_rate, rs.avg_response_time,
              rs.min_response_time, rs.max_response_time, rs.p90_response_time,
              rs.p95_response_time, rs.p99_response_time, rs.throughput, rs.per_label,
              ri.health_score, ri.health_grade, ri.health_label, ri.summary,
              rc.response_times_over_time, rc.percentiles_over_time,
              rc.hits_per_second
       FROM jtl.runs r
       LEFT JOIN jtl.run_stats rs  ON rs.run_id = r.id
       LEFT JOIN jtl.run_insights ri ON ri.run_id = r.id
       LEFT JOIN jtl.run_charts  rc ON rc.run_id = r.id
       WHERE r.scenario_id = $1 AND r.id = ANY($2::uuid[])`,
      [req.params.scenarioId, ids]
    );

    if (result.rows.length !== ids.length) {
      return res.status(404).json({ error: 'One or more runs were not found in this scenario' });
    }

    const parse = (v) => {
      if (v == null) return null;
      return typeof v === 'string' ? JSON.parse(v) : v;
    };

    // Preserve the order the caller requested.
    const byId = Object.fromEntries(result.rows.map(r => [r.id, r]));
    const runs = ids.map(id => {
      const r = byId[id];
      return {
        id: r.id,
        testName: r.test_name,
        environment: r.environment,
        startTime: r.start_time,
        duration: r.duration,
        uploadedAt: r.uploaded_at,
        stats: {
          totalRequests: r.total_requests,
          errorCount: r.error_count,
          errorRate: r.error_rate != null ? parseFloat(r.error_rate) : null,
          avg: r.avg_response_time != null ? parseFloat(r.avg_response_time) : null,
          min: r.min_response_time != null ? parseFloat(r.min_response_time) : null,
          max: r.max_response_time != null ? parseFloat(r.max_response_time) : null,
          p90: r.p90_response_time != null ? parseFloat(r.p90_response_time) : null,
          p95: r.p95_response_time != null ? parseFloat(r.p95_response_time) : null,
          p99: r.p99_response_time != null ? parseFloat(r.p99_response_time) : null,
          throughput: r.throughput != null ? parseFloat(r.throughput) : null,
        },
        perLabel: parse(r.per_label) || {},
        insights: r.health_score != null ? {
          score: r.health_score, grade: r.health_grade,
          label: r.health_label, summary: r.summary,
        } : null,
        charts: {
          responseTimesOverTime: parse(r.response_times_over_time) || [],
          percentilesOverTime:   parse(r.percentiles_over_time) || [],
          hitsPerSecond:         parse(r.hits_per_second) || [],
          hasData: r.percentiles_over_time != null,
        },
      };
    });

    // Baseline = oldest executed run (fallback to uploaded_at when start_time null).
    const baselineId = [...runs].sort((a, b) => {
      const ta = new Date(a.startTime || a.uploadedAt).getTime();
      const tb = new Date(b.startTime || b.uploadedAt).getTime();
      return ta - tb;
    })[0].id;

    // Union of all labels across the selected runs (for the per-label table + picker).
    const labelSet = new Set();
    for (const run of runs) for (const label of Object.keys(run.perLabel)) labelSet.add(label);

    res.json({ runs, baselineId, labels: [...labelSet].sort() });
  } catch (err) {
    console.error('Compare error:', err.message);
    res.status(500).json({ error: 'Failed to compare runs: ' + err.message });
  }
});

// GET /api/projects/:projectId/scenarios/:scenarioId/runs/:id
router.get('/:id', verifyToken, requireProjectAccess, async (req, res) => {
  try {
    const result = await query(`
      SELECT r.*, rs.*
      FROM jtl.runs r
      LEFT JOIN jtl.run_stats rs ON rs.run_id = r.id
      WHERE r.id = $1 AND r.scenario_id = $2
    `, [req.params.id, req.params.scenarioId]);
    if (!result.rows.length) return res.status(404).json({ error: 'Run not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch run' });
  }
});

// GET /api/projects/:projectId/scenarios/:scenarioId/runs/:id/chart-data
router.get('/:id/chart-data', verifyToken, async (req, res) => {
  try {
    // Return time-bucketed data for charts (bucket by 10 seconds)
    const result = await query(`
      SELECT
        (ts / 10000) * 10000 AS bucket,
        AVG(elapsed)::int AS avg_elapsed,
        COUNT(*)::int AS req_count,
        SUM(CASE WHEN success = false THEN 1 ELSE 0 END)::int AS error_count
      FROM jtl.samples
      WHERE run_id = $1
      GROUP BY bucket
      ORDER BY bucket ASC
    `, [req.params.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
});

// POST /api/projects/:projectId/scenarios/:scenarioId/runs/upload  (manager+)
router.post('/upload', verifyToken, requireManager, upload.single('jtlFile'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filePath = req.file.path;
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Create run record
    const runResult = await client.query(
      `INSERT INTO jtl.runs (scenario_id, environment, note, test_name, status)
       VALUES ($1, $2, $3, $4, 'in_progress') RETURNING *`,
      [req.params.scenarioId, req.body.environment || null, req.body.note || null, req.body.test_name || null]
    );
    const run = runResult.rows[0];

    // Parse JTL file
    const samples = await parseJtlFile(filePath);
    if (!samples.length) {
      await client.query('ROLLBACK');
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'JTL file is empty or invalid' });
    }

    // Bulk insert samples in batches of 1000
    const batchSize = 1000;
    for (let i = 0; i < samples.length; i += batchSize) {
      const batch = samples.slice(i, i + batchSize);
      const valuePlaceholders = batch.map((_, j) => {
        const base = j * 11;
        return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11})`;
      }).join(',');
      const flatValues = batch.flatMap(s => [
        run.id, s.ts, s.elapsed, s.label, s.response_code,
        s.success, s.bytes, s.sent_bytes, s.latency, s.all_threads, s.hostname
      ]);
      await client.query(
        `INSERT INTO jtl.samples (run_id,ts,elapsed,label,response_code,success,bytes,sent_bytes,latency,all_threads,hostname)
         VALUES ${valuePlaceholders}`,
        flatValues
      );
    }

    // Compute and store stats
    const stats = computeStats(samples);
    await client.query(
      `INSERT INTO jtl.run_stats
       (run_id, total_requests, error_count, error_rate, avg_response_time,
        min_response_time, max_response_time, p90_response_time, p95_response_time,
        p99_response_time, throughput, overview, per_label)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        run.id, stats.totalRequests, stats.errorCount, stats.errorRate,
        stats.avgResponseTime, stats.minResponseTime, stats.maxResponseTime,
        stats.p90ResponseTime, stats.p95ResponseTime, stats.p99ResponseTime,
        stats.throughput, JSON.stringify({}), JSON.stringify(stats.perLabel)
      ]
    );

    // Update run with start_time, duration, status
    await client.query(
      `UPDATE jtl.runs SET status = 'ready', start_time = $1, duration = $2, updated_at = NOW()
       WHERE id = $3`,
      [stats.startTime, stats.durationSeconds, run.id]
    );

    await client.query('COMMIT');
    fs.unlinkSync(filePath);

    // Run AI analysis + chart building asynchronously (don't block the response)
    setImmediate(async () => {
      try {
        const { query: q } = require('../db');
        const sampleResult = await q(
          'SELECT elapsed, success, response_code, label, ts, latency, all_threads, bytes, sent_bytes FROM jtl.samples WHERE run_id = $1',
          [run.id]
        );
        const statsResult = await q('SELECT * FROM jtl.run_stats WHERE run_id = $1', [run.id]);
        const rawRows = sampleResult.rows;

        // Normalize types from DB
        const sRows = rawRows.map(s => ({
          ...s,
          elapsed: parseInt(s.elapsed) || 0,
          ts: parseInt(s.ts) || 0,
          latency: parseInt(s.latency) || 0,
          all_threads: parseInt(s.all_threads) || 0,
          bytes: parseInt(s.bytes) || 0,
          sent_bytes: parseInt(s.sent_bytes) || 0,
          success: s.success === true || s.success === 'true' || s.success === 't',
        }));

        // Build all JMeter-style charts
        const charts = buildAllCharts(sRows);
        if (charts) {
          await q(
            `INSERT INTO jtl.run_charts
               (run_id, apdex, statistics, request_summary, response_times_over_time,
                percentiles_over_time, active_threads_over_time, bytes_over_time,
                latency_over_time, hits_per_second, codes_per_second,
                response_time_distribution, percentiles_per_label, top_errors)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
             ON CONFLICT (run_id) DO UPDATE SET
               apdex=$2, statistics=$3, request_summary=$4,
               response_times_over_time=$5, percentiles_over_time=$6,
               active_threads_over_time=$7, bytes_over_time=$8,
               latency_over_time=$9, hits_per_second=$10, codes_per_second=$11,
               response_time_distribution=$12, percentiles_per_label=$13,
               top_errors=$14, built_at=NOW()`,
            [run.id,
             JSON.stringify(charts.apdex), JSON.stringify(charts.statistics),
             JSON.stringify(charts.requestSummary), JSON.stringify(charts.responseTimesOverTime),
             JSON.stringify(charts.percentilesOverTime), JSON.stringify(charts.activeThreadsOverTime),
             JSON.stringify(charts.bytesOverTime), JSON.stringify(charts.latencyOverTime),
             JSON.stringify(charts.hitsPerSecond), JSON.stringify(charts.codesPerSecond),
             JSON.stringify(charts.responseTimeDistribution), JSON.stringify(charts.percentilesPerLabel),
             JSON.stringify(charts.topErrors)]
          );
          console.log(`[Charts] Built ${Object.keys(charts).length} chart datasets for run ${run.id}`);
        }

        // AI Analysis
        const insights = analyzeRun(sRows, statsResult.rows[0]);
        // Clamp to DB column widths (grade VARCHAR(2), label VARCHAR(50)).
        const grade = String(insights.healthScore.grade || 'NA').slice(0, 2);
        const label = String(insights.healthScore.label || '').slice(0, 50);
        await q(
          `INSERT INTO jtl.run_insights (run_id, health_score, health_grade, health_label, summary, findings)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (run_id) DO UPDATE SET
             health_score=$2, health_grade=$3, health_label=$4,
             summary=$5, findings=$6, analyzed_at=NOW()`,
          [run.id, insights.healthScore.score, grade,
           label, insights.summary, JSON.stringify(insights.findings)]
        );
        console.log(`[AI] Analysis complete for run ${run.id}: ${label} (${insights.healthScore.score}/100)`);
      } catch (err) {
        console.error('[Background] Processing failed:', err.message);
      }
    });

    res.status(201).json({ ...run, status: 'ready', stats });
  } catch (err) {
    await client.query('ROLLBACK');
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to process JTL file: ' + err.message });
  } finally {
    client.release();
  }
});

// GET /api/.../runs/:id/dashboard  — full JMeter-style chart data
router.get('/:id/dashboard', verifyToken, async (req, res) => {
  try {
    const result = await query('SELECT * FROM jtl.run_charts WHERE run_id = $1', [req.params.id]);
    if (!result.rows.length) {
      return res.json({ status: 'pending', message: 'Dashboard data is being processed. Please wait and refresh.' });
    }
    const r = result.rows[0];
    const parse = (v) => (typeof v === 'string' ? JSON.parse(v) : v) || [];
    res.json({
      status: 'ready',
      apdex:                    parse(r.apdex),
      statistics:               parse(r.statistics),
      requestSummary:           parse(r.request_summary),
      responseTimesOverTime:    parse(r.response_times_over_time),
      percentilesOverTime:      parse(r.percentiles_over_time),
      activeThreadsOverTime:    parse(r.active_threads_over_time),
      bytesOverTime:            parse(r.bytes_over_time),
      latencyOverTime:          parse(r.latency_over_time),
      hitsPerSecond:            parse(r.hits_per_second),
      codesPerSecond:           parse(r.codes_per_second),
      responseTimeDistribution: parse(r.response_time_distribution),
      percentilesPerLabel:      parse(r.percentiles_per_label),
      topErrors:                parse(r.top_errors),
      builtAt:                  r.built_at,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// GET /api/.../runs/:id/label-detail/:label  — complete data for one label
router.get('/:id/label-detail/:label', verifyToken, async (req, res) => {
  try {
    const label = decodeURIComponent(req.params.label);
    const runId = req.params.id;

    const result = await query(
      `SELECT ts, elapsed, success, response_code, latency, bytes, sent_bytes,
              all_threads, grp_threads, hostname
       FROM jtl.samples
       WHERE run_id = $1 AND label = $2
       ORDER BY ts ASC`,
      [runId, label]
    );

    if (!result.rows.length) {
      return res.json({ label, stats: null, timeSeries: [], distribution: [],
                        errorCodes: [], errorMessages: [], hostnames: [], rawSamples: [] });
    }

    const rows = result.rows.map(r => ({
      ts: parseInt(r.ts) || 0,
      elapsed: parseInt(r.elapsed) || 0,
      success: r.success === true || r.success === 'true' || r.success === 't',
      response_code: r.response_code || '',
      latency: parseInt(r.latency) || 0,
      bytes: parseInt(r.bytes) || 0,
      sent_bytes: parseInt(r.sent_bytes) || 0,
      all_threads: parseInt(r.all_threads) || 0,
      grp_threads: parseInt(r.grp_threads) || 0,
      hostname: r.hostname || '',
    }));

    // ── Core stats ────────────────────────────────────────────────────────────
    const sorted = [...rows.map(r => r.elapsed)].sort((a, b) => a - b);
    const errors = rows.filter(r => !r.success);
    const successes = rows.filter(r => r.success);
    const total = rows.length;
    const avg = sorted.reduce((a, b) => a + b, 0) / total;
    const pct = (p) => sorted[Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1)] || 0;
    const minTs = rows.reduce((m, r) => r.ts < m ? r.ts : m, Infinity);
    const maxTs = rows.reduce((m, r) => r.ts > m ? r.ts : m, -Infinity);
    const durationSec = Math.max((maxTs - minTs) / 1000, 1);
    const variance = sorted.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / total;
    const stdDev = Math.sqrt(variance);

    // Latency
    const latRows = rows.filter(r => r.latency > 0);
    const avgLatency = latRows.length ? Math.round(latRows.reduce((s, r) => s + r.latency, 0) / latRows.length) : 0;
    const sortedLat = latRows.map(r => r.latency).sort((a, b) => a - b);
    const p95Latency = sortedLat.length ? sortedLat[Math.min(Math.floor(0.95 * sortedLat.length), sortedLat.length - 1)] : 0;

    // Bytes
    const totalBytes = rows.reduce((s, r) => s + r.bytes, 0);
    const totalSentBytes = rows.reduce((s, r) => s + r.sent_bytes, 0);

    // Consecutive error streaks
    let maxStreak = 0, curStreak = 0;
    for (const r of rows) {
      if (!r.success) { curStreak++; maxStreak = Math.max(maxStreak, curStreak); }
      else curStreak = 0;
    }

    // Fastest / slowest 10
    const byElapsed = [...rows].sort((a, b) => a.elapsed - b.elapsed);
    const fastest10 = byElapsed.slice(0, 10).map(r => ({ time: new Date(r.ts).toLocaleTimeString(), elapsed: r.elapsed, response_code: r.response_code, success: r.success }));
    const slowest10 = byElapsed.slice(-10).reverse().map(r => ({ time: new Date(r.ts).toLocaleTimeString(), elapsed: r.elapsed, response_code: r.response_code, success: r.success }));

    const stats = {
      count: total, errors: errors.length, successes: successes.length,
      errorRate: parseFloat(((errors.length / total) * 100).toFixed(2)),
      avg: Math.round(avg), median: pct(50), p75: pct(75), p90: pct(90),
      p95: pct(95), p99: pct(99), p999: pct(99.9),
      min: sorted[0], max: sorted[sorted.length - 1],
      range: sorted[sorted.length - 1] - sorted[0],
      stdDev: Math.round(stdDev),
      coefficientOfVariation: parseFloat(((stdDev / avg) * 100).toFixed(1)),
      throughput: parseFloat((total / durationSec).toFixed(3)),
      avgLatency, p95Latency,
      processingTime: Math.round(avg - avgLatency),
      avgBytes: Math.round(totalBytes / total),
      totalBytes, totalSentBytes,
      kbPerSec: parseFloat((totalBytes / 1024 / durationSec).toFixed(2)),
      sentKbPerSec: parseFloat((totalSentBytes / 1024 / durationSec).toFixed(2)),
      maxConsecutiveErrors: maxStreak,
      durationSec: Math.round(durationSec),
      startTime: new Date(minTs).toISOString(),
      endTime: new Date(maxTs).toISOString(),
      fastest10, slowest10,
    };

    // ── Time-series (10s buckets) ─────────────────────────────────────────────
    const bucketMs = 10000;
    const bucketMap = {};
    for (const r of rows) {
      const b = Math.floor(r.ts / bucketMs) * bucketMs;
      if (!bucketMap[b]) bucketMap[b] = [];
      bucketMap[b].push(r);
    }
    const timeSeries = Object.entries(bucketMap).sort(([a], [b]) => +a - +b).map(([ts, items]) => {
      const el = items.map(i => i.elapsed).sort((a, b) => a - b);
      const errs = items.filter(i => !i.success).length;
      const lat = items.filter(i => i.latency > 0).map(i => i.latency);
      return {
        time: Math.round((+ts - minTs) / 1000),
        avgElapsed: Math.round(el.reduce((a, b) => a + b, 0) / el.length),
        p50: el[Math.min(Math.floor(0.50 * el.length), el.length - 1)] || 0,
        p90: el[Math.min(Math.floor(0.90 * el.length), el.length - 1)] || 0,
        p95: el[Math.min(Math.floor(0.95 * el.length), el.length - 1)] || 0,
        p99: el[Math.min(Math.floor(0.99 * el.length), el.length - 1)] || 0,
        maxElapsed: el[el.length - 1] || 0,
        hits: items.length, errors: errs,
        errorRate: parseFloat(((errs / items.length) * 100).toFixed(1)),
        threads: items.reduce((m, i) => i.all_threads > m ? i.all_threads : m, 0),
        avgLatency: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length) : 0,
        bytesKb: parseFloat((items.reduce((s, i) => s + i.bytes, 0) / 1024).toFixed(2)),
      };
    });

    // ── Histogram ─────────────────────────────────────────────────────────────
    const histBucketSize = Math.max(Math.ceil(sorted[sorted.length - 1] / 25), 50);
    const distMap = {};
    for (const e of sorted) {
      const b = Math.floor(e / histBucketSize) * histBucketSize;
      distMap[b] = (distMap[b] || 0) + 1;
    }
    const distribution = Object.entries(distMap).sort(([a], [b]) => +a - +b)
      .map(([ms, count]) => ({ range: `${ms}–${+ms + histBucketSize}`, ms: +ms, count, pct: parseFloat(((count / total) * 100).toFixed(1)) }));

    // ── HTTP response codes ───────────────────────────────────────────────────
    const codeMap = {};
    for (const r of rows) {
      const code = r.response_code || 'unknown';
      if (!codeMap[code]) codeMap[code] = { count: 0, errors: 0 };
      codeMap[code].count++;
      if (!r.success) codeMap[code].errors++;
    }
    const errorCodes = Object.entries(codeMap).sort(([, a], [, b]) => b.count - a.count)
      .map(([code, v]) => ({ code, count: v.count, errors: v.errors, pctOfTotal: parseFloat(((v.count / total) * 100).toFixed(2)) }));

    // ── Error messages ────────────────────────────────────────────────────────
    const msgMap = {};
    for (const r of errors) {
      const msg = `HTTP ${r.response_code}` + (r.hostname ? ` from ${r.hostname}` : '');
      msgMap[msg] = (msgMap[msg] || 0) + 1;
    }
    const errorMessages = Object.entries(msgMap).sort(([, a], [, b]) => b - a).slice(0, 15)
      .map(([message, count]) => ({ message, count, pct: parseFloat(((count / (errors.length || 1)) * 100).toFixed(1)) }));

    // ── Hostnames ─────────────────────────────────────────────────────────────
    const hostMap = {};
    for (const r of rows) { if (r.hostname) hostMap[r.hostname] = (hostMap[r.hostname] || 0) + 1; }
    const hostnames = Object.entries(hostMap).sort(([, a], [, b]) => b - a)
      .map(([host, count]) => ({ host, count, pct: parseFloat(((count / total) * 100).toFixed(1)) }));

    // ── Raw samples (errors first, then last 100 successes) ───────────────────
    const rawSamples = [...errors.slice(0, 150), ...successes.slice(-50)]
      .sort((a, b) => a.ts - b.ts)
      .map(r => ({
        time: new Date(r.ts).toLocaleTimeString(),
        elapsed: r.elapsed, success: r.success,
        responseCode: r.response_code, latency: r.latency,
        bytes: r.bytes, threads: r.all_threads, hostname: r.hostname,
      }));

    res.json({ label, stats, timeSeries, distribution, errorCodes, errorMessages, hostnames, rawSamples });
  } catch (err) {
    console.error('label-detail error:', err.message);
    res.status(500).json({ error: 'Failed to fetch label detail: ' + err.message });
  }
});

// GET /api/.../runs/:id/insights
router.get('/:id/insights', verifyToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM jtl.run_insights WHERE run_id = $1',
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.json({ status: 'not_analyzed', message: 'No analysis found. Click "Run Analysis" to analyze this run.' });
    }
    const row = result.rows[0];
    res.json({
      status: 'ready',
      healthScore: { score: row.health_score, grade: row.health_grade, label: row.health_label },
      summary: row.summary,
      findings: typeof row.findings === 'string' ? JSON.parse(row.findings) : row.findings,
      analyzedAt: row.analyzed_at,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch insights' });
  }
});

// POST /api/.../runs/:id/analyze  — trigger analysis on demand (for old runs)
router.post('/:id/analyze', verifyToken, requireManager, async (req, res) => {
  const runId = req.params.id;
  try {
    // Check samples exist
    const countResult = await query('SELECT COUNT(*) FROM jtl.samples WHERE run_id = $1', [runId]);
    if (parseInt(countResult.rows[0].count) === 0) {
      return res.status(400).json({ error: 'No sample data found for this run. The JTL file may not have been processed.' });
    }

    // Respond immediately — analysis runs in background
    res.json({ status: 'started', message: 'Analysis started. Refresh in a few seconds.' });

    // Background processing
    setImmediate(async () => {
      try {
        console.log(`[Analyze] Starting analysis for run ${runId}`);
        const sampleResult = await query(
          'SELECT elapsed, success, response_code, label, ts, latency, all_threads, bytes, sent_bytes FROM jtl.samples WHERE run_id = $1',
          [runId]
        );
        const statsResult = await query('SELECT * FROM jtl.run_stats WHERE run_id = $1', [runId]);
        const sRows = sampleResult.rows;

        console.log(`[Analyze] Loaded ${sRows.length} samples for run ${runId}`);
        if (!sRows.length) {
          console.error(`[Analyze] No samples found for run ${runId}`);
          return;
        }

        // Normalize success field — DB may return boolean or string
        const normalizedRows = sRows.map(s => ({
          ...s,
          elapsed: parseInt(s.elapsed) || 0,
          ts: parseInt(s.ts) || 0,
          latency: parseInt(s.latency) || 0,
          all_threads: parseInt(s.all_threads) || 0,
          bytes: parseInt(s.bytes) || 0,
          sent_bytes: parseInt(s.sent_bytes) || 0,
          success: s.success === true || s.success === 'true' || s.success === 't',
        }));

        // Build charts
        console.log(`[Analyze] Building charts...`);
        let charts = null;
        try {
          charts = buildAllCharts(normalizedRows);
        } catch (chartErr) {
          console.error('[Analyze] Chart build failed:', chartErr.message);
        }

        if (charts) {
          // Guard the chart insert separately so a chart-storage failure does
          // not abort the whole analysis (insights can still be saved).
          try {
            await query(
              `INSERT INTO jtl.run_charts
                 (run_id, apdex, statistics, request_summary, response_times_over_time,
                  percentiles_over_time, active_threads_over_time, bytes_over_time,
                  latency_over_time, hits_per_second, codes_per_second,
                  response_time_distribution, percentiles_per_label, top_errors)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
               ON CONFLICT (run_id) DO UPDATE SET
                 apdex=$2, statistics=$3, request_summary=$4,
                 response_times_over_time=$5, percentiles_over_time=$6,
                 active_threads_over_time=$7, bytes_over_time=$8,
                 latency_over_time=$9, hits_per_second=$10, codes_per_second=$11,
                 response_time_distribution=$12, percentiles_per_label=$13,
                 top_errors=$14, built_at=NOW()`,
              [runId,
               JSON.stringify(charts.apdex), JSON.stringify(charts.statistics),
               JSON.stringify(charts.requestSummary), JSON.stringify(charts.responseTimesOverTime),
               JSON.stringify(charts.percentilesOverTime), JSON.stringify(charts.activeThreadsOverTime),
               JSON.stringify(charts.bytesOverTime), JSON.stringify(charts.latencyOverTime),
               JSON.stringify(charts.hitsPerSecond), JSON.stringify(charts.codesPerSecond),
               JSON.stringify(charts.responseTimeDistribution), JSON.stringify(charts.percentilesPerLabel),
               JSON.stringify(charts.topErrors)]
            );
            console.log(`[Analyze] Charts saved for run ${runId}`);
          } catch (chartSaveErr) {
            console.error('[Analyze] Chart save failed:', chartSaveErr.message);
          }
        }

        // AI insights
        console.log(`[Analyze] Running AI analysis...`);
        let insights;
        try {
          insights = analyzeRun(normalizedRows, statsResult.rows[0]);
        } catch (aiErr) {
          console.error('[Analyze] AI analysis failed:', aiErr.message, aiErr.stack);
          // Save a minimal result so UI stops spinning.
          // NOTE: health_grade column is VARCHAR(2) — keep grade <= 2 chars.
          insights = {
            healthScore: { score: 0, grade: 'NA', label: 'Analysis error' },
            summary: `Analysis failed: ${aiErr.message}`,
            findings: [],
          };
        }

        // Defensive clamping to fit DB column widths (grade VARCHAR(2), label VARCHAR(50)).
        const grade = String(insights.healthScore.grade || 'NA').slice(0, 2);
        const label = String(insights.healthScore.label || '').slice(0, 50);

        await query(
          `INSERT INTO jtl.run_insights (run_id, health_score, health_grade, health_label, summary, findings)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (run_id) DO UPDATE SET
             health_score=$2, health_grade=$3, health_label=$4,
             summary=$5, findings=$6, analyzed_at=NOW()`,
          [runId, insights.healthScore.score, grade,
           label, insights.summary, JSON.stringify(insights.findings)]
        );
        console.log(`[Analyze] ✅ Complete for run ${runId}: ${label} (${insights.healthScore.score}/100)`);
      } catch (err) {
        console.error(`[Analyze] ❌ Fatal error for run ${runId}:`, err.message);
        console.error(err.stack);
        // Write an error record so UI stops spinning
        try {
          await query(
            `INSERT INTO jtl.run_insights (run_id, health_score, health_grade, health_label, summary, findings)
             VALUES ($1, 0, 'E', 'Error', $2, '[]')
             ON CONFLICT (run_id) DO UPDATE SET
               health_score=0, health_grade='E', health_label='Error',
               summary=$2, findings='[]', analyzed_at=NOW()`,
            [runId, `Analysis error: ${err.message}`]
          );
        } catch (writeErr) {
          console.error('[Analyze] Could not write error record:', writeErr.message);
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to start analysis' });
  }
});

// PUT /api/.../runs/:id  (admin edits note/environment/test_name)
router.put('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { note, environment, test_name } = req.body;
    const result = await query(
      `UPDATE jtl.runs SET
        note = COALESCE($1, note),
        environment = COALESCE($2, environment),
        test_name = COALESCE($3, test_name),
        updated_at = NOW()
       WHERE id = $4 AND scenario_id = $5 RETURNING *`,
      [note !== undefined ? note : null, environment || null, test_name || null, req.params.id, req.params.scenarioId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Run not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update run' });
  }
});

// DELETE /api/.../runs/:id  (admin only)
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    await query(
      'DELETE FROM jtl.runs WHERE id = $1 AND scenario_id = $2',
      [req.params.id, req.params.scenarioId]
    );
    res.json({ message: 'Run deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete run' });
  }
});

module.exports = router;
