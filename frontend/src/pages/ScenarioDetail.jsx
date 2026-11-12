import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Upload, Trash2, ChevronRight, ArrowLeft } from 'lucide-react';
import { getProject, getScenario, getRuns, uploadRun, deleteRun } from '../api/client';
import useAuthStore from '../store/authStore';
import Modal from '../components/Modal';
import { isAdminish, isCreator } from '../utils/roles';

function fmt(val, unit = 'ms') {
  if (val == null) return '—';
  return `${parseFloat(val).toFixed(1)} ${unit}`;
}

export default function ScenarioDetail() {
  const { projectId, scenarioId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  // Same rules the backend enforces (requireManager / requireAdmin)
  const isAdmin = isAdminish(user?.role);
  const canUpload = isCreator(user?.role);

  const [project, setProject] = useState(null);
  const [scenario, setScenario] = useState(null);
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [uploadForm, setUploadForm] = useState({ environment: '', note: '', test_name: '' });
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  const load = async () => {
    try {
      const [proj, scen, r] = await Promise.all([
        getProject(projectId), getScenario(projectId, scenarioId), getRuns(projectId, scenarioId)
      ]);
      setProject(proj.data); setScenario(scen.data); setRuns(r.data);
    } catch { navigate(`/projects/${projectId}`); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [scenarioId]);

  const handleUpload = async () => {
    if (!uploadFile) return setError('Please select a JTL/CSV file');
    setSaving(true); setError(''); setUploadProgress(0);
    const formData = new FormData();
    formData.append('jtlFile', uploadFile);
    formData.append('test_name', uploadForm.test_name);
    formData.append('environment', uploadForm.environment);
    formData.append('note', uploadForm.note);
    try {
      await uploadRun(projectId, scenarioId, formData, (e) => {
        setUploadProgress(Math.round((e.loaded / e.total) * 100));
      });
      setModal(null); setUploadFile(null); setUploadForm({ environment: '', note: '', test_name: '' }); load();
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await deleteRun(projectId, scenarioId, selected.id);
      setModal(null); load();
    } catch (err) {
      setError(err.response?.data?.error || 'Delete failed');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link to="/" className="hover:text-brand-600 flex items-center gap-1"><ArrowLeft size={14} /> Projects</Link>
        <ChevronRight size={14} />
        <Link to={`/projects/${projectId}`} className="hover:text-brand-600">{project?.name}</Link>
        <ChevronRight size={14} />
        <span className="text-gray-900 font-medium">{scenario?.name}</span>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{scenario?.name}</h1>
          {scenario?.description && <p className="text-gray-500 text-sm mt-1">{scenario.description}</p>}
          <p className="text-xs text-gray-400 mt-1">{runs.length} run{runs.length !== 1 ? 's' : ''}</p>
        </div>
        {canUpload && (
          <button onClick={() => { setError(''); setModal('upload'); }} className="btn-primary flex items-center gap-2">
            <Upload size={16} /> Upload JTL
          </button>
        )}
      </div>

      {runs.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-gray-500">No runs yet. Upload a JTL file to get started.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['#', 'Test Name', 'Date', 'Environment', 'Requests', 'Error %', 'Avg (ms)', 'P95 (ms)', 'Throughput', 'Status', ''].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.map((r, i) => (
                <tr key={r.id} onClick={() => navigate(`/projects/${projectId}/scenarios/${scenarioId}/runs/${r.id}`)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors group">
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">#{runs.length - i}</td>
                  <td className="px-4 py-3">
                    {r.test_name
                      ? <span className="font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-md text-xs">{r.test_name}</span>
                      : <span className="text-gray-400 text-xs italic">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap text-xs">{new Date(r.uploaded_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{r.environment || '—'}</td>
                  <td className="px-4 py-3 font-medium">{r.total_requests?.toLocaleString() || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={parseFloat(r.error_rate) > 1 ? 'text-red-600 font-medium' : 'text-green-600'}>
                      {r.error_rate != null ? `${parseFloat(r.error_rate).toFixed(2)}%` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">{r.avg_response_time != null ? parseFloat(r.avg_response_time).toFixed(0) : '—'}</td>
                  <td className="px-4 py-3">{r.p95_response_time != null ? parseFloat(r.p95_response_time).toFixed(0) : '—'}</td>
                  <td className="px-4 py-3">{r.throughput != null ? `${parseFloat(r.throughput).toFixed(2)}/s` : '—'}</td>
                  <td className="px-4 py-3"><span className={`badge-${r.status}`}>{r.status}</span></td>
                  <td className="px-4 py-3">
                    {isAdmin && (
                      <button onClick={(e) => { e.stopPropagation(); setSelected(r); setError(''); setModal('delete'); }}
                        className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal === 'upload' && (
        <Modal title="Upload JTL File" onClose={() => !saving && setModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">JTL / CSV File *</label>
              <div onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-brand-400 transition-colors">
                <Upload size={24} className="text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">{uploadFile ? uploadFile.name : 'Click to select .jtl or .csv file'}</p>
                <input ref={fileRef} type="file" accept=".jtl,.csv" className="hidden"
                  onChange={e => setUploadFile(e.target.files[0])} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Test Name <span className="text-brand-600 font-semibold">*</span></label>
              <input className="input" value={uploadForm.test_name} onChange={e => setUploadForm({ ...uploadForm, test_name: e.target.value })} placeholder="e.g. Smoke Test, Load Test v2, Regression Run" autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Environment</label>
              <input className="input" value={uploadForm.environment} onChange={e => setUploadForm({ ...uploadForm, environment: e.target.value })} placeholder="e.g. staging, production" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
              <textarea className="input resize-none" rows={2} value={uploadForm.note} onChange={e => setUploadForm({ ...uploadForm, note: e.target.value })} placeholder="Optional notes about this run" />
            </div>
            {saving && (
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Uploading & processing...</span><span>{uploadProgress}%</span>
                </div>
                <div className="bg-gray-200 rounded-full h-2">
                  <div className="bg-brand-600 h-2 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setModal(null)} disabled={saving}>Cancel</button>
              <button className="btn-primary" onClick={handleUpload} disabled={saving}>{saving ? 'Processing...' : 'Upload'}</button>
            </div>
          </div>
        </Modal>
      )}

      {modal === 'delete' && (
        <Modal title="Delete Run" onClose={() => setModal(null)}>
          <p className="text-gray-600 text-sm mb-4">Delete this run and all its data? Cannot be undone.</p>
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn-danger" onClick={handleDelete} disabled={saving}>{saving ? 'Deleting...' : 'Delete'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
