import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, auth, onForcedSignOut } from '../api/client';
import { connectSocket, disconnectSocket } from '../api/socket';
import type { Artist, ShopConfig, User } from '../types';

interface Session {
  user: User;
  /** Present only when the signed-in user is an artist. */
  artist: Artist | null;
}

interface AuthContextValue {
  user: User | null;
  /** The artist's own chair — drives the artist portal. Null for clients. */
  artist: Artist | null;
  isArtist: boolean;
  config: ShopConfig | null;
  booting: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (input: { name: string; email: string; password: string; phone: string }) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (patch: Partial<User>) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [artist, setArtist] = useState<Artist | null>(null);
  const [config, setConfig] = useState<ShopConfig | null>(null);
  const [booting, setBooting] = useState(true);

  const signOut = useCallback(async () => {
    await auth.clear();
    disconnectSocket();
    setUser(null);
    setArtist(null);
  }, []);

  /* The API client tells us when a refresh has failed for good. */
  useEffect(() => {
    const unsubscribe = onForcedSignOut(() => {
      setUser(null);
      setArtist(null);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    (async () => {
      /* Shop rules (loyalty goal, delivery fee) come from the server so the
         app never hardcodes a number the shop might change. */
      api.get<ShopConfig>('/config').then(setConfig).catch(() => {});

      const { accessToken } = await auth.load();
      if (accessToken) {
        try {
          const session = await api.get<Session>('/auth/me');
          setUser(session.user);
          setArtist(session.artist ?? null);
          connectSocket();
        } catch {
          await auth.clear();
        }
      }
      setBooting(false);
    })();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const data = await api.post<Session & { accessToken: string; refreshToken: string }>(
      '/auth/login',
      { email, password },
    );
    await auth.set(data);
    setUser(data.user);
    setArtist(data.artist ?? null);
    connectSocket();
  }, []);

  const register = useCallback(
    async (input: { name: string; email: string; password: string; phone: string }) => {
      const data = await api.post<Session & { accessToken: string; refreshToken: string }>(
        '/auth/register',
        input,
      );
      await auth.set(data);
      setUser(data.user);
      setArtist(data.artist ?? null);
      connectSocket();
    },
    [],
  );

  const refreshUser = useCallback(async () => {
    const session = await api.get<Session>('/auth/me');
    setUser(session.user);
    setArtist(session.artist ?? null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      artist,
      isArtist: user?.role === 'artist',
      config,
      booting,
      signIn,
      register,
      signOut,
      updateUser: (patch: Partial<User>) =>
        setUser((u) => (u ? { ...u, ...patch } : u)),
      refreshUser,
    }),
    [user, artist, config, booting, signIn, register, signOut, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
