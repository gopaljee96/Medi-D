export const SESSION_TOKEN_KEY = 'token';
export const SESSION_USER_KEY = 'user';

export function getToken() {
  return localStorage.getItem(SESSION_TOKEN_KEY);
}

export function getUser() {
  try {
    const raw = localStorage.getItem(SESSION_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(authResponse) {
  localStorage.setItem(SESSION_TOKEN_KEY, authResponse.token);
  localStorage.setItem(
    SESSION_USER_KEY,
    JSON.stringify({
      username: authResponse.username,
      role: authResponse.role,
      fullName: authResponse.fullName,
    }),
  );
}

export function saveCustomSession({ token, username, role, fullName }) {
  localStorage.setItem(SESSION_TOKEN_KEY, token);
  localStorage.setItem(
    SESSION_USER_KEY,
    JSON.stringify({
      username,
      role,
      fullName,
    }),
  );
}

export function clearSession() {
  localStorage.removeItem(SESSION_TOKEN_KEY);
  localStorage.removeItem(SESSION_USER_KEY);
}
