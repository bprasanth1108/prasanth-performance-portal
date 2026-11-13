import React, { useEffect, useState, useRef } from 'react';
import { Play } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { formatDateTime } from '../utils/datetime';

const COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316','#84cc16','#ec4899','#6366f1'];
const APDEX_COLOR = { Excellent:'#22c55e', Good:'#3b82f6', Fair:'#f59e0b', Poor:'#f97316', Unacceptable:'#ef4444' };

function SectionTitle({ children }) {
  return <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-3 flex items-center gap-2">
    <span className="w-1 h-4 bg-brand-600 rounded-full inline-block" />{children}
  </h3>;
}

function ChartCard({ title, children, fullWidth }) {
  return (
    <div className={`card ${fullWidth ? 'col-span-full' : ''}`}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </div>
  );
}

function PendingCard() {
  return (
    <div className="card col-span-full flex items-center gap-3 py-8">
      <div className="animate-spin h-6 w-6 border-2 border-brand-600 border-t-transparent rounded-full" />
      <div>
        <p className="text-sm font-medium text-gray-900">Building dashboard...</p>
        <p className="text-xs text-gray-500">Processing samples. Auto-refreshing.</p>
      </div>
    </div>
  );
}

// ── APDEX Table ──────────────────────────────────────────────────────────────
function ApdexTable({ data }) {
  return (
    <ChartCard title="APDEX (Application Performance Index)" fullWidth>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[600px]">
          <thead className="bg-gray-50">
            <tr>{['APDEX', 'Rating', 'Satisfied', 'Tolerating', 'Frustrated', 'Label'].map(h =>
              <th key={h} className="text-left font-medium text-gray-500 uppercase tracking-wide px-3 py-2">{h}</th>
            )}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-bold" style={{ color: APDEX_COLOR[row.rating] }}>{row.apdex.toFixed(3)}</td>
                <td className="px-3 py-2">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{ background: APDEX_COLOR[row.rating] + '20', color: APDEX_COLOR[row.rating] }}>
                    {row.rating}
                  </span>
                </td>
                <td className="px-3 py-2 text-green-600">{row.satisfied}</td>
                <td className="px-3 py-2 text-yellow-600">{row.tolerating}</td>
                <td className="px-3 py-2 text-red-600">{row.frustrated}</td>
                <td className="px-3 py-2 font-medium text-gray-900 max-w-xs truncate" title={row.label}>{row.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}

// ── Statistics Table (JMeter aggregate report) ───────────────────────────────
function StatisticsTable({ data }) {
  return (
    <ChartCard title="Statistics" fullWidth>
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[900px]">
          <thead className="bg-gray-50">
            <tr>{['Label','# Samples','Error %','Mean','Median','90th pct','95th pct','99th pct','Min','Max','Std Dev','Throughput','KB/s'].map(h =>
              <th key={h} className="text-left font-medium text-gray-500 uppercase tracking-wide px-3 py-2 whitespace-nowrap">{h}</th>
            )}</tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50 transition-colors">
                <td className="px-3 py-2 font-medium text-gray-900 max-w-[200px] truncate" title={row.label}>{row.label}</td>
                <td className="px-3 py-2">{row.samples.toLocaleString()}</td>
                <td className="px-3 py-2">
                  <span className={row.errorPct > 1 ? 'text-red-600 font-bold' : 'text-green-600'}>{row.errorPct}%</span>
                </td>
                <td className="px-3 py-2">{row.mean}</td>
                <td className="px-3 py-2">{row.median}</td>
                <td className="px-3 py-2">{row.p90}</td>
                <td className="px-3 py-2 font-medium text-orange-600">{row.p95}</td>
                <td className="px-3 py-2 font-medium text-red-600">{row.p99}</td>
                <td className="px-3 py-2 text-gray-500">{row.min}</td>
                <td className="px-3 py-2 text-gray-500">{row.max}</td>
                <td className="px-3 py-2 text-gray-500">±{row.stdDev}</td>
                <td className="px-3 py-2 text-brand-600 font-medium">{row.throughput}/s</td>
                <td className="px-3 py-2 text-gray-500">{row.kbPerSec}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}

// ── Request Summary Pie ──────────────────────────────────────────────────────
function RequestSummaryPie({ data }) {
  const pie = [
    { name: 'Passed', value: data.passed, color: '#22c55e' },
    { name: 'Failed', value: data.failed, color: '#ef4444' },
  ];
  return (
    <ChartCard title="Request Summary">
      <div className="flex items-center gap-4">
        <ResponsiveContainer width="50%" height={160}>
          <PieChart>
            <Pie data={pie} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value" paddingAngle={2}>
              {pie.map((e, i) => <Cell key={i} fill={e.color} />)}
            </Pie>
            <Tooltip formatter={(v) => v.toLocaleString()} />
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-2">
          <p className="text-2xl font-bold text-green-600">{data.passRate}%</p>
          <p className="text-xs text-gray-500">Pass rate</p>
          {pie.map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded-full" style={{ background: e.color }} />
              <span className="text-gray-600">{e.name}:</span>
              <span className="font-medium">{e.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </ChartCard>
  );
}

// ── Generic line chart ───────────────────────────────────────────────────────
function TimeLineChart({ title, data, lines, yLabel, fullWidth }) {
  if (!data?.length) return null;
  const keys = lines || Object.keys(data[0]).filter(k => k !== 'time');
  return (
    <ChartCard title={title} fullWidth={fullWidth}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="time" tick={{ fontSize: 10 }} label={{ value: 'Elapsed (s)', position: 'insideBottom', offset: -2, fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} label={{ value: yLabel, angle: -90, position: 'insideLeft', fontSize: 10 }} />
          <Tooltip />
          <Legend iconType="line" wrapperStyle={{ fontSize: 11 }} />
          {keys.map((k, i) => <Line key={k} type="monotone" dataKey={k} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={1.5} />)}
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── Area chart ───────────────────────────────────────────────────────────────
function TimeAreaChart({ title, data, areas, yLabel, fullWidth }) {
  if (!data?.length) return null;
  const keys = areas || Object.keys(data[0]).filter(k => k !== 'time');
  return (
    <ChartCard title={title} fullWidth={fullWidth}>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="time" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} label={{ value: yLabel, angle: -90, position: 'insideLeft', fontSize: 10 }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {keys.map((k, i) => (
            <Area key={k} type="monotone" dataKey={k} stroke={COLORS[i % COLORS.length]}
              fill={COLORS[i % COLORS.length] + '30'} dot={false} strokeWidth={1.5} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── Percentiles over time (P50/P90/P95/P99) ─────────────────────────────────
function PercentilesOverTimeChart({ data }) {
  if (!data?.length) return null;
  return (
    <ChartCard title="Response Time Percentiles Over Time" fullWidth>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="time" tick={{ fontSize: 10 }} label={{ value: 'Elapsed (s)', position: 'insideBottom', offset: -2, fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} label={{ value: 'ms', angle: -90, position: 'insideLeft', fontSize: 10 }} />
          <Tooltip />
          <Legend iconType="line" wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="p50"  stroke="#22c55e" dot={false} strokeWidth={1.5} name="P50 (Median)" />
          <Line type="monotone" dataKey="p90"  stroke="#3b82f6" dot={false} strokeWidth={1.5} name="P90" />
          <Line type="monotone" dataKey="p95"  stroke="#f59e0b" dot={false} strokeWidth={2}   name="P95" />
          <Line type="monotone" dataKey="p99"  stroke="#ef4444" dot={false} strokeWidth={2}   name="P99" strokeDasharray="4 2" />
          <Line type="monotone" dataKey="max"  stroke="#9ca3af" dot={false} strokeWidth={1}   name="Max" strokeDasharray="2 2" />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── Response time distribution histogram ─────────────────────────────────────
function DistributionChart({ data }) {
  if (!data?.length) return null;
  return (
    <ChartCard title="Response Time Distribution">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 20, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="range" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" interval={2} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Bar dataKey="count" fill="#3b82f6" name="# Requests" radius={[2,2,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── Percentiles per label (bar chart) ────────────────────────────────────────
function PercentilesPerLabelChart({ data }) {
  if (!data?.length) return null;
  const truncated = data.slice(0, 15);
  return (
    <ChartCard title="Response Time Percentiles Per Transaction" fullWidth>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={truncated} layout="vertical" margin={{ top: 4, right: 60, bottom: 4, left: 160 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10 }} label={{ value: 'ms', position: 'insideRight', fontSize: 10 }} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={155} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="p50"  fill="#22c55e" name="P50" />
          <Bar dataKey="p90"  fill="#3b82f6" name="P90" />
          <Bar dataKey="p95"  fill="#f59e0b" name="P95" />
          <Bar dataKey="p99"  fill="#ef4444" name="P99" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ── Top errors table ─────────────────────────────────────────────────────────
function TopErrorsTable({ data }) {
  if (!data?.length) return (
    <ChartCard title="Top Errors">
      <p className="text-sm text-green-600 font-medium">✅ No errors found</p>
    </ChartCard>
  );
  return (
    <ChartCard title="Top Errors" fullWidth>
      <table className="w-full text-xs">
        <thead className="bg-gray-50">
          <tr>{['Type / Label', 'Response Code', 'Count', '% of Total', '% of Errors'].map(h =>
            <th key={h} className="text-left font-medium text-gray-500 uppercase tracking-wide px-3 py-2">{h}</th>
          )}</tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-red-50 transition-colors">
              <td className="px-3 py-2 font-medium text-gray-900 max-w-xs truncate" title={row.label}>{row.label}</td>
              <td className="px-3 py-2">
                <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded font-mono text-xs">{row.responseCode}</span>
              </td>
              <td className="px-3 py-2 font-bold text-red-600">{row.count.toLocaleString()}</td>
              <td className="px-3 py-2">{row.pctOfTotal}%</td>
              <td className="px-3 py-2">{row.pctOfErrors}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ChartCard>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function JMeterDashboard({ projectId, scenarioId, runId }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading'); // loading | not_built | building | ready
  const pollTimer = useRef(null);

  const stopPoll = () => { if (pollTimer.current) { clearTimeout(pollTimer.current); pollTimer.current = null; } };

  const fetchDashboard = async (isPolling = false) => {
    try {
      const { getRunDashboard, analyzeRun } = await import('../api/client');
      const res = await getRunDashboard(projectId, scenarioId, runId);
      if (res.data.status === 'pending') {
        if (isPolling) {
          pollTimer.current = setTimeout(() => fetchDashboard(true), 2500);
        } else {
          setState('not_built');
        }
      } else if (res.data.status === 'ready') {
        setData(res.data);
        setState('ready');
        stopPoll();
      }
    } catch { setState('not_built'); stopPoll(); }
  };

  useEffect(() => {
    fetchDashboard(false);
    return stopPoll;
  }, [runId]);

  const handleBuild = async () => {
    setState('building');
    try {
      const { analyzeRun } = await import('../api/client');
      await analyzeRun(projectId, scenarioId, runId);
      pollTimer.current = setTimeout(() => fetchDashboard(true), 2500);
    } catch { setState('not_built'); }
  };

  if (state === 'loading') return (
    <div className="card flex items-center gap-3 py-8">
      <div className="animate-spin h-5 w-5 border-2 border-brand-600 border-t-transparent rounded-full" />
      <p className="text-sm text-gray-500">Loading dashboard data...</p>
    </div>
  );

  if (state === 'not_built') return (
    <div className="card text-center py-12">
      <div className="text-4xl mb-3">📊</div>
      <h3 className="text-base font-semibold text-gray-900 mb-2">Dashboard not built yet</h3>
      <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
        Click below to build the full JMeter-style dashboard with APDEX, statistics table, 
        response time charts, percentile breakdowns, and more.
      </p>
      <button onClick={handleBuild} className="btn-primary inline-flex items-center gap-2">
        <Play size={15} /> Build Dashboard
      </button>
    </div>
  );

  if (state === 'building') return (
    <div className="card text-center py-12">
      <div className="animate-spin h-10 w-10 border-brand-600 border-t-transparent rounded-full mx-auto mb-4"
        style={{ borderWidth: 3, borderStyle: 'solid' }} />
      <h3 className="text-base font-semibold text-gray-900 mb-2">Building JMeter-style dashboard...</h3>
      <p className="text-sm text-gray-500">Processing APDEX, statistics, response times, percentiles. Takes a few seconds.</p>
    </div>
  );

  // Get unique labels for response times over time
  const rtLabels = data.responseTimesOverTime?.length
    ? Object.keys(data.responseTimesOverTime[0]).filter(k => k !== 'time')
    : [];

  const codeKeys = data.codesPerSecond?.length
    ? Object.keys(data.codesPerSecond[0]).filter(k => k !== 'time')
    : [];

  return (
    <div className="space-y-6">
      {/* Row 1: APDEX */}
      {data.apdex?.length > 0 && <ApdexTable data={data.apdex} />}

      {/* Row 2: Statistics */}
      {data.statistics?.length > 0 && <StatisticsTable data={data.statistics} />}

      {/* Row 3: Summary + Hits per second */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {data.requestSummary && <RequestSummaryPie data={data.requestSummary} />}
        <TimeAreaChart
          title="Hits Per Second"
          data={data.hitsPerSecond}
          areas={['hits', 'errors']}
          yLabel="req/s"
        />
      </div>

      {/* Row 4: Response Times Over Time */}
      <TimeLineChart
        title="Response Times Over Time (ms)"
        data={data.responseTimesOverTime}
        lines={rtLabels.slice(0, 8)}
        yLabel="ms"
        fullWidth
      />

      {/* Row 5: Percentiles over time */}
      <PercentilesOverTimeChart data={data.percentilesOverTime} />

      {/* Row 6: Active Threads + Bytes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TimeAreaChart
          title="Active Threads Over Time"
          data={data.activeThreadsOverTime}
          areas={['threads']}
          yLabel="users"
        />
        <TimeAreaChart
          title="Network Throughput Over Time (KB/s)"
          data={data.bytesOverTime}
          areas={['receivedKbps', 'sentKbps']}
          yLabel="KB/s"
        />
      </div>

      {/* Row 7: Latency + Response code distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {data.latencyOverTime?.length > 0 && (
          <TimeLineChart
            title="Latency Over Time (TTFB ms)"
            data={data.latencyOverTime}
            lines={['avgLatency']}
            yLabel="ms"
          />
        )}
        <TimeLineChart
          title="HTTP Response Codes Per Second"
          data={data.codesPerSecond}
          lines={codeKeys.slice(0, 6)}
          yLabel="req/s"
        />
      </div>

      {/* Row 8: Distribution + Percentiles per label */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <DistributionChart data={data.responseTimeDistribution} />
      </div>
      <PercentilesPerLabelChart data={data.percentilesPerLabel} />

      {/* Row 9: Top Errors */}
      <TopErrorsTable data={data.topErrors} />

      <p className="text-xs text-gray-400 text-right">Dashboard built: {data.builtAt ? formatDateTime(data.builtAt) : ''}</p>
    </div>
  );
}
