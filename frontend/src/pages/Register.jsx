import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { register } from '../api/client';

// Self-registration roles only — admin, senior_test_engineer and manager
// (Test Manager) are never selectable here.
const REGISTER_ROLES = [
  { value: 'tester',          label: 'Tester' },
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'developer',       label: 'Developer' },
];

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'developer' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const pw = form.password;
  const pwChecks = {
    length: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    number: /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  };
  const pwValid = Object.values(pwChecks).every(Boolean);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!form.name.trim()) return setError('Name is required');
    if (!emailValid) return setError('Enter a valid email address');
    if (!pwValid) return setError('Password must be 8+ chars with upper, lower, number, and special character');

    setLoading(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
      });
      setSuccess('Registration submitted! An administrator will review and approve your account. You can log in once approved.');
      setForm({ name: '', email: '', password: '', role: 'developer' });
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen animated-bg flex flex-col overflow-hidden">
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />
      <div className="blob blob-4" />
      <div className="absolute inset-0 grid-overlay" />

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-4">

        {/* Standout brand title — OUTSIDE the glass card */}
        <div className="flex flex-col items-center mb-6 text-center">
          <div className="logo-badge p-3 rounded-2xl mb-4">
            <Activity size={36} className="text-white" strokeWidth={2.5} />
          </div>
          <h1 className="brand-title text-2xl sm:text-3xl">Prasanth's Performance Portal</h1>
          <p className="brand-subtitle text-xs mt-3">Create an Account</p>
        </div>

        <div className="glass-card w-full max-w-sm p-8">
          {success ? (
            <div className="space-y-4">
              <div className="text-sm rounded-xl px-3 py-3" style={{ background: 'rgba(34,197,94,0.22)', border: '1px solid rgba(134,239,172,0.6)', color: '#fff' }}>
                {success}
              </div>
              <Link to="/login" className="glass-btn inline-block text-center">Back to Login</Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="glass-label block mb-1.5">Name</label>
                <input className="glass-input" type="text" autoFocus value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" required />
              </div>
              <div>
                <label className="glass-label block mb-1.5">Email</label>
                <input className="glass-input" type="email" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" required />
                <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>You will log in with this email.</p>
              </div>
              <div>
                <label className="glass-label block mb-1.5">Password</label>
                <input className="glass-input" type="password" value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Create a password" required />
                {pw && (
                  <div className="text-xs rounded-xl p-2 space-y-0.5 mt-2" style={{ background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.85)' }}>
                    <p className={pwChecks.length ? 'text-green-300' : 'text-red-300'}>{pwChecks.length ? '✓' : '✗'} At least 8 characters</p>
                    <p style={{ opacity: pwChecks.upper ? 1 : 0.6 }}>{pwChecks.upper ? '✓' : '·'} Uppercase letter</p>
                    <p style={{ opacity: pwChecks.lower ? 1 : 0.6 }}>{pwChecks.lower ? '✓' : '·'} Lowercase letter</p>
                    <p style={{ opacity: pwChecks.number ? 1 : 0.6 }}>{pwChecks.number ? '✓' : '·'} Number</p>
                    <p style={{ opacity: pwChecks.special ? 1 : 0.6 }}>{pwChecks.special ? '✓' : '·'} Special character</p>
                  </div>
                )}
              </div>
              <div>
                <label className="glass-label block mb-1.5">Role</label>
                <select className="glass-input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  {REGISTER_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              {error && (
                <div className="text-sm rounded-xl px-3 py-2" style={{ background: 'rgba(239,68,68,0.22)', border: '1px solid rgba(252,165,165,0.6)', color: '#fff' }}>{error}</div>
              )}

              <button type="submit" className="glass-btn" disabled={loading}>
                {loading ? 'Submitting...' : 'Register'}
              </button>

              <p className="text-center text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>
                Already have an account?{' '}
                <Link to="/login" className="glass-link">Sign in</Link>
              </p>
            </form>
          )}
        </div>
      </div>

      <footer className="login-footer relative z-10 pb-5 px-4 text-center text-white">
        <p className="text-sm font-medium">Designed &amp; Developed by Prasanth Kumar Birupogu</p>
        <p className="text-xs opacity-90 mt-0.5">&copy; 2026 Prasanth Kumar Birupogu. All Rights Reserved.</p>
      </footer>
    </div>
  );
}
