import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { login } from '../api/client';
import useAuthStore from '../store/authStore';

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Show the idle notice once, then clear the router state so it does not
  // persist across refreshes or future visits to the login page.
  const [idleNotice, setIdleNotice] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.state?.reason === 'idle') {
      setIdleNotice(true);
      // Replace history entry to drop the state so a refresh won't re-show it.
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIdleNotice(false);
    setLoading(true);
    try {
      const res = await login(form);
      setAuth(res.data.token, res.data.user);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen animated-bg flex flex-col overflow-hidden">
      {/* Floating colorful blobs */}
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />
      <div className="blob blob-4" />

      {/* Subtle grid overlay */}
      <div className="absolute inset-0 grid-overlay" />

      {/* Rising particles */}
      {[...Array(8)].map((_, i) => (
        <span
          key={i}
          className="particle"
          style={{
            left: `${(i * 13 + 5) % 100}%`,
            width: `${6 + (i % 3) * 4}px`,
            height: `${6 + (i % 3) * 4}px`,
            animationDuration: `${12 + (i % 5) * 3}s`,
            animationDelay: `${i * 1.4}s`,
          }}
        />
      ))}

      {/* Centered content: standout title + liquid-glass card */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-4">

        {/* Standout brand title — OUTSIDE the glass card */}
        <div className="flex flex-col items-center mb-7 text-center">
          <div className="logo-badge p-3 rounded-2xl mb-5">
            <Activity size={38} className="text-white" strokeWidth={2.5} />
          </div>
          <h1 className="brand-title text-3xl sm:text-4xl">Prasanth's Performance Portal</h1>
          <p className="brand-subtitle text-xs mt-3">Performance Test Reporter</p>
        </div>

        <div className="glass-card w-full max-w-sm p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="glass-label block mb-1.5">Username</label>
              <input
                className="glass-input"
                type="text"
                autoFocus
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                placeholder="Enter username"
                required
              />
            </div>
            <div>
              <label className="glass-label block mb-1.5">Password</label>
              <input
                className="glass-input"
                type="password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder="Enter password"
                required
              />
            </div>

            {idleNotice && !error && (
              <div className="text-sm rounded-xl px-3 py-2" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff' }}>
                You were logged out after 30 minutes of inactivity.
              </div>
            )}

            {error && (
              <div className="text-sm rounded-xl px-3 py-2" style={{ background: 'rgba(239,68,68,0.22)', border: '1px solid rgba(252,165,165,0.6)', color: '#fff' }}>
                {error}
              </div>
            )}

            <button type="submit" className="glass-btn" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <p className="text-center text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>
              Don&apos;t have an account?{' '}
              <Link to="/register" className="glass-link">Create an account</Link>
            </p>
          </form>
        </div>
      </div>

      {/* Footer — designed & developed by + copyright */}
      <footer className="login-footer relative z-10 pb-5 px-4 text-center text-white">
        <p className="text-sm font-medium">Designed &amp; Developed by Prasanth Kumar Birupogu</p>
        <p className="text-xs opacity-90 mt-0.5">&copy; 2026 Prasanth Kumar Birupogu. All Rights Reserved.</p>
      </footer>
    </div>
  );
}
