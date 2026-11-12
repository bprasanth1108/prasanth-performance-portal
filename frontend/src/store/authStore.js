import { create } from 'zustand';

const useAuthStore = create((set) => ({
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user') || 'null'),

  setAuth: (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    set({ token, user });
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ token: null, user: null });
  },

  isAdmin: () => {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return user?.role === 'admin';
  },

  isManager: () => {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return ['admin', 'manager'].includes(user?.role);
  },
}));

export default useAuthStore;
