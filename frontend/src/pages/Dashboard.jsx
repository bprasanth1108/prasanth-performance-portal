import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FolderOpen, Pencil, Trash2, ChevronRight } from 'lucide-react';
import { getProjects, createProject, updateProject, deleteProject } from '../api/client';
import useAuthStore from '../store/authStore';
import Modal from '../components/Modal';
import { isAdminish, isCreator } from '../utils/roles';

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'create' | 'edit' | 'delete'
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const isAdmin = isAdminish(user?.role);
  const canCreate = isCreator(user?.role);

  const load = async () => {
    try {
      const res = await getProjects();
      setProjects(res.data);
    } catch { } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm({ name: '', description: '' }); setError(''); setModal('create'); };
  const openEdit = (p, e) => { e.stopPropagation(); setSelected(p); setForm({ name: p.name, description: p.description || '' }); setError(''); setModal('edit'); };
  const openDelete = (p, e) => { e.stopPropagation(); setSelected(p); setModal('delete'); };

  const handleSave = async () => {
    if (!form.name.trim()) return setError('Project name is required');
    setSaving(true); setError('');
    try {
      if (modal === 'create') await createProject(form);
      else await updateProject(selected.id, form);
      setModal(null); load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await deleteProject(selected.id);
      setModal(null); load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete');
    } finally { setSaving(false); }
  };

  if (loading) return <div className="p-8 text-gray-500">Loading projects...</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-gray-500 text-sm mt-0.5">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
        </div>
        {canCreate && (
          <button onClick={openCreate} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> New Project
          </button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="card text-center py-16">
          <FolderOpen size={48} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No projects yet.</p>
          {canCreate && <button onClick={openCreate} className="btn-primary mt-4">Create First Project</button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(p => (
            <div key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
              className="card cursor-pointer hover:shadow-md hover:border-brand-300 transition-all group">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors truncate">{p.name}</h2>
                  {p.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{p.description}</p>}
                  <p className="text-xs text-gray-400 mt-2">
                    {p.scenario_count} scenario{p.scenario_count !== '1' ? 's' : ''} · {p.created_by_name || 'unknown'}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => openEdit(p, e)}
                      className="p-1.5 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors">
                      <Pencil size={14} />
                    </button>
                    <button onClick={(e) => openDelete(p, e)}
                      className="p-1.5 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 mt-3 text-brand-600 text-xs font-medium">
                View scenarios <ChevronRight size={12} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {(modal === 'create' || modal === 'edit') && (
        <Modal title={modal === 'create' ? 'New Project' : 'Edit Project'} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Project name" />
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

      {/* Delete Modal */}
      {modal === 'delete' && (
        <Modal title="Delete Project" onClose={() => setModal(null)}>
          <p className="text-gray-600 text-sm mb-4">
            Delete <strong>{selected?.name}</strong>? This will also delete all scenarios and runs. This cannot be undone.
          </p>
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
