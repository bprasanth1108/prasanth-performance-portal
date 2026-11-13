// Centralised role configuration for the frontend.
// Keep this in sync with backend/src/middleware/auth.js

export const ROLE_LABELS = {
  admin:                'Administrator',
  senior_test_engineer: 'Senior Test Engineer',
  manager:              'Test Manager',
  tester:               'Tester',
  project_manager:      'Project Manager',
  developer:            'Developer',
};

// Super access: everything, including creating / editing / deleting users
export const USER_ADMIN_ROLES = ['admin', 'senior_test_engineer'];

// Full project access: see ALL projects, edit/delete, assign project access.
// Everything except user management.
export const GLOBAL_ROLES = ['admin', 'senior_test_engineer', 'manager', 'tester'];
export const ADMIN_ROLES  = GLOBAL_ROLES;

// Roles that can create scenarios / upload runs.
// project_manager is read-only (client access), so it is excluded.
export const CREATOR_ROLES = ['admin', 'senior_test_engineer', 'manager', 'tester'];

// Roles that can create new projects. Tester and project_manager excluded.
export const PROJECT_CREATOR_ROLES = ['admin', 'senior_test_engineer', 'manager'];

export const getRoleLabel = (role) => ROLE_LABELS[role] || role;

export const isGlobal          = (role) => GLOBAL_ROLES.includes(role);
export const isCreator         = (role) => CREATOR_ROLES.includes(role);
export const isProjectCreator  = (role) => PROJECT_CREATOR_ROLES.includes(role);
export const isAdminish        = (role) => ADMIN_ROLES.includes(role);
export const canManageUsers    = (role) => USER_ADMIN_ROLES.includes(role);
