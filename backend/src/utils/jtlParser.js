const { parse } = require('csv-parse');
const fs = require('fs');

// Standard JMeter CSV columns (case-insensitive mapping)
const COLUMN_MAP = {
  timestamp: 'ts',
  elapsed: 'elapsed',
  label: 'label',
  responsecode: 'response_code',
  success: 'success',
  bytes: 'bytes',
  sentbytes: 'sent_bytes',
  latency: 'latency',
  allthreads: 'all_threads',
  grpthreads: 'grp_threads',
  hostname: 'hostname',
};

function parseJtlFile(filePath) {
  return new Promise((resolve, reject) => {
    const records = [];
    const parser = parse({ columns: true, trim: true, skip_empty_lines: true });

    parser.on('readable', () => {
      let record;
      while ((record = parser.read()) !== null) {
        const normalized = {};
        for (const [rawKey, rawVal] of Object.entries(record)) {
          const key = rawKey.toLowerCase().replace(/[^a-z]/g, '');
          const mappedKey = COLUMN_MAP[key];
          if (mappedKey) normalized[mappedKey] = rawVal;
        }
        // Convert types
        const row = {
          ts: parseInt(normalized.ts) || 0,
          elapsed: parseInt(normalized.elapsed) || 0,
          label: normalized.label || '',
          response_code: normalized.response_code || '',
          success: (normalized.success || '').toLowerCase() === 'true',
          bytes: parseInt(normalized.bytes) || 0,
          sent_bytes: parseInt(normalized.sent_bytes) || 0,
          latency: parseInt(normalized.latency) || 0,
          all_threads: parseInt(normalized.all_threads) || 0,
          grp_threads: parseInt(normalized.grp_threads) || 0,
          hostname: normalized.hostname || '',
        };
        records.push(row);
      }
    });

    parser.on('error', reject);
    parser.on('end', () => resolve(records));

    fs.createReadStream(filePath).pipe(parser);
  });
}

function computeStats(samples) {
  if (!samples.length) return null;

  const totalRequests = samples.length;
  const errors = samples.filter(s => !s.success);
  const errorCount = errors.length;
  const errorRate = (errorCount / totalRequests) * 100;

  const elapsed = samples.map(s => s.elapsed).sort((a, b) => a - b);
  const sum = elapsed.reduce((a, b) => a + b, 0);
  const avg = sum / totalRequests;
  const min = elapsed[0];
  const max = elapsed[elapsed.length - 1];

  const pct = (p) => elapsed[Math.floor((p / 100) * elapsed.length)] || 0;

  // Duration in seconds
  const timestamps = samples.map(s => s.ts).filter(t => t > 0);
  const startTime = timestamps.reduce((m, t) => t < m ? t : m, Infinity);
  const endTime   = timestamps.reduce((m, t) => t > m ? t : m, -Infinity);
  const durationSec = timestamps.length > 1 ? (endTime - startTime) / 1000 : 1;
  const throughput = totalRequests / durationSec;

  // Per-label stats
  const labelMap = {};
  for (const s of samples) {
    if (!labelMap[s.label]) {
      labelMap[s.label] = { samples: [], errors: 0 };
    }
    labelMap[s.label].samples.push(s.elapsed);
    if (!s.success) labelMap[s.label].errors++;
  }

  const perLabel = {};
  for (const [label, data] of Object.entries(labelMap)) {
    const ls = data.samples.sort((a, b) => a - b);
    const lsum = ls.reduce((a, b) => a + b, 0);
    perLabel[label] = {
      count: ls.length,
      errors: data.errors,
      errorRate: ((data.errors / ls.length) * 100).toFixed(2),
      avg: (lsum / ls.length).toFixed(2),
      min: ls[0],
      max: ls[ls.length - 1],
      p90: ls[Math.floor(0.9 * ls.length)] || 0,
      p95: ls[Math.floor(0.95 * ls.length)] || 0,
      p99: ls[Math.floor(0.99 * ls.length)] || 0,
    };
  }

  return {
    totalRequests,
    errorCount,
    errorRate: parseFloat(errorRate.toFixed(4)),
    avgResponseTime: parseFloat(avg.toFixed(2)),
    minResponseTime: parseFloat(min),
    maxResponseTime: parseFloat(max),
    p90ResponseTime: parseFloat(pct(90)),
    p95ResponseTime: parseFloat(pct(95)),
    p99ResponseTime: parseFloat(pct(99)),
    throughput: parseFloat(throughput.toFixed(4)),
    startTime: timestamps.length ? new Date(startTime) : null,
    durationSeconds: Math.round(durationSec),
    perLabel,
  };
}

module.exports = { parseJtlFile, computeStats };
