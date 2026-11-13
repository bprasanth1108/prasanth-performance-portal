import React, { useEffect, useState, useRef } from 'react';
import {
  AlertTriangle, AlertCircle, Info, CheckCircle,
  Lightbulb, ChevronDown, ChevronUp, Play, RefreshCw
} from 'lucide-react';
import { getRunInsights, analyzeRun } from '../api/client';
import { formatDateTime } from '../utils/datetime';

const SEV_CONFIG = {
  critical: {
    icon: <AlertCircle size={16} />,
    bg: 'bg-red-50 border-red-200',
    badge: 'bg-red-100 text-red-800',
    iconColor: 'text-red-500',
    label: 'Critical',
  },
  warning: {
    icon: <AlertTriangle size={16} />,
    bg: 'bg-yellow-50 border-yellow-200',
    badge: 'bg-yellow-100 text-yellow-800',
    iconColor: 'text-yellow-500',
    label: 'Warning',
  },
  info: {
    icon: <Info size={16} />,
    bg: 'bg-blue-50 border-blue-200',
    badge: 'bg-blue-100 text-blue-800',
    iconColor: 'text-blue-500',
    label: 'Info',
  },
  ok: {
    icon: <CheckCircle size={16} />,
    bg: 'bg-green-50 border-green-200',
    badge: 'bg-green-100 text-green-800',
    iconColor: 'text-green-500',
    label: 'OK',
  },
};

function HealthGauge({ score, grade, label }) {
  const color = score >= 90 ? '#22c55e' : score >= 75 ? '#3b82f6' : score >= 60 ? '#f59e0b' : score >= 40 ? '#f97316' : '#ef4444';
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="flex items-center gap-6">
      <div className="relative w-24 h-24 flex-shrink-0">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="10" />
          <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold" style={{ color }}>{grade}</span>
          <span className="text-xs text-gray-500">{score}/100</span>
        </div>
      </div>
      <div>
        <p className="text-lg font-semibold text-gray-900">{label}</p>
        <p className="text-sm text-gray-500">Overall health score</p>
      </div>
    </div>
  );
}

