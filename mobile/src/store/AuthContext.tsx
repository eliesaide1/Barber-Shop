import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { api, auth, onForcedSignOut } from '../api/client';
import { connectSocket, disconnectSocket, onSocketEvent } from '../api/socket';
import {
  SignInCancelled,
  configureGoogle,
  providerAvailable,
  signInWithProvider,
  type Provider,
} from '../api/social';
import type { Artist, ShopConfig, User } from '../types';

interface Session {
  user: User;
  /** Present only when the signed-in user is an artist. */
  artist: Artist | null;
  /**
   * Whether the shop has everything it asks a client for. False after a first
   * Google or Apple sign-in — neither provider knows a birthday or a mobile
   * number, and the app has to collect them before anything can be booked.
   */
  profileComplete: boolean;
}

interface ProviderStatus {
  google: { enabled: boolean; webClientId: string };
  apple: { enabled: boolean };
}

interface AuthContextValue {
  user: User | null;
  /** The artist's own chair — drives the artist portal. Null for clients. */
  artist: Artist | null;
  isArtist: boolean;
  config: ShopConfig | null;
  booting: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (input: {
    name: string;
    email: string;
    password: string;
    phone: string;
    dateOfBirth: string;
    visitFrequencyWeeks: number;
    verificationToken?: string;
  }) => Promise<void>;
  signInWith: (provider: Provider) => Promise<void>;
  /** Which provider buttons to draw — both this build and this shop have to offer one. */
  providers: { google: boolean; apple: boolean };
  profileComplete: boolean;
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
  const [profileComplete, setProfileComplete] = useState(true);
  const [providers, setProviders] = useState({ google: false, apple: false });

  /* A session lands the same way whichever door it came through. */
  const adopt = useCallback((session: Session) => {
    setUser(session.user);
    setArtist(session.artist ?? null);
    setProfileComplete(session.profileComplete ?? true);
    connectSocket();
  }, []);

  const signOut = useCallback(async () => {
    await auth.clear();
    /* Closed and reopened rather than simply closed: the token is read at
       handshake time, so the authenticated socket has to go — but the app still
       has screens, and they still want to hear the shop change its mind. */
    disconnectSocket();
    connectSocket();
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

  /* Pulled out of the boot effect so the same fetch answers all three of the
     moments the shop may have changed under us: launch, the admin saving in the
     CMS, and coming back to an app that has been in the background for a day. */
  const loadConfig = useCallback(() => {
    api.get<ShopConfig>('/config').then(setConfig).catch(() => {});
  }, []);

  /* Shop rules — hours, loyalty goal, whether prices are published, the number
     the basket is sent to — are read from the server rather than compiled in,
     and now they are re-read rather than believed forever. */
  useEffect(() => {
    const stop = onSocketEvent('settings:changed', loadConfig);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') loadConfig();
    });

    return () => {
      stop();
      sub.remove();
    };
  }, [loadConfig]);

  useEffect(() => {
    /* Opened before there is anybody to open it for. Signed out, it joins no
       rooms and hears only what the shop broadcasts to everyone — which is what
       the sign-in screen needs in order to be told its own words changed. */
    connectSocket();

    (async () => {
      loadConfig();

      /* Which providers this shop offers, and the Google client id to configure
         with — asked for rather than compiled in, so one build serves shops that
         have set it up and shops that have not. */
      api
        .get<ProviderStatus>('/auth/providers')
        .then((status) => {
          configureGoogle(status.google.enabled ? status.google.webClientId : null);
          setProviders({
            google: status.google.enabled && providerAvailable('google'),
            apple: status.apple.enabled && providerAvailable('apple'),
          });
        })
        .catch(() => {
          /* Without this the password form still works, which is the point. */
        });

      const { accessToken } = await auth.load();
      if (accessToken) {
        try {
          adopt(await api.get<Session>('/auth/me'));
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
    adopt(data);
  }, [adopt]);

  const register = useCallback(
    async (input: {
      name: string;
      email: string;
      password: string;
      phone: string;
      dateOfBirth: string;
      visitFrequencyWeeks: number;
      /* Present only when the shop asks for verification. The server decides
         whether its absence is allowed — the app never gets to skip it. */
      verificationToken?: string;
    }) => {
      const data = await api.post<Session & { accessToken: string; refreshToken: string }>(
        '/auth/register',
        input,
      );
      await auth.set(data);
      adopt(data);
    },
    [adopt],
  );

  /**
   * Sign in with Google or Apple.
   *
   * The provider hands back an identity token and nothing more; the server is
   * what decides whose account that is. Backing out of the sheet is not an
   * error — the person knows they did it — so it resolves quietly rather than
   * putting a dialog in front of somebody who just changed their mind.
   */
  const signInWith = useCallback(
    async (provider: Provider) => {
      let result;
      try {
        result = await signInWithProvider(provider);
      } catch (err) {
        if (err instanceof SignInCancelled) return;
        throw err;
      }
      const data = await api.post<Session & { accessToken: string; refreshToken: string }>(
        '/auth/social',
        { provider, idToken: result.idToken, ...(result.name ? { name: result.name } : {}) },
      );
      await auth.set(data);
      adopt(data);
    },
    [adopt],
  );

  const refreshUser = useCallback(async () => {
    const session = await api.get<Session>('/auth/me');
    setUser(session.user);
    setArtist(session.artist ?? null);
    setProfileComplete(session.profileComplete ?? true);
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
      signInWith,
      providers,
      profileComplete,
      signOut,
      updateUser: (patch: Partial<User>) =>
        setUser((u) => (u ? { ...u, ...patch } : u)),
      refreshUser,
    }),
    [user, artist, config, booting, providers, profileComplete, signIn, register, signInWith, signOut, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
