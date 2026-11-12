import React, { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, UserCheck, UserX, FolderOpen, X } from 'lucide-react';
import { getUsers, createUser, updateUser, deleteUser, getProjects, getProjectMembers, addProjectMember, removeProjectMember } from '../api/client';
import useAuthStore from '../store/authStore';
import Modal from '../components/Modal';
import { getRoleLabel, canManageUsers } from '../utils/roles';

// All 6 roles in display order
const ALL_ROLES = [
  { value: 'admin',                label: 'Administrator' },
  { value: 'senior_test_engineer', label: 'Senior Test Engineer' },
  { value: 'manager',              label: 'Manager' },
  { value: 'tester',               label: 'Tester' },
  { value: 'project_manager',      label: 'Project Manager' },
  { value: 'developer',            label: 'Developer' },
];

export default function Users() {
  const { user: me } = useAuthStore();
  // Manager / Tester can assign project access but cannot create or edit users
  const canEditUsers = canManageUsers(me?.role);
  const [users,    setUsers]    = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState(null); // 'create' | 'edit' | 'delete' | 'members'
  const [selected, setSelected] = useState(null);
  const [form,     setForm]     = useState({ username: '', password: '', role: 'developer' });
  const [editForm, setEditForm] = useState({ role: '', is_active: true, password: '' });
  const [error,    setError]    = useState('');
  const [saving,   setSaving]   = useState(false);

  // Project-member assignment state
  const [memberProject,  setMemberProject]  = useState(null); // project being managed
  const [members,        setMembers]        = useState([]);
  const [memberLoading,  setMemberLoading]  = useState(false);
  const [addUserId,      setAddUserId]      = useState('');
  const [memberError,    setMemberError]    = useState('');

  const load = async () => {
    try {
      const [uRes, pRes] = await Promise.all([getUsers(), getProjects()]);
      setUsers(uRes.data);
      setProjects(pRes.data);
    } catch { } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // ── User CRUD ───────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.username || !form.password) return setError('Username and password required');
    setSaving(true); setError('');
    try {
      await createUser(form);
      setModal(null);
      setForm({ username: '', password: '', role: 'developer' });
      load();
    } catch (err) { setError(err.response?.data?.error || 'Failed to create user'); }
    finally { setSaving(false); }
  };

  const handleUpdate = async () => {
    setSaving(true); setError('');
    const payload = { role: editForm.role, is_active: editForm.is_active };
    if (editForm.password) payload.password = editForm.password;
    try { await updateUser(selected.id, payload); setModal(null); load(); }
    catch (err) { setError(err.response?.data?.error || 'Failed to update'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true);
    try { await deleteUser(selected.id); setModal(null); load(); }
    catch (err) { setError(err.response?.data?.error || 'Failed to delete'); }
    finally { setSaving(false); }
  };

  const openEdit = (u) => {
    setSelected(u);
    setEditForm({ role: u.role, is_active: u.is_active, password: '' });
    setError(''); setModal('edit');
  };

  // ── Project member management ────────────────────────────────────────────────
  const openMembers = async (project) => {
    setMemberProject(project);
    setMemberError('');
    setAddUserId('');
    setModal('members');
    setMemberLoading(true);
    try {
      const res = await getProjectMembers(project.id);
      setMembers(res.data);
    } catch { setMemberError('Failed to load members'); }
    finally { setMemberLoading(false); }
  };

  const handleAddMember = async () => {
    if (!addUserId) return setMemberError('Select a user to add');
    setMemberError('');
    try {
      await addProjectMember(memberProject.id, addUserId);
      setAddUserId('');
      const res = await getProjectMembers(memberProject.id);
      setMembers(res.data);
    } catch (err) { setMemberError(err.response?.data?.error || 'Failed to add member'); }
  };

  const handleRemoveMember = async (userId) => {
    try {
      await removeProjectMember(memberProject.id, userId);
      setMembers(prev => prev.filter(m => m.id !== userId));
    } catch (err) { setMemberError(err.response?.data?.error || 'Failed to remove member'); }
  };

  // Users not already in the project (for the add dropdown)
  const unassignedUsers = users.filter(
    u => !members.some(m => m.id === u.id) && u.is_active
  );

  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;

  return (
    <div className="p-6 space-y-8">

      {/* ── Users Table (Administrator / Senior Test Engineer only) ─────────── */}
      {canEditUsers && (
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
            <p className="text-gray-500 text-sm mt-0.5">{users.length} users</p>
          </div>
          <button onClick={() => { setForm({ username: '', password: '', role: 'developer' }); setError(''); setModal('create'); }}
            className="btn-primary flex items-center gap-2">
            <Plus size={16} /> New User
          </button>
        </div>

        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Username', 'Role', 'Status', 'Created', ''].map(h => (
                  <th key={h} className="text-left text-xs font-medium text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900"
                    style={{ fontFamily: "'Book Antiqua', Palatino, serif" }}>
                    {u.username} {u.id === me?.id && <span className="text-xs text-gray-400">(you)</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge-${u.role}`}
                      style={{ fontFamily: "'Book Antiqua', Palatino, serif", color: '#ffffff', display: 'inline-block' }}>
                      {getRoleLabel(u.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {u.is_active
                      ? <span className="flex items-center gap-1 text-green-600 text-xs"><UserCheck size={13} /> Active</span>
                      : <span className="flex items-center gap-1 text-red-500 text-xs"><UserX size={13} /> Inactive</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(u)} className="p-1.5 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors" title="Edit user"><Pencil size={14} /></button>
                      {u.id !== me?.id && (
                        <button onClick={() => { setSelected(u); setError(''); setModal('delete'); }}
                          className="p-1.5 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors" title="Delete user">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}

      {/* ── Project Access Management ─────────────────────────────────────────── */}
      <section>
        <div className="mb-4">
          {canEditUsers
            ? <h2 className="text-xl font-bold text-gray-900">Project Access</h2>
            : <h1 className="text-2xl font-bold text-gray-900">Project Access</h1>}
          <p className="text-gray-500 text-sm mt-0.5">
            Assign Project Managers and Developers to specific projects. Administrators, Senior Test Engineers,
            Managers and Testers always have access to all projects.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(p => (
            <div key={p.id} className="card hover:shadow-md transition-all cursor-pointer group"
              onClick={() => openMembers(p)}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <FolderOpen size={16} className="text-brand-600 flex-shrink-0" />
                    <h3 className="font-semibold text-gray-900 truncate group-hover:text-brand-600">{p.name}</h3>
                  </div>
                  {p.description && <p className="text-xs text-gray-500 mt-1 line-clamp-1">{p.description}</p>}
                  <p className="text-xs text-gray-400 mt-1">{p.scenario_count} scenario{p.scenario_count !== '1' ? 's' : ''}</p>
                </div>
                <button className="text-xs text-brand-600 font-medium ml-2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  Manage →
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Create User Modal ────────────────────────────────────────────────── */}
      {modal === 'create' && (
        <Modal title="New User" onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username *</label>
              <input className="input" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="Username" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
              <input className="input" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Password" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                {ALL_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleCreate} disabled={saving}>{saving ? 'Creating...' : 'Create User'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Edit User Modal ──────────────────────────────────────────────────── */}
      {modal === 'edit' && (
        <Modal title={`Edit — ${selected?.username}`} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select className="input" value={editForm.role} onChange={e => setEditForm({ ...editForm, role: e.target.value })}>
                {ALL_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select className="input" value={editForm.is_active.toString()} onChange={e => setEditForm({ ...editForm, is_active: e.target.value === 'true' })}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password <span className="text-gray-400 font-normal">(leave blank to keep)</span></label>
              <input className="input" type="password" value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })} placeholder="New password" />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleUpdate} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delete User Modal ────────────────────────────────────────────────── */}
      {modal === 'delete' && (
        <Modal title="Delete User" onClose={() => setModal(null)}>
          <p className="text-gray-600 text-sm mb-4">Delete user <strong>{selected?.username}</strong>? This cannot be undone.</p>
          {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button className="btn-secondary" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn-danger" onClick={handleDelete} disabled={saving}>{saving ? 'Deleting...' : 'Delete'}</button>
          </div>
        </Modal>
      )}

      {/* ── Project Members Modal ────────────────────────────────────────────── */}
      {modal === 'members' && memberProject && (
        <Modal title={`Access — ${memberProject.name}`} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <p className="text-xs text-gray-500">
              Administrators, Senior Test Engineers, Managers and Testers already see every project, so only
              Project Managers and Developers need to be added here.
            </p>

            {/* Add user */}
            <div className="flex gap-2">
              <select className="input flex-1" value={addUserId} onChange={e => setAddUserId(e.target.value)}>
                <option value="">— Select user to add —</option>
                {unassignedUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.username} ({getRoleLabel(u.role)})</option>
                ))}
              </select>
              <button onClick={handleAddMember} className="btn-primary whitespace-nowrap">
                <Plus size={14} className="inline mr-1" />Add
              </button>
            </div>

            {memberError && <p className="text-red-600 text-sm">{memberError}</p>}

            {/* Current members */}
            {memberLoading ? (
              <p className="text-gray-400 text-sm text-center py-4">Loading members...</p>
            ) : members.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">No users assigned yet.</p>
            ) : (
              <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                {members.map(m => (
                  <div key={m.id} className="flex items-center justify-between px-3 py-2 bg-white hover:bg-gray-50">
                    <div>
                      <span className="font-medium text-sm text-gray-900"
                        style={{ fontFamily: "'Book Antiqua', Palatino, serif" }}>{m.username}</span>
                      <span className={`badge-${m.role} ml-2`}
                        style={{ fontFamily: "'Book Antiqua', Palatino, serif", color: '#fff', display: 'inline-block' }}>
                        {getRoleLabel(m.role)}
                      </span>
                    </div>
                    <button onClick={() => handleRemoveMember(m.id)}
                      className="p-1 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors text-gray-400"
                      title="Remove from project">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button className="btn-secondary" onClick={() => setModal(null)}>Close</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