function FindingCard({ finding }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = SEV_CONFIG[finding.severity] || SEV_CONFIG.info;
  return (
    <div className={`border rounded-xl p-4 ${cfg.bg}`}>
      <div className="flex items-start gap-3 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <span className={`mt-0.5 flex-shrink-0 ${cfg.iconColor}`}>{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.badge}`}>{cfg.label}</span>
            <p className="text-sm font-semibold text-gray-900">{finding.title}</p>
          </div>
          {!expanded && <p className="text-xs text-gray-600 mt-1 line-clamp-1">{finding.detail}</p>}
        </div>
        <button className="flex-shrink-0 text-gray-400 hover:text-gray-600 ml-2">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {expanded && (
        <div className="mt-3 ml-7 space-y-3">
          <div>
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">What happened</p>
            <p className="text-sm text-gray-700">{finding.detail}</p>
          </div>
          <div className="bg-white/70 rounded-lg p-3">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">Root cause analysis</p>
            <p className="text-sm text-gray-700">{finding.cause}</p>
          </div>
          <div className="flex gap-2 items-start">
            <Lightbulb size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">Recommendation</p>
              <p className="text-sm text-gray-700">{finding.suggestion}</p>
            </div>
          </div>
          {finding.data && !Array.isArray(finding.data) && Object.keys(finding.data).length > 0 && (
            <div className="bg-gray-900 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Supporting data</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                {Object.entries(finding.data).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-xs text-gray-400">{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>
                    <span className="text-xs text-green-400 font-mono">{typeof v === 'number' ? v.toLocaleString() : String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {finding.data && Array.isArray(finding.data) && finding.data.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Timeline data</p>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {finding.data.slice(0, 10).map((row, i) => (
                  <div key={i} className="flex gap-4 text-xs font-mono">
                    {Object.entries(row).map(([k, v]) => (
                      <span key={k} className="text-gray-300">
                        <span className="text-gray-500">{k}: </span>
                        <span className="text-green-400">{typeof v === 'number' ? v.toLocaleString() : v}</span>
                      </span>
                    ))}
                  </div>
                ))}
                {finding.data.length > 10 && <p className="text-xs text-gray-500">...and {finding.data.length - 10} more</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function InsightsPanel({ projectId, scenarioId, runId }) {
  const [state, setState] = useState('loading'); // loading | not_analyzed | analyzing | ready | error
  const [insights, setInsights] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const pollTimer = useRef(null);

  const stopPoll = () => { if (pollTimer.current) { clearTimeout(pollTimer.current); pollTimer.current = null; } };

  const fetchInsights = async (isPolling = false) => {
    try {
      const res = await getRunInsights(projectId, scenarioId, runId);
      const data = res.data;
      if (data.status === 'ready') {
        setInsights(data);
        setState('ready');
        stopPoll();
      } else if (data.status === 'not_analyzed') {
        setState('not_analyzed');
        stopPoll();
      } else if (data.status === 'pending' && isPolling) {
        // Still processing — keep polling
        pollTimer.current = setTimeout(() => fetchInsights(true), 2000);
      } else {
        setState('not_analyzed');
      }
    } catch (err) {
      setState('error');
      setErrorMsg('Failed to load analysis.');
      stopPoll();
    }
  };

  useEffect(() => {
    fetchInsights(false);
    return stopPoll;
  }, [runId]);

  const handleRunAnalysis = async () => {
    setState('analyzing');
    setErrorMsg('');
    try {
      await analyzeRun(projectId, scenarioId, runId);
      // Start polling for completion
      pollTimer.current = setTimeout(() => fetchInsights(true), 2000);
    } catch (err) {
      setState('error');
      setErrorMsg(err.response?.data?.error || 'Failed to start analysis.');
    }
  };

  const handleRerun = () => {
    setState('analyzing');
    handleRunAnalysis();
  };

  // ── States ────────────────────────────────────────────────────────────────

  if (state === 'loading') return (
    <div className="card flex items-center gap-3 py-8">
      <div className="animate-spin h-5 w-5 border-2 border-brand-600 border-t-transparent rounded-full" />
      <p className="text-sm text-gray-500">Loading analysis...</p>
    </div>
  );

  if (state === 'not_analyzed') return (
    <div className="card text-center py-12">
      <div className="w-16 h-16 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-4">
        <Play size={28} className="text-brand-600" />
      </div>
      <h3 className="text-base font-semibold text-gray-900 mb-2">No analysis yet</h3>
      <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
        Click below to run AI analysis on this test run. It will detect anomalies, error patterns,
        latency degradation, and provide root cause suggestions.
      </p>
      <button onClick={handleRunAnalysis} className="btn-primary inline-flex items-center gap-2">
        <Play size={15} /> Run AI Analysis
      </button>
    </div>
  );

  if (state === 'analyzing') return (
    <div className="card text-center py-12">
      <div className="animate-spin h-10 w-10 border-3 border-brand-600 border-t-transparent rounded-full mx-auto mb-4"
        style={{ borderWidth: 3 }} />
      <h3 className="text-base font-semibold text-gray-900 mb-2">Analyzing your test run...</h3>
      <p className="text-sm text-gray-500">
        Processing {' '}<span className="font-medium text-brand-600">samples, latency patterns, error codes</span>
        {' '}and concurrency data. This takes a few seconds.
      </p>
      <div className="flex justify-center gap-2 mt-4">
        {['Detecting error spikes', 'Analyzing latency', 'Checking concurrency', 'Building insights'].map((step, i) => (
          <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full animate-pulse"
            style={{ animationDelay: `${i * 0.3}s` }}>
            {step}
          </span>
        ))}
      </div>
    </div>
  );

  if (state === 'error') return (
    <div className="card text-center py-10">
      <AlertCircle size={36} className="text-red-400 mx-auto mb-3" />
      <p className="text-sm font-medium text-gray-900 mb-1">Analysis failed</p>
      <p className="text-xs text-gray-500 mb-4">{errorMsg}</p>
      <button onClick={handleRerun} className="btn-secondary inline-flex items-center gap-2 text-sm">
        <RefreshCw size={14} /> Try Again
      </button>
    </div>
  );

  if (!insights) return null;

  const criticals = insights.findings?.filter(f => f.severity === 'critical').length || 0;
  const warnings  = insights.findings?.filter(f => f.severity === 'warning').length || 0;

  return (
    <div className="space-y-5">
      {/* Health score + summary */}
      <div className="card">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <HealthGauge {...insights.healthScore} />
          <div className="flex-1">
            <p className="text-sm text-gray-700 leading-relaxed">{insights.summary}</p>
            <div className="flex gap-3 mt-3 flex-wrap">
              {criticals > 0 && (
                <span className="flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-1 rounded-full">
                  <AlertCircle size={12} /> {criticals} critical
                </span>
              )}
              {warnings > 0 && (
                <span className="flex items-center gap-1 text-xs font-medium text-yellow-700 bg-yellow-100 px-2 py-1 rounded-full">
                  <AlertTriangle size={12} /> {warnings} warning{warnings !== 1 ? 's' : ''}
                </span>
              )}
              {criticals === 0 && warnings === 0 && (
                <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">
                  <CheckCircle size={12} /> No issues detected
                </span>
              )}
            </div>
          </div>
          <button onClick={handleRerun}
            className="btn-secondary text-xs flex items-center gap-1.5 self-start flex-shrink-0">
            <RefreshCw size={13} /> Re-analyze
          </button>
        </div>
      </div>

      {/* Findings */}
      {insights.findings?.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Findings ({insights.findings.length})
          </h3>
          {insights.findings.map(f => <FindingCard key={f.id} finding={f} />)}
        </div>
      )}

      <p className="text-xs text-gray-400 text-right">
        Analyzed {insights.analyzedAt ? formatDateTime(insights.analyzedAt) : ''}
      </p>
    </div>
  );
}
