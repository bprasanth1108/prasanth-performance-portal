// Centralised role configuration for the frontend.
// Keep this in sync with backend/src/middleware/auth.js

export const ROLE_LABELS = {
  admin:                'Administrator',
  senior_test_engineer: 'Senior Test Engineer',
  manager:              'Manager',
  tester:               'Tester',
  project_manager:      'Project Manager',
  developer:            'Developer',
};

// Roles that can see ALL projects (no membership check needed)
export const GLOBAL_ROLES = ['admin', 'senior_test_engineer'];

// Roles that can create projects / scenarios / upload runs
export const CREATOR_ROLES = ['admin', 'senior_test_engineer', 'manager', 'tester', 'project_manager'];

// Roles that can edit/delete projects, manage members
export const ADMIN_ROLES = ['admin', 'senior_test_engineer'];

export const getRoleLabel = (role) => ROLE_LABELS[role] || role;

export const isGlobal   = (role) => GLOBAL_ROLES.includes(role);
export const isCreator  = (role) => CREATOR_ROLES.includes(role);
export const isAdminish = (role) => ADMIN_ROLES.includes(role);
