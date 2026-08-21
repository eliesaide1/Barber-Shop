import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';

const ACCESS = 'faderoom.access';
const REFRESH = 'faderoom.refresh';

/* Kept in memory as well as on disk: every request reads the token, and
   hitting AsyncStorage on each one would be needless work. */
let accessToken: string | null = null;
let refreshToken: string | null = null;

export const auth = {
  get access() {
    return accessToken;
  },
  async load() {
    /* async-storage v3 returns a keyed object, not tuples. */
    const stored = await AsyncStorage.getMany([ACCESS, REFRESH]);
    accessToken = stored[ACCESS] ?? null;
    refreshToken = stored[REFRESH] ?? null;
    return { accessToken, refreshToken };
  },
  async set(tokens: { accessToken?: string; refreshToken?: string }) {
    const entries: Record<string, string> = {};
    if (tokens.accessToken) {
      accessToken = tokens.accessToken;
      entries[ACCESS] = tokens.accessToken;
    }
    if (tokens.refreshToken) {
      refreshToken = tokens.refreshToken;
      entries[REFRESH] = tokens.refreshToken;
    }
    if (Object.keys(entries).length) await AsyncStorage.setMany(entries);
  },
  async clear() {
    accessToken = null;
    refreshToken = null;
    await AsyncStorage.removeMany([ACCESS, REFRESH]);
  },
};

export class ApiError extends Error {
  status: number;
  fields: Record<string, string> | null;

  constructor(status: number, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields ?? null;
  }
}

type SignOutListener = () => void;
const signOutListeners = new Set<SignOutListener>();
export const onForcedSignOut = (fn: SignOutListener) => {
  signOutListeners.add(fn);
  return () => signOutListeners.delete(fn);
};

/* One refresh at a time — a burst of 401s should wait on a single call. */
let refreshing: Promise<string | null> | null = null;

async function refreshAccess(): Promise<string | null> {
  if (!refreshToken) return null;
  if (!refreshing) {
    refreshing = fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('refresh failed');
        const data = await res.json();
        await auth.set(data);
        return data.accessToken as string;
      })
      .catch(async () => {
        await auth.clear();
        signOutListeners.forEach((fn) => fn());
        return null;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  form?: FormData;
  retry?: boolean;
  signal?: AbortSignal;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, form, retry = true, signal } = options;

  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  /* FormData must set its own Content-Type so the boundary is included. */
  if (body && !form) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers,
      body: form ?? (body ? JSON.stringify(body) : undefined),
      signal,
    });
  } catch (err) {
    /* fetch rejects only on transport failure — the phone can't see the API. */
    throw new ApiError(0, 'Can’t reach VIA Barber House. Check your connection.');
  }

  if (res.status === 401 && retry && refreshToken) {
    const fresh = await refreshAccess();
    if (fresh) return request<T>(path, { ...options, retry: false });
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    if (res.status === 401) {
      await auth.clear();
      signOutListeners.forEach((fn) => fn());
    }
    throw new ApiError(res.status, data?.error ?? 'Something went wrong', data?.fields);
  }
  return data as T;
}

export const api = {
  get: <T,>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T,>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T,>(path: string) => request<T>(path, { method: 'DELETE' }),
  /**
   * Multipart POST, for uploading a photo.
   *
   * `request` deliberately leaves Content-Type unset for FormData — React
   * Native's fetch has to add it itself so the multipart boundary is included.
   * Setting it by hand produces a body the server cannot parse.
   */
  upload: <T,>(path: string, form: FormData) => request<T>(path, { method: 'POST', form }),
};

/** A file as React Native's fetch wants it inside FormData. */
export interface UploadFile {
  uri: string;
  name: string;
  type: string;
}
