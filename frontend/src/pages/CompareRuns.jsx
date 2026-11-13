import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar,
} from 'recharts';
import { compareRuns } from '../api/client';
import { formatDateTime } from '../utils/datetime';

// Fixed colour per run slot (consistent across every chart + legend).
const RUN_COLORS = ['#219EBC', '#FB8500', '#8338EC'];

// For each metric, whether a LOWER value is better (true) or higher (false).
const LOWER_IS_BETTER = {
  errorRate: true, avg: true, min: true, max: true,
  p90: true, p95: true, p99: true, throughput: false, totalRequests: null,
};

const KPI_ROWS = [
  { key: 'totalRequests', label: 'Total Requests', unit: '' },
  { key: 'errorRate',     label: 'Error Rate',     unit: '%' },
  { key: 'avg',           label: 'Avg Response',   unit: 'ms' },
  { key: 'p90',           label: 'P90',            unit: 'ms' },
  { key: 'p95',           label: 'P95',            unit: 'ms' },
  { key: 'p99',           label: 'P99',            unit: 'ms' },
  { key: 'max',           label: 'Max',            unit: 'ms' },
  { key: 'throughput',    label: 'Throughput',     unit: '/s' },
];

function fmt(v, unit) {
  if (v == null) return '—';
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (Number.isNaN(n)) return '—';
  const rounded = unit === '%' ? n.toFixed(2) : (unit === '/s' ? n.toFixed(2) : Math.round(n).toLocaleString());
  return `${rounded}${unit ? ' ' + unit : ''}`;
}

// Colour a delta vs the baseline: green = better, red = worse, gray = neutral.
function deltaCell(value, baseline, metricKey) {
  if (value == null || baseline == null || baseline === 0) return { text: '—', cls: 'text-gray-400' };
  const diffPct = ((value - baseline) / baseline) * 100;
  if (Math.abs(diffPct) < 0.05) return { text: '0%', cls: 'text-gray-400' };
  const lowerBetter = LOWER_IS_BETTER[metricKey];
  let cls = 'text-gray-500';
  if (lowerBetter !== null && lowerBetter !== undefined) {
    const better = lowerBetter ? value < baseline : value > baseline;
    cls = better ? 'text-green-600' : 'text-red-600';
  }
  const sign = diffPct > 0 ? '+' : '';
  return { text: `${sign}${diffPct.toFixed(1)}%`, cls };
}

