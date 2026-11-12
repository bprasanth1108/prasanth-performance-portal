import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 120000, // 2 min for large file uploads
});

// Attach JWT to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const login = (data) => api.post('/auth/login', data);
export const getMe = () => api.get('/auth/me');
export const changePassword = (data) => api.put('/auth/change-password', data);
export const getUsers = () => api.get('/auth/users');
export const createUser = (data) => api.post('/auth/users', data);
export const updateUser = (id, data) => api.put(`/auth/users/${id}`, data);
export const deleteUser = (id) => api.delete(`/auth/users/${id}`);

// Projects
export const getProjects = () => api.get('/projects');
export const getProject = (id) => api.get(`/projects/${id}`);
export const createProject = (data) => api.post('/projects', data);
export const updateProject = (id, data) => api.put(`/projects/${id}`, data);
export const deleteProject = (id) => api.delete(`/projects/${id}`);

// Project Members
export const getProjectMembers = (projectId) => api.get(`/projects/${projectId}/members`);
export const addProjectMember = (projectId, userId) => api.post(`/projects/${projectId}/members`, { user_id: userId });
export const removeProjectMember = (projectId, userId) => api.delete(`/projects/${projectId}/members/${userId}`);

// Scenarios
export const getScenarios = (projectId) => api.get(`/projects/${projectId}/scenarios`);
export const getScenario = (projectId, id) => api.get(`/projects/${projectId}/scenarios/${id}`);
export const createScenario = (projectId, data) => api.post(`/projects/${projectId}/scenarios`, data);
export const updateScenario = (projectId, id, data) => api.put(`/projects/${projectId}/scenarios/${id}`, data);
export const deleteScenario = (projectId, id) => api.delete(`/projects/${projectId}/scenarios/${id}`);

// Runs
export const getRuns = (projectId, scenarioId) =>
  api.get(`/projects/${projectId}/scenarios/${scenarioId}/runs`);
export const getRun = (projectId, scenarioId, id) =>
  api.get(`/projects/${projectId}/scenarios/${scenarioId}/runs/${id}`);
export const getRunChartData = (projectId, scenarioId, id) =>
  api.get(`/projects/${projectId}/scenarios/${scenarioId}/runs/${id}/chart-data`);
export const uploadRun = (projectId, scenarioId, formData, onProgress) =>
  api.post(`/projects/${projectId}/scenarios/${scenarioId}/runs/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onProgress,
  });
export const updateRun = (projectId, scenarioId, id, data) =>
  api.put(`/projects/${projectId}/scenarios/${scenarioId}/runs/${id}`, data);
export const deleteRun = (projectId, scenarioId, id) =>
  api.delete(`/projects/${projectId}/scenarios/${scenarioId}/runs/${id}`);

export const getRunInsights = (projectId, scenarioId, id) =>
  api.get(`/projects/${projectId}/scenarios/${scenarioId}/runs/${id}/insights`);

export const getRunDashboard = (projectId, scenarioId, id) =>
  api.get(`/projects/${projectId}/scenarios/${scenarioId}/runs/${id}/dashboard`);

export const analyzeRun = (projectId, scenarioId, id) =>
  api.post(`/projects/${projectId}/scenarios/${scenarioId}/runs/${id}/analyze`);

export const getLabelDetail = (projectId, scenarioId, runId, label) =>
  api.get(`/projects/${projectId}/scenarios/${scenarioId}/runs/${runId}/label-detail/${encodeURIComponent(label)}`);
