import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, ChevronRight, ArrowLeft } from 'lucide-react';
import { getProject, getScenarios, createScenario, updateScenario, deleteScenario } from '../api/client';
import useAuthStore from '../store/authStore';
import Modal from '../components/Modal';
import { isAdminish, isCreator } from '../utils/roles';

export default function ProjectDetail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdmin = isAdminish(user?.role);
  const canCreate = isCreator(user?.role);

  const [project, setProject] = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [proj, scen] = await Promise.all([getProject(projectId), getScenarios(projectId)]);
      setProject(proj.data);
      setScenarios(scen.data);
    } catch { navigate('/'); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [projectId]);

  const openCreate = () => { setForm({ name: '', description: '' }); setError(''); setModal('create'); };
  const openEdit = (s, e) => { e.stopPropagation(); setSelected(s); setForm({ name: s.name, description: s.description || '' }); setError(''); setModal('edit'); };
  const openDelete = (s, e) => { e.stopPropagation(); setSelected(s); setError(''); setModal('delete'); };

  const handleSave = async () => {
    if (!form.name.trim()) return setError('Scenario name is required');
    setSaving(true); setError('');
    try {
      if (modal === 'create') await createScenario(projectId, form);
      else await updateScenario(projectId, selected.id, form);
      setModal(null); load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await deleteScenario(projectId, selected.id);
      setModal(null); load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;

  return (
    <div className="p-6">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link to="/" className="hover:text-brand-600 flex items-center gap-1"><ArrowLeft size={14} /> Projects</Link>
        <ChevronRight size={14} />
        <span className="text-gray-900 font-medium">{project?.name}</span>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{project?.name}</h1>
          {project?.description && <p className="text-gray-500 text-sm mt-1">{project.description}</p>}
          <p className="text-xs text-gray-400 mt-1">{scenarios.length} scenario{scenarios.length !== 1 ? 's' : ''}</p>
        </div>
        {canCreate && (
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> New Scenario
          </button>
        )}
      </div>

      {scenarios.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-gray-500">No scenarios yet.</p>
          {canCreate && <button onClick={openCreate} className="btn-primary mt-4">Create First Scenario</button>}
        </div>
      ) : (
        <div className="space-y-3">
          {scenarios.map(s => (
            <div key={s.id} onClick={() => navigate(`/projects/${projectId}/scenarios/${s.id}`)}
              className="card cursor-pointer hover:shadow-md hover:border-brand-300 transition-all group flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <h2 className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors">{s.name}</h2>
                {s.description && <p className="text-sm text-gray-500 mt-0.5 truncate">{s.description}</p>}
                <p className="text-xs text-gray-400 mt-1">
                  {s.run_count} run{s.run_count !== '1' ? 's' : ''}
                  {s.last_run_at ? ` · Last run ${new Date(s.last_run_at).toLocaleDateString()}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-4">
                {isAdmin && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => openEdit(s, e)} className="p-1.5 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors"><Pencil size={14} /></button>
                    <button onClick={(e) => openDelete(s, e)} className="p-1.5 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"><Trash2 size={14} /></button>
                  </div>
                )}
                <ChevronRight size={16} className="text-gray-400" />
              </div>
            </div>
          ))}
        </div>
      )}

      {(modal === 'create' || modal === 'edit') && (
        <Modal title={modal === 'create' ? 'New Scenario' : 'Edit Scenario'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Scenario name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea className="input resize-none" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional description" />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </Modal>
      )}

      {modal === 'delete' && (
        <Modal title="Delete Scenario" onClose={() => setModal(null)}>
          <p className="text-gray-600 text-sm mb-4">Delete <strong>{selected?.name}</strong>? All runs will also be deleted. Cannot be undone.</p>
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
