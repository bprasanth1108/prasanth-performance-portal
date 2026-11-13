import { create } from 'zustand';
import { isAdminish, isCreator } from '../utils/roles';
import { logout as apiLogout } from '../api/client';

const useAuthStore = create((set) => ({
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user') || 'null'),

  setAuth: (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    set({ token, user });
  },

  // Merge updated profile fields (name, username, profile_locked) into the
  // stored user without touching the token.
  updateUser: (patch) => set((state) => {
    const next = { ...(state.user || {}), ...patch };
    localStorage.setItem('user', JSON.stringify(next));
    return { user: next };
  }),

  logout: async () => {
    // Best-effort server-side revocation (bumps token_version). We clear local
    // state regardless of whether the request succeeds.
    try { await apiLogout(); } catch { /* ignore network/expiry errors */ }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('lastActivity');
    set({ token: null, user: null });
  },

  isAdmin: () => {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return isAdminish(user?.role);
  },

  isManager: () => {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return isCreator(user?.role);
  },
}));

export default useAuthStore;
