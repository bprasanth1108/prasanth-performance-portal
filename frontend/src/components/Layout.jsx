import React, { useState } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { Activity, FolderOpen, Users, LogOut, ChevronRight, ChevronLeft, KeyRound, Eye, EyeOff } from 'lucide-react';
import useAuthStore from '../store/authStore';
import { changePassword } from '../api/client';
import Modal from './Modal';
import { getRoleLabel } from '../utils/roles';

function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [error, setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setError(''); setSuccess('');
    if (!form.currentPassword || !form.newPassword || !form.confirmPassword)
      return setError('All fields are required');
    if (form.newPassword !== form.confirmPassword)
      return setError('New passwords do not match');
    if (form.newPassword.length < 6)
      return setError('New password must be at least 6 characters');

    setSaving(true);
    try {
      await changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      setSuccess('Password changed successfully!');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  const PasswordInput = ({ field, label, show, toggle }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <input
          className="input pr-10"
          type={show ? 'text' : 'password'}
          value={form[field]}
          onChange={e => setForm({ ...form, [field]: e.target.value })}
          placeholder={label}
          autoComplete="new-password"
        />
        <button type="button" onClick={toggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
          {show ? <EyeOff size={15}/> : <Eye size={15}/>}
        </button>
      </div>
    </div>
  );

  return (
    <Modal title="Change Password" onClose={onClose}>
      <div className="space-y-4">
        <PasswordInput field="currentPassword" label="Current Password" show={showCurrent} toggle={() => setShowCurrent(s => !s)}/>
        <PasswordInput field="newPassword"     label="New Password"     show={showNew}     toggle={() => setShowNew(s => !s)}/>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
          <input
            className="input"
            type="password"
            value={form.confirmPassword}
            onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
            placeholder="Repeat new password"
            autoComplete="new-password"
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          />
        </div>

        {/* Password strength hint */}
        {form.newPassword && (
          <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2 space-y-0.5">
            <p className={form.newPassword.length >= 6 ? 'text-green-600' : 'text-red-500'}>
              {form.newPassword.length >= 6 ? '✓' : '✗'} At least 6 characters
            </p>
            <p className={/[A-Z]/.test(form.newPassword) ? 'text-green-600' : 'text-gray-400'}>
              {/[A-Z]/.test(form.newPassword) ? '✓' : '·'} Uppercase letter
            </p>
            <p className={/[0-9]/.test(form.newPassword) ? 'text-green-600' : 'text-gray-400'}>
              {/[0-9]/.test(form.newPassword) ? '✓' : '·'} Number
            </p>
            <p className={/[^A-Za-z0-9]/.test(form.newPassword) ? 'text-green-600' : 'text-gray-400'}>
              {/[^A-Za-z0-9]/.test(form.newPassword) ? '✓' : '·'} Special character
            </p>
          </div>
        )}

        {error   && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        {success && <p className="text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2">{success}</p>}

        <div className="flex gap-2 justify-end pt-1">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary"   onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : 'Change Password'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function Layout() {
  const { user, logout } = useAuthStore();
  const navigate  = useNavigate();
  const location  = useLocation();
  const [collapsed, setCollapsed]       = useState(false);
  const [showChangePwd, setShowChangePwd] = useState(false);

  const handleLogout = () => { logout(); navigate('/login'); };

  const navItem = (to, icon, label) => {
    const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(to));
    return (
      <Link to={to} title={collapsed ? label : undefined}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all
          ${active ? 'fiori-nav-active' : 'fiori-nav-inactive'}
          ${collapsed ? 'justify-center' : ''}`}>
        <span className="flex-shrink-0">{icon}</span>
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
    );
  };

  return (
    <>
      {/* ── App shell: exactly viewport minus footer height ── */}
      <div className="app-shell">

        {/* ── Sidebar ── */}
        <aside className={`fiori-sidebar transition-all duration-300 ease-in-out
          ${collapsed ? 'w-14' : 'w-60'}`}>

          {/* Logo row */}
          <div className={`flex items-center h-14 px-3 flex-shrink-0
            ${collapsed ? 'justify-center' : 'justify-between'}`}
            style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
            {!collapsed && (
              <div className="flex items-center gap-2 overflow-hidden">
                <Activity size={20} style={{ color: '#8ECAE6', flexShrink: 0 }}/>
                <span className="font-bold text-sm truncate" style={{ color: '#8ECAE6' }}>
                  Prasanth's Performance Portal
                </span>
              </div>
            )}
            <button onClick={() => setCollapsed(c => !c)}
              className="p-1.5 rounded-lg transition-colors flex-shrink-0"
              style={{ color: 'rgba(255,255,255,0.6)' }}
              onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.10)'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
              {collapsed ? <ChevronRight size={16}/> : <ChevronLeft size={16}/>}
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 p-2 space-y-0.5 overflow-hidden">
            {navItem('/', <FolderOpen size={18}/>, 'Projects')}
            {['admin', 'senior_test_engineer'].includes(user?.role) && navItem('/users', <Users size={18}/>, 'Users')}
          </nav>

          {/* Bottom actions */}
          <div className="p-2 space-y-1 flex-shrink-0"
            style={{ borderTop: '1px solid rgba(255,255,255,0.10)' }}>
            <button
              onClick={() => setShowChangePwd(true)}
              title="Change Password"
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${collapsed ? 'justify-center' : ''}`}
              style={{ color: 'rgba(255,255,255,0.65)' }}
              onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.10)'; e.currentTarget.style.color='#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='rgba(255,255,255,0.65)'; }}>
              <KeyRound size={16} className="flex-shrink-0"/>
              {!collapsed && <span>Change Password</span>}
            </button>

            {collapsed ? (
              <button onClick={handleLogout} title="Logout"
                className="w-full flex justify-center p-2 rounded-lg transition-colors"
                style={{ color: 'rgba(255,255,255,0.5)' }}
                onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.10)'; e.currentTarget.style.color='#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='rgba(255,255,255,0.5)'; }}>
                <LogOut size={16}/>
              </button>
            ) : (
              <div className="flex items-center justify-between px-2 py-1 mt-1">
                <div className="min-w-0">
                  <p className="truncate font-bold text-white"
                    style={{ fontFamily: "'Book Antiqua', Palatino, serif", fontSize: '0.85rem' }}>
                    {user?.username}
                  </p>
                  <span
                    className={`badge-${user?.role}`}
                    style={{ fontFamily: "'Book Antiqua', Palatino, serif", color: '#ffffff', display: 'inline-block' }}>
                    {getRoleLabel(user?.role)}
                  </span>
                </div>
                <button onClick={handleLogout} title="Logout"
                  className="p-1.5 rounded-lg transition-colors ml-2"
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                  onMouseEnter={e => { e.currentTarget.style.background='rgba(255,255,255,0.10)'; e.currentTarget.style.color='#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background='transparent'; e.currentTarget.style.color='rgba(255,255,255,0.5)'; }}>
                  <LogOut size={16}/>
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* ── Right panel: shell bar + scrollable content ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Shell bar */}
          <header className="fiori-shellbar flex items-center px-5 h-12">
            <span className="text-sm font-semibold tracking-wide" style={{ color: '#023047' }}>
              {location.pathname === '/'                       ? 'Projects'
                : location.pathname.startsWith('/users')       ? 'User Management'
                : location.pathname.includes('/runs/')         ? 'Run Details'
                : location.pathname.includes('/scenarios/')    ? 'Scenario Details'
                : location.pathname.includes('/projects/')     ? 'Project Details'
                : ''}
            </span>
          </header>

          {/* Scrollable content — scrollbar lives entirely within this div, above footer */}
          <main className="fiori-content">
            <Outlet/>
          </main>
        </div>
      </div>

      {/* ── Fixed footer — always at viewport bottom ── */}
      <footer className="fiori-footer">
        <span style={{ color: 'rgba(255,255,255,0.75)' }}>
          Designed &amp; Developed by&nbsp;<strong>Prasanth Kumar Birupogu</strong>
        </span>
        <span className="fiori-footer-sep">|</span>
        <span style={{ color: 'rgba(255,255,255,0.75)' }}>
          &copy; 2026 Prasanth Kumar Birupogu. All Rights Reserved.
        </span>
      </footer>

      {/* Change Password Modal */}
      {showChangePwd && <ChangePasswordModal onClose={() => setShowChangePwd(false)}/>}
    </>
  );
}
