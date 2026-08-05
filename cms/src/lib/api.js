import { API_BASE } from './config.js';

const ACCESS_KEY = 'faderoom.cms.access';
const REFRESH_KEY = 'faderoom.cms.refresh';

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set({ accessToken, refreshToken }) {
    if (accessToken) localStorage.setItem(ACCESS_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  constructor(status, message, fields) {
    super(message);
    this.status = status;
    this.fields = fields || null;
  }
}

/* One refresh in flight at a time — several 401s at once should queue behind
   a single refresh call rather than each firing their own. */
let refreshing = null;

async function refreshAccess() {
  if (!tokens.refresh) return null;
  refreshing ??= fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refresh }),
  })
    .then(async (res) => {
      if (!res.ok) throw new ApiError(res.status, 'Session expired');
      const data = await res.json();
      tokens.set(data);
      return data.accessToken;
    })
    .catch(() => {
      tokens.clear();
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function api(path, { method = 'GET', body, form, retry = true } = {}) {
  const headers = {};
  if (tokens.access) headers.Authorization = `Bearer ${tokens.access}`;
  /* Never set Content-Type for FormData — the browser has to add the boundary. */
  if (body && !form) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers,
    body: form || (body ? JSON.stringify(body) : undefined),
  });

  if (res.status === 401 && retry && tokens.refresh) {
    const fresh = await refreshAccess();
    if (fresh) return api(path, { method, body, form, retry: false });
  }

  if (res.status === 204) return null;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    if (res.status === 401) {
      tokens.clear();
      window.dispatchEvent(new Event('faderoom:signed-out'));
    }
    throw new ApiError(res.status, data?.error || 'Something went wrong', data?.fields);
  }
  return data;
}

export const get = (path) => api(path);
export const post = (path, body) => api(path, { method: 'POST', body });
export const patch = (path, body) => api(path, { method: 'PATCH', body });
export const del = (path) => api(path, { method: 'DELETE' });
export const postForm = (path, form) => api(path, { method: 'POST', form });
export const patchForm = (path, form) => api(path, { method: 'PATCH', form });