export default function CompareRuns() {
  const { projectId, scenarioId } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ids = (params.get('ids') || '').split(',').filter(Boolean);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pickedLabel, setPickedLabel] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await compareRuns(projectId, scenarioId, ids);
        setData(res.data);
        if (res.data.labels?.length) setPickedLabel(res.data.labels[0]);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load comparison');
      } finally { setLoading(false); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runLabel = (r, i) => r.testName || `Run ${i + 1}`;

  // Merge each run's overall percentile-over-time into a single dataset keyed by time.
  const overlayP95 = useMemo(() => {
    if (!data) return [];
    const map = {};
    data.runs.forEach((run, i) => {
      for (const pt of run.charts.percentilesOverTime) {
        if (!map[pt.time]) map[pt.time] = { time: pt.time };
        map[pt.time][`run${i}`] = pt.p95;
      }
    });
    return Object.values(map).sort((a, b) => a.time - b.time);
  }, [data]);

  const overlayThroughput = useMemo(() => {
    if (!data) return [];
    const map = {};
    data.runs.forEach((run, i) => {
      for (const pt of run.charts.hitsPerSecond) {
        if (!map[pt.time]) map[pt.time] = { time: pt.time };
        map[pt.time][`run${i}`] = pt.hits;
      }
    });
    return Object.values(map).sort((a, b) => a.time - b.time);
  }, [data]);

  // Errors per second over time — one line per run (shows error reduction).
  const overlayErrors = useMemo(() => {
    if (!data) return [];
    const map = {};
    data.runs.forEach((run, i) => {
      for (const pt of run.charts.hitsPerSecond) {
        if (pt.errors == null) continue;
        if (!map[pt.time]) map[pt.time] = { time: pt.time };
        map[pt.time][`run${i}`] = pt.errors;
      }
    });
    return Object.values(map).sort((a, b) => a.time - b.time);
  }, [data]);

  // Per-label overlay: avg response time over time for the picked label.
  const overlayLabel = useMemo(() => {
    if (!data || !pickedLabel) return [];
    const map = {};
    data.runs.forEach((run, i) => {
      for (const pt of run.charts.responseTimesOverTime) {
        if (pt[pickedLabel] == null) continue;
        if (!map[pt.time]) map[pt.time] = { time: pt.time };
        map[pt.time][`run${i}`] = pt[pickedLabel];
      }
    });
    return Object.values(map).sort((a, b) => a.time - b.time);
  }, [data, pickedLabel]);

  if (loading) return <div className="p-8 text-gray-500">Loading comparison...</div>;
  if (error) return (
    <div className="p-6">
      <div className="card text-red-600">{error}</div>
      <button className="btn-secondary mt-4" onClick={() => navigate(-1)}>Back</button>
    </div>
  );

  const { runs, baselineId } = data;
  const baselineIdx = runs.findIndex(r => r.id === baselineId);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link to={`/projects/${projectId}/scenarios/${scenarioId}`} className="hover:text-brand-600 flex items-center gap-1">
          <ArrowLeft size={14} /> Back to runs
        </Link>
        <ChevronRight size={14} />
        <span className="text-gray-900 font-medium">Compare Runs</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Run Comparison</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Comparing {runs.length} runs · baseline = oldest executed (shown with a dot)
        </p>
      </div>

      {/* Run legend chips */}
      <div className="flex flex-wrap gap-3">
        {runs.map((r, i) => (
          <div key={r.id} className="flex items-center gap-2 card py-2 px-3">
            <span className="w-3 h-3 rounded-full" style={{ background: RUN_COLORS[i] }} />
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {runLabel(r, i)} {r.id === baselineId && <span className="text-xs text-gray-400">(baseline)</span>}
              </p>
              <p className="text-xs text-gray-400">
                {r.startTime ? formatDateTime(r.startTime) : '—'}
                {r.environment ? ` · ${r.environment}` : ''}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* KPI delta table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="font-semibold text-gray-900 text-sm">Overall Metrics</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Metric</th>
              {runs.map((r, i) => (
                <th key={r.id} className="text-left text-xs font-medium uppercase px-4 py-2" style={{ color: RUN_COLORS[i] }}>
                  {runLabel(r, i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {KPI_ROWS.map(row => {
              const baseVal = runs[baselineIdx]?.stats[row.key];
              return (
                <tr key={row.key} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-700">{row.label}</td>
                  {runs.map((r, i) => {
                    const v = r.stats[row.key];
                    const isBaseline = r.id === baselineId;
                    const d = isBaseline ? null : deltaCell(v, baseVal, row.key);
                    return (
                      <td key={r.id} className="px-4 py-2">
                        <span className="text-gray-900">{fmt(v, row.unit)}</span>
                        {d && <span className={`ml-2 text-xs font-medium ${d.cls}`}>{d.text}</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Error summary cards — highlight whether errors went down across runs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {runs.map((r, i) => {
          const baseErrPct = runs[baselineIdx]?.stats.errorRate;
          const baseErrCnt = runs[baselineIdx]?.stats.errorCount;
          const isBaseline = r.id === baselineId;
          const pctDelta = isBaseline ? null : deltaCell(r.stats.errorRate, baseErrPct, 'errorRate');
          const cntDelta = isBaseline ? null : deltaCell(r.stats.errorCount, baseErrCnt, 'errorRate'); // lower is better
          const errPct = r.stats.errorRate ?? 0;
          const pctColor = errPct === 0 ? 'text-green-600' : errPct > 1 ? 'text-red-600' : 'text-amber-600';
          return (
            <div key={r.id} className="card">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: RUN_COLORS[i] }} />
                <span className="text-sm font-semibold text-gray-900">{runLabel(r, i)}</span>
                {isBaseline && <span className="text-xs text-gray-400">(baseline)</span>}
              </div>

              <p className={`text-3xl font-bold ${pctColor}`}>{errPct.toFixed(2)}%</p>
              <p className="text-xs text-gray-500">error rate
                {pctDelta && <span className={`ml-2 font-medium ${pctDelta.cls}`}>{pctDelta.text} vs baseline</span>}
              </p>

              <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-sm">
                <div>
                  <p className="font-semibold text-gray-900">{(r.stats.errorCount ?? 0).toLocaleString()}</p>
                  <p className="text-xs text-gray-400">errors
                    {cntDelta && <span className={`ml-1 font-medium ${cntDelta.cls}`}>{cntDelta.text}</span>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">{(r.stats.totalRequests ?? 0).toLocaleString()}</p>
                  <p className="text-xs text-gray-400">total requests</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Overall P95 over time */}
      <ChartCard title="P95 Response Time over Time (overall)">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={overlayP95}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} label={{ value: 'seconds', position: 'insideBottomRight', offset: -4, fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} label={{ value: 'ms', angle: -90, position: 'insideLeft', fontSize: 11 }} />
            <Tooltip />
            <Legend />
            {runs.map((r, i) => (
              <Line key={r.id} type="monotone" dataKey={`run${i}`} name={runLabel(r, i)} stroke={RUN_COLORS[i]} dot={false} strokeWidth={2} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Overall throughput over time */}
      <ChartCard title="Throughput over Time (hits/sec)">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={overlayThroughput}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} label={{ value: 'seconds', position: 'insideBottomRight', offset: -4, fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} label={{ value: 'req/s', angle: -90, position: 'insideLeft', fontSize: 11 }} />
            <Tooltip />
            <Legend />
            {runs.map((r, i) => (
              <Line key={r.id} type="monotone" dataKey={`run${i}`} name={runLabel(r, i)} stroke={RUN_COLORS[i]} dot={false} strokeWidth={2} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Errors over time */}
      <ChartCard title="Errors over Time (errors/sec)">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={overlayErrors}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} label={{ value: 'seconds', position: 'insideBottomRight', offset: -4, fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} label={{ value: 'errors/s', angle: -90, position: 'insideLeft', fontSize: 11 }} />
            <Tooltip />
            <Legend />
            {runs.map((r, i) => (
              <Line key={r.id} type="monotone" dataKey={`run${i}`} name={runLabel(r, i)} stroke={RUN_COLORS[i]} dot={false} strokeWidth={2} connectNulls />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Error rate grouped bars */}
      <ChartCard title="Error Rate by Run (%)">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={[{ name: 'Error %', ...Object.fromEntries(runs.map((r, i) => [`run${i}`, r.stats.errorRate])) }]}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} label={{ value: '%', angle: -90, position: 'insideLeft', fontSize: 11 }} />
            <Tooltip />
            <Legend />
            {runs.map((r, i) => (
              <Bar key={r.id} dataKey={`run${i}`} name={runLabel(r, i)} fill={RUN_COLORS[i]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* P95 grouped bars */}
      <ChartCard title="P95 Response Time by Run">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={[{ name: 'P95', ...Object.fromEntries(runs.map((r, i) => [`run${i}`, r.stats.p95])) }]}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} label={{ value: 'ms', angle: -90, position: 'insideLeft', fontSize: 11 }} />
            <Tooltip />
            <Legend />
            {runs.map((r, i) => (
              <Bar key={r.id} dataKey={`run${i}`} name={runLabel(r, i)} fill={RUN_COLORS[i]} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Per-label picker chart */}
      {data.labels.length > 0 && (
        <ChartCard title="Per-Transaction Comparison">
          <div className="mb-3">
            <label className="text-sm text-gray-600 mr-2">Transaction:</label>
            <select className="input inline-block w-auto" value={pickedLabel} onChange={e => setPickedLabel(e.target.value)}>
              {data.labels.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={overlayLabel}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} label={{ value: 'seconds', position: 'insideBottomRight', offset: -4, fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} label={{ value: 'ms', angle: -90, position: 'insideLeft', fontSize: 11 }} />
              <Tooltip />
              <Legend />
              {runs.map((r, i) => (
                <Line key={r.id} type="monotone" dataKey={`run${i}`} name={runLabel(r, i)} stroke={RUN_COLORS[i]} dot={false} strokeWidth={2} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      {/* Per-label table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="font-semibold text-gray-900 text-sm">Per-Transaction Metrics (Avg / P95 / Error%)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2">Transaction</th>
                {runs.map((r, i) => (
                  <th key={r.id} className="text-left text-xs font-medium uppercase px-4 py-2" style={{ color: RUN_COLORS[i] }}>
                    {runLabel(r, i)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.labels.map(label => (
                <tr key={label} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-700">{label}</td>
                  {runs.map((r, i) => {
                    const pl = r.perLabel[label];
                    return (
                      <td key={r.id} className="px-4 py-2 text-xs text-gray-700">
                        {pl
                          ? <span>avg {Math.round(pl.avg)}ms · P95 {pl.p95}ms · <span className={parseFloat(pl.errorRate) > 1 ? 'text-red-600' : 'text-green-600'}>{pl.errorRate}%</span></span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="card">
      <h2 className="font-semibold text-gray-900 text-sm mb-3">{title}</h2>
      {children}
    </div>
  );
}
