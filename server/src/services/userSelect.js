// The single source of truth for the user shape that leaves the API.
// passwordHash is never included — every query and response uses this select.
export const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
};
