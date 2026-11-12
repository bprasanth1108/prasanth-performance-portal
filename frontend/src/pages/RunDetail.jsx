import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Pencil, Save, X } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { getProject, getScenario, getRun, getRunChartData, updateRun } from '../api/client';
import useAuthStore from '../store/authStore';
import StatCard from '../components/StatCard';
import JMeterDashboard from '../components/JMeterDashboard';
import LabelDetail from '../components/LabelDetail';

export default function RunDetail() {
  const { projectId, scenarioId, runId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [project, setProject]   = useState(null);
  const [scenario, setScenario] = useState(null);
  const [run, setRun]           = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [editing, setEditing]   = useState(false);
  const [editForm, setEditForm] = useState({ note: '', environment: '', test_name: '' });
  const [saving, setSaving]     = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    (async () => {
      try {
        const [proj, scen, r, cd] = await Promise.all([
          getProject(projectId),
          getScenario(projectId, scenarioId),
          getRun(projectId, scenarioId, runId),
          getRunChartData(projectId, scenarioId, runId),
        ]);
        setProject(proj.data);
        setScenario(scen.data);
        setRun(r.data);
        setEditForm({ note: r.data.note || '', environment: r.data.environment || '', test_name: r.data.test_name || '' });
        const minTs = cd.data[0]?.bucket || 0;
        setChartData(cd.data.map(d => ({
          ...d,
          time: `${Math.round((d.bucket - minTs) / 1000)}s`,
        })));
      } catch {
        navigate(`/projects/${projectId}/scenarios/${scenarioId}`);
      } finally {
        setLoading(false);
      }
    })();
  }, [runId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await updateRun(projectId, scenarioId, runId, editForm);
      setRun({ ...run, ...res.data });
      setEditing(false);
    } catch { } finally { setSaving(false); }
  };

  // Per-label data from run_stats
  const perLabel = run?.per_label
    ? (typeof run.per_label === 'string' ? JSON.parse(run.per_label) : run.per_label)
    : {};

  // Sort labels by error rate desc, then by count desc
  const sortedLabels = Object.entries(perLabel).sort(([, a], [, b]) => {
    const aDiff = parseFloat(a.errorRate || 0) - parseFloat(b.errorRate || 0);
    if (aDiff !== 0) return -aDiff;
    return (b.count || 0) - (a.count || 0);
  });

  if (loading) return <div className="p-8 text-gray-500">Loading run data...</div>;

  const tabs = [
    { id: 'overview',   label: 'Overview' },
    { id: 'dashboard',  label: '📊 JMeter Dashboard' },
    { id: 'requests',   label: `🔍 Requests (${sortedLabels.length})` },
  ];

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4 flex-wrap">
        <Link to="/" className="hover:text-brand-600 flex items-center gap-1">
          <ArrowLeft size={14}/> Projects
        </Link>
        <ChevronRight size={14}/>
        <Link to={`/projects/${projectId}`} className="hover:text-brand-600">{project?.name}</Link>
        <ChevronRight size={14}/>
        <Link to={`/projects/${projectId}/scenarios/${scenarioId}`} className="hover:text-brand-600">{scenario?.name}</Link>
        <ChevronRight size={14}/>
        <span className="text-gray-900 font-medium">{run?.test_name || 'Run Detail'}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            {run?.test_name
              ? <h1 className="text-2xl font-bold text-brand-700 bg-brand-50 px-3 py-1 rounded-lg border border-brand-200">{run.test_name}</h1>
              : <h1 className="text-2xl font-bold text-gray-400 italic">Unnamed Run</h1>
            }
            <span className={`badge-${run?.status}`}>{run?.status}</span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {run?.start_time ? (
              <>
                <span className="text-sm text-gray-500">
                  🕐 Started: <span className="font-medium text-gray-700">{new Date(run.start_time).toLocaleString()}</span>
                </span>
                {run?.duration != null && (
                  <>
                    <span className="text-gray-300">·</span>
                    <span className="text-sm text-gray-500">
                      🏁 Ended: <span className="font-medium text-gray-700">
                        {new Date(new Date(run.start_time).getTime() + run.duration * 1000).toLocaleString()}
                      </span>
                    </span>
                    <span className="text-gray-300">·</span>
                    <span className="text-sm text-gray-500">
                      ⏱ Duration: <span className="font-medium text-gray-700">
                        {run.duration >= 3600
                          ? `${Math.floor(run.duration / 3600)}h ${Math.floor((run.duration % 3600) / 60)}m ${run.duration % 60}s`
                          : run.duration >= 60
                          ? `${Math.floor(run.duration / 60)}m ${run.duration % 60}s`
                          : `${run.duration}s`}
                      </span>
                    </span>
                  </>
                )}
              </>
            ) : (
              <span className="text-sm text-gray-400">📅 Uploaded: {new Date(run?.uploaded_at).toLocaleString()}</span>
            )}
            {run?.environment && <><span className="text-gray-300">·</span><span className="text-sm font-medium text-gray-700">{run.environment}</span></>}
            {run?.note        && <><span className="text-gray-300">·</span><span className="text-sm text-gray-400">{run.note}</span></>}
            {!editing && isAdmin && (
              <button onClick={() => setEditing(true)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors ml-1">
                <Pencil size={13} className="text-gray-400"/>
              </button>
            )}
          </div>
          {editing && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <input className="input w-44" placeholder="Test name"    value={editForm.test_name}    onChange={e => setEditForm({...editForm, test_name: e.target.value})}/>
              <input className="input w-36" placeholder="Environment"  value={editForm.environment}  onChange={e => setEditForm({...editForm, environment: e.target.value})}/>
              <input className="input w-52" placeholder="Note"         value={editForm.note}          onChange={e => setEditForm({...editForm, note: e.target.value})}/>
              <button onClick={handleSave} disabled={saving} className="p-1.5 bg-green-50 hover:bg-green-100 text-green-600 rounded-lg transition-colors"><Save size={16}/></button>
              <button onClick={() => setEditing(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"><X size={16}/></button>
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
        <StatCard label="Total Requests" value={run?.total_requests?.toLocaleString()} color="blue"/>
        <StatCard label="Error Rate"
          value={run?.error_rate != null ? `${parseFloat(run.error_rate).toFixed(2)}%` : '—'}
          color={parseFloat(run?.error_rate) > 1 ? 'red' : 'green'}/>
        <StatCard label="Avg Response"
          value={run?.avg_response_time != null ? parseFloat(run.avg_response_time).toFixed(0) : '—'}
          unit="ms" color="blue"/>
        <StatCard label="P90"
          value={run?.p90_response_time != null ? parseFloat(run.p90_response_time).toFixed(0) : '—'}
          unit="ms" color="orange"/>
        <StatCard label="P95"
          value={run?.p95_response_time != null ? parseFloat(run.p95_response_time).toFixed(0) : '—'}
          unit="ms" color="orange"/>
        <StatCard label="Throughput"
          value={run?.throughput != null ? parseFloat(run.throughput).toFixed(2) : '—'}
          unit="req/s" color="purple"/>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px
              ${activeTab === t.id ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="card">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Response Time Over Time</h3>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                  <XAxis dataKey="time" tick={{fontSize:11}}/>
                  <YAxis tick={{fontSize:11}}/>
                  <Tooltip formatter={(v) => [`${v} ms`, 'Avg Response']}/>
                  <Line type="monotone" dataKey="avg_elapsed" stroke="#3b82f6" dot={false} strokeWidth={2} name="Avg Response (ms)"/>
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-gray-400 text-sm text-center py-8">No chart data available</p>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Requests Per Interval</h3>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                    <XAxis dataKey="time" tick={{fontSize:10}}/>
                    <YAxis tick={{fontSize:10}}/>
                    <Tooltip/>
                    <Bar dataKey="req_count" fill="#3b82f6" name="Requests" radius={[2,2,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-gray-400 text-sm text-center py-8">No data</p>}
            </div>
            <div className="card">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Errors Per Interval</h3>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
                    <XAxis dataKey="time" tick={{fontSize:10}}/>
                    <YAxis tick={{fontSize:10}}/>
                    <Tooltip/>
                    <Bar dataKey="error_count" fill="#ef4444" name="Errors" radius={[2,2,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-gray-400 text-sm text-center py-8">No data</p>}
            </div>
          </div>
        </div>
      )}

      {/* JMeter Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <JMeterDashboard projectId={projectId} scenarioId={scenarioId} runId={runId}/>
      )}

      {/* Requests Tab — expandable per-label detail */}
      {activeTab === 'requests' && (
        <div className="space-y-2">
          {sortedLabels.length === 0 ? (
            <div className="card text-center py-10 text-gray-400 text-sm">No request data available.</div>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-3">
                Click any request to expand full details — charts, percentiles, error breakdown, raw samples and more.
                Sorted by error rate (highest first).
              </p>
              {sortedLabels.map(([label, s]) => (
                <LabelDetail
                  key={label}
                  label={label}
                  stats={s}
                  projectId={projectId}
                  scenarioId={scenarioId}
                  runId={runId}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
