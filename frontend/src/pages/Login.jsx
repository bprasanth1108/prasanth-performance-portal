import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { login } from '../api/client';
import useAuthStore from '../store/authStore';

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
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

      {/* Centered login card */}
      <div className="relative z-10 flex-1 flex items-center justify-center p-4">
        <div className="login-card bg-white/90 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-sm p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="logo-badge p-3 rounded-2xl mb-4">
              <Activity size={34} className="text-white" strokeWidth={2.5} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Prasanth's Performance Portal</h1>
            <p className="text-gray-500 text-sm mt-1">Performance Test Reporter</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                className="input"
                type="text"
                autoFocus
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                placeholder="Enter username"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder="Enter password"
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
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
