import React, { useState, useCallback } from 'react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine
} from 'recharts';
import { ChevronDown, ChevronUp, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { getLabelDetail } from '../api/client';

// ── Helpers ──────────────────────────────────────────────────────────────────
const C = { blue:'#3b82f6', green:'#22c55e', red:'#ef4444', orange:'#f97316', purple:'#8b5cf6', yellow:'#f59e0b', gray:'#9ca3af' };

function ms(v) { if (v == null) return '—'; if (v >= 1000) return `${(v/1000).toFixed(2)}s`; return `${v}ms`; }
function kb(v) { if (v == null) return '—'; if (v >= 1024*1024) return `${(v/1024/1024).toFixed(2)} MB`; if (v >= 1024) return `${(v/1024).toFixed(1)} KB`; return `${v} B`; }
function pctColor(p) { return p > 5 ? 'text-red-600 font-bold' : p > 1 ? 'text-orange-500 font-medium' : 'text-green-600'; }

function MiniStat({ label, value, color }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 text-center">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={`text-base font-bold ${color || 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function SectionHead({ children }) {
  return <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 mt-4 flex items-center gap-2">
    <span className="flex-1 h-px bg-gray-100" />{children}<span className="flex-1 h-px bg-gray-100" />
  </p>;
}

// ── Chart: Response Time Lines ────────────────────────────────────────────────
function RtChart({ data }) {
  if (!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{top:4,right:8,bottom:0,left:0}}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="time" tick={{fontSize:10}} label={{value:'s',position:'insideRight',fontSize:9}} />
        <YAxis tick={{fontSize:10}} tickFormatter={v=>`${v}ms`} />
        <Tooltip formatter={(v,n)=>[`${v}ms`,n]} />
        <Legend iconType="line" wrapperStyle={{fontSize:11}} />
        <Line type="monotone" dataKey="avgElapsed" stroke={C.blue}   dot={false} strokeWidth={2}   name="Avg" />
        <Line type="monotone" dataKey="p90"        stroke={C.orange} dot={false} strokeWidth={1.5} name="P90" />
        <Line type="monotone" dataKey="p95"        stroke={C.red}    dot={false} strokeWidth={2}   name="P95" strokeDasharray="4 2"/>
        <Line type="monotone" dataKey="p99"        stroke={C.purple} dot={false} strokeWidth={1.5} name="P99" strokeDasharray="2 2"/>
        <Line type="monotone" dataKey="maxElapsed" stroke={C.gray}   dot={false} strokeWidth={1}   name="Max" strokeDasharray="1 3"/>
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Chart: Hits + Error Rate ──────────────────────────────────────────────────
function HitsChart({ data }) {
  if (!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{top:4,right:8,bottom:0,left:0}}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="time" tick={{fontSize:10}} />
        <YAxis yAxisId="left" tick={{fontSize:10}} />
        <YAxis yAxisId="right" orientation="right" tick={{fontSize:10}} tickFormatter={v=>`${v}%`} />
        <Tooltip />
        <Legend wrapperStyle={{fontSize:11}} />
        <Bar yAxisId="left" dataKey="hits"   fill={C.blue}  name="Hits"       radius={[2,2,0,0]} />
        <Bar yAxisId="left" dataKey="errors" fill={C.red}   name="Errors"     radius={[2,2,0,0]} />
        <Line yAxisId="right" type="monotone" dataKey="errorRate" stroke={C.orange} dot={false} name="Error %" strokeWidth={2} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Chart: Active Threads ─────────────────────────────────────────────────────
function ThreadsChart({ data }) {
  if (!data?.length || data.every(d => !d.threads)) return null;
  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{top:4,right:8,bottom:0,left:0}}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="time" tick={{fontSize:10}} />
        <YAxis tick={{fontSize:10}} />
        <Tooltip />
        <Area type="monotone" dataKey="threads" stroke={C.purple} fill={C.purple+'30'} name="Threads" strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Chart: Latency vs Elapsed ─────────────────────────────────────────────────
function LatencyChart({ data }) {
  if (!data?.length || data.every(d => !d.avgLatency)) return null;
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data} margin={{top:4,right:8,bottom:0,left:0}}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="time" tick={{fontSize:10}} />
        <YAxis tick={{fontSize:10}} tickFormatter={v=>`${v}ms`} />
        <Tooltip formatter={(v,n)=>[`${v}ms`,n]} />
        <Legend iconType="line" wrapperStyle={{fontSize:11}} />
        <Line type="monotone" dataKey="avgElapsed"  stroke={C.blue}  dot={false} strokeWidth={2} name="Elapsed (total)" />
        <Line type="monotone" dataKey="avgLatency"  stroke={C.green} dot={false} strokeWidth={2} name="Latency (TTFB)" />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Chart: Bytes over time ────────────────────────────────────────────────────
function BytesChart({ data }) {
  if (!data?.length || data.every(d => !d.bytesKb)) return null;
  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{top:4,right:8,bottom:0,left:0}}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="time" tick={{fontSize:10}} />
        <YAxis tick={{fontSize:10}} tickFormatter={v=>`${v}KB`} />
        <Tooltip formatter={(v)=>[`${v} KB`,'Received']} />
        <Area type="monotone" dataKey="bytesKb" stroke={C.blue} fill={C.blue+'25'} name="KB received" strokeWidth={2} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Chart: Response Time Distribution ────────────────────────────────────────
function DistChart({ data, avg, p95 }) {
  if (!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{top:4,right:8,bottom:16,left:0}}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="range" tick={{fontSize:9}} angle={-25} textAnchor="end" interval={2} />
        <YAxis tick={{fontSize:10}} />
        <Tooltip formatter={(v,n,p)=>[`${v} requests (${p.payload.pct}%)`, 'Count']} />
        {avg   && <ReferenceLine x={data.find(d=>d.ms<=avg && avg<d.ms+50)?.range}  stroke={C.blue}   strokeDasharray="4 2" label={{value:'Avg',fontSize:9,fill:C.blue}}/>}
        {p95   && <ReferenceLine x={data.find(d=>d.ms<=p95 && p95<d.ms+50)?.range}  stroke={C.red}    strokeDasharray="4 2" label={{value:'P95',fontSize:9,fill:C.red}}/>}
        <Bar dataKey="count" name="Requests" radius={[3,3,0,0]}
          fill={C.blue}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Main expandable row ───────────────────────────────────────────────────────
export default function LabelDetail({ label, stats: initialStats, projectId, scenarioId, runId }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [innerTab, setInnerTab] = useState('charts');

  const toggle = useCallback(async () => {
    if (!open && !data) {
      setLoading(true);
      try {
        const res = await getLabelDetail(projectId, scenarioId, runId, label);
        setData(res.data);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    setOpen(o => !o);
  }, [open, data, label]);

  const s = data?.stats || initialStats;
  const errorPct = s ? parseFloat(s.errorRate ?? s.errorPct ?? 0) : 0;

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${open ? 'shadow-md border-brand-200' : 'border-gray-200 hover:border-gray-300'}`}>
      {/* ── Summary row (always visible) ─────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer bg-white hover:bg-gray-50 transition-colors"
        onClick={toggle}>
        <button className={`flex-shrink-0 p-1 rounded-lg transition-colors ${open ? 'bg-brand-100 text-brand-600' : 'bg-gray-100 text-gray-500'}`}>
          {open ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
        </button>

        {/* Label name */}
        <div className="flex-1 min-w-0">
          <p className="font-mono text-sm font-semibold text-gray-900 truncate" title={label}>{label}</p>
        </div>

        {/* Key metrics strip */}
        {s && (
          <div className="hidden md:flex items-center gap-6 text-xs text-gray-600 flex-shrink-0">
            <span><span className="font-semibold text-gray-900">{(s.count||s.samples||0).toLocaleString()}</span> req</span>
            <span className={pctColor(errorPct)}>{errorPct}% err</span>
            <span>avg <span className="font-semibold text-gray-900">{ms(s.avg||s.mean)}</span></span>
            <span>P95 <span className="font-semibold text-orange-600">{ms(s.p95)}</span></span>
            <span>P99 <span className="font-semibold text-red-600">{ms(s.p99)}</span></span>
            <span className="text-brand-600 font-semibold">{s.throughput}/s</span>
          </div>
        )}

        {/* Pass/fail indicator */}
        {s && (
          errorPct > 1
            ? <XCircle size={16} className="text-red-500 flex-shrink-0"/>
            : <CheckCircle size={16} className="text-green-500 flex-shrink-0"/>
        )}
      </div>

      {/* ── Expanded detail ───────────────────────────────────────── */}
      {open && (
        <div className="border-t border-gray-100 bg-white px-4 pb-6 pt-4">
          {loading ? (
            <div className="flex items-center gap-3 py-8 justify-center">
              <div className="animate-spin h-5 w-5 border-2 border-brand-600 border-t-transparent rounded-full"/>
              <p className="text-sm text-gray-500">Loading full request data...</p>
            </div>
          ) : data ? (
            <>
              {/* ── Complete stats grid ─────────────────────── */}
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-4">
                <MiniStat label="Requests"    value={(s.count).toLocaleString()} />
                <MiniStat label="Errors"      value={s.errors}             color={s.errors > 0 ? 'text-red-600' : 'text-green-600'} />
                <MiniStat label="Error Rate"  value={`${s.errorRate}%`}    color={pctColor(s.errorRate)} />
                <MiniStat label="Throughput"  value={`${s.throughput}/s`}  color="text-brand-600" />
                <MiniStat label="Avg"         value={ms(s.avg)}            color="text-blue-600" />
                <MiniStat label="Median"      value={ms(s.median)}         />
                <MiniStat label="P75"         value={ms(s.p75)}            />
                <MiniStat label="P90"         value={ms(s.p90)}            color="text-orange-500" />
                <MiniStat label="P95"         value={ms(s.p95)}            color="text-orange-600" />
                <MiniStat label="P99"         value={ms(s.p99)}            color="text-red-500" />
                <MiniStat label="P99.9"       value={ms(s.p999)}           color="text-red-600" />
                <MiniStat label="Min"         value={ms(s.min)}            color="text-green-600" />
                <MiniStat label="Max"         value={ms(s.max)}            color="text-red-600" />
                <MiniStat label="Range"       value={ms(s.range)}          />
                <MiniStat label="Std Dev"     value={ms(s.stdDev)}         />
                <MiniStat label="CV%"         value={`${s.coefficientOfVariation}%`} color={s.coefficientOfVariation > 50 ? 'text-orange-600' : ''} />
                <MiniStat label="Avg Latency" value={ms(s.avgLatency)}     />
                <MiniStat label="P95 Latency" value={ms(s.p95Latency)}     />
                <MiniStat label="Server Time" value={ms(s.processingTime)} />
                <MiniStat label="Avg Bytes"   value={kb(s.avgBytes)}       />
                <MiniStat label="Total RX"    value={kb(s.totalBytes)}     />
                <MiniStat label="Total TX"    value={kb(s.totalSentBytes)} />
                <MiniStat label="KB/s RX"     value={`${s.kbPerSec} KB/s`} />
                <MiniStat label="Max Err Streak" value={s.maxConsecutiveErrors} color={s.maxConsecutiveErrors > 10 ? 'text-red-600' : ''} />
              </div>

              {/* ── Inner tabs ─────────────────────────────── */}
              <div className="flex gap-1 border-b border-gray-200 mb-4">
                {['charts','errors','samples'].map(t => (
                  <button key={t} onClick={() => setInnerTab(t)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px capitalize
                      ${innerTab===t ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    {t}
                  </button>
                ))}
              </div>

              {/* ── Charts tab ────────────────────────────── */}
              {innerTab === 'charts' && (
                <div className="space-y-6">
                  <div>
                    <SectionHead>Response Time Over Time</SectionHead>
                    <RtChart data={data.timeSeries} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <SectionHead>Hits &amp; Error Rate</SectionHead>
                      <HitsChart data={data.timeSeries} />
                    </div>
                    <div>
                      <SectionHead>Active Threads</SectionHead>
                      <ThreadsChart data={data.timeSeries} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <SectionHead>Latency vs Elapsed (TTFB)</SectionHead>
                      <LatencyChart data={data.timeSeries} />
                    </div>
                    <div>
                      <SectionHead>Bytes Received Over Time</SectionHead>
                      <BytesChart data={data.timeSeries} />
                    </div>
                  </div>
                  <div>
                    <SectionHead>Response Time Distribution</SectionHead>
                    <DistChart data={data.distribution} avg={s.avg} p95={s.p95} />
                  </div>

                  {/* Fastest / Slowest */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <SectionHead>10 Fastest Requests</SectionHead>
                      <table className="w-full text-xs">
                        <thead><tr className="bg-gray-50">{['Time','Elapsed','Code'].map(h=><th key={h} className="text-left px-3 py-2 text-gray-500 font-medium">{h}</th>)}</tr></thead>
                        <tbody>{s.fastest10?.map((r,i)=>(
                          <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="px-3 py-1.5 text-gray-500">{r.time}</td>
                            <td className="px-3 py-1.5 text-green-600 font-semibold">{ms(r.elapsed)}</td>
                            <td className="px-3 py-1.5"><span className="font-mono bg-gray-100 px-1 rounded">{r.response_code}</span></td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                    <div>
                      <SectionHead>10 Slowest Requests</SectionHead>
                      <table className="w-full text-xs">
                        <thead><tr className="bg-gray-50">{['Time','Elapsed','Code'].map(h=><th key={h} className="text-left px-3 py-2 text-gray-500 font-medium">{h}</th>)}</tr></thead>
                        <tbody>{s.slowest10?.map((r,i)=>(
                          <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                            <td className="px-3 py-1.5 text-gray-500">{r.time}</td>
                            <td className="px-3 py-1.5 text-red-600 font-semibold">{ms(r.elapsed)}</td>
                            <td className="px-3 py-1.5"><span className="font-mono bg-gray-100 px-1 rounded">{r.response_code}</span></td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Errors tab ────────────────────────────── */}
              {innerTab === 'errors' && (
                <div className="space-y-5">
                  {s.errors === 0 ? (
                    <div className="text-center py-10">
                      <CheckCircle size={36} className="text-green-400 mx-auto mb-2" />
                      <p className="text-sm text-green-600 font-medium">No errors for this request</p>
                    </div>
                  ) : (
                    <>
                      <SectionHead>HTTP Response Codes</SectionHead>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead><tr className="bg-gray-50">{['Code','Count','Errors','% of Total'].map(h=><th key={h} className="text-left px-3 py-2 text-gray-500 font-medium uppercase tracking-wide">{h}</th>)}</tr></thead>
                          <tbody className="divide-y divide-gray-100">
                            {data.errorCodes?.map((r,i)=>(
                              <tr key={i} className="hover:bg-gray-50">
                                <td className="px-3 py-2"><span className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${r.errors>0?'bg-red-100 text-red-700':'bg-green-100 text-green-700'}`}>{r.code}</span></td>
                                <td className="px-3 py-2 font-medium">{r.count.toLocaleString()}</td>
                                <td className="px-3 py-2 text-red-600">{r.errors}</td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 bg-gray-200 rounded-full h-1.5 max-w-[80px]">
                                      <div className="bg-brand-500 h-1.5 rounded-full" style={{width:`${r.pctOfTotal}%`}}/>
                                    </div>
                                    <span>{r.pctOfTotal}%</span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {data.errorMessages?.length > 0 && (
                        <>
                          <SectionHead>Error Breakdown</SectionHead>
                          <div className="space-y-2">
                            {data.errorMessages.map((m,i)=>(
                              <div key={i} className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                                <AlertTriangle size={14} className="text-red-500 flex-shrink-0"/>
                                <span className="flex-1 text-xs text-red-800 font-mono truncate" title={m.message}>{m.message}</span>
                                <span className="text-xs font-bold text-red-600 flex-shrink-0">{m.count}×</span>
                                <span className="text-xs text-red-400 flex-shrink-0">{m.pct}%</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {data.hostnames?.length > 1 && (
                        <>
                          <SectionHead>Load Generator Hosts</SectionHead>
                          <div className="flex flex-wrap gap-2">
                            {data.hostnames.map((h,i)=>(
                              <span key={i} className="text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full font-mono">
                                {h.host} <span className="text-gray-400">({h.count} · {h.pct}%)</span>
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* ── Raw samples tab ───────────────────────── */}
              {innerTab === 'samples' && (
                <div>
                  <p className="text-xs text-gray-400 mb-3">
                    Showing up to 150 error samples + 50 recent successes (sorted by time)
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[700px]">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>{['Time','Elapsed','Status','Code','Latency','Bytes','Threads','Host'].map(h=>(
                          <th key={h} className="text-left px-3 py-2 text-gray-500 font-medium uppercase tracking-wide">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {data.rawSamples?.map((r,i)=>(
                          <tr key={i} className={`hover:bg-gray-50 ${!r.success?'bg-red-50/40':''}`}>
                            <td className="px-3 py-1.5 text-gray-500 font-mono">{r.time}</td>
                            <td className={`px-3 py-1.5 font-semibold ${r.elapsed>s.p95?'text-red-600':r.elapsed>s.p90?'text-orange-500':'text-gray-900'}`}>{ms(r.elapsed)}</td>
                            <td className="px-3 py-1.5">{r.success ? <span className="text-green-600 font-medium">✓</span> : <span className="text-red-600 font-bold">✗</span>}</td>
                            <td className="px-3 py-1.5"><span className={`font-mono px-1.5 py-0.5 rounded text-xs ${r.responseCode?.startsWith('2')?'bg-green-100 text-green-700':r.responseCode?.startsWith('5')||r.responseCode==='0'?'bg-red-100 text-red-700':'bg-yellow-100 text-yellow-700'}`}>{r.responseCode||'—'}</span></td>
                            <td className="px-3 py-1.5 text-gray-600">{r.latency?ms(r.latency):'—'}</td>
                            <td className="px-3 py-1.5 text-gray-600">{r.bytes?kb(r.bytes):'—'}</td>
                            <td className="px-3 py-1.5 text-gray-500">{r.threads||'—'}</td>
                            <td className="px-3 py-1.5 text-gray-400 font-mono truncate max-w-[120px]" title={r.hostname}>{r.hostname||'—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
