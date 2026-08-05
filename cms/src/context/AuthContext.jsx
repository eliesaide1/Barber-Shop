import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { get, post, tokens } from '../lib/api.js';
import { connectSocket, disconnectSocket } from '../lib/socket.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(() => {
    tokens.clear();
    disconnectSocket();
    setSession(null);
  }, []);

  /* The API client fires this when a refresh fails for good. */
  useEffect(() => {
    window.addEventListener('faderoom:signed-out', signOut);
    return () => window.removeEventListener('faderoom:signed-out', signOut);
  }, [signOut]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!tokens.access) {
        setLoading(false);
        return;
      }
      try {
        const me = await get('/auth/me');
        if (!alive) return;
        setSession(me);
        connectSocket();
      } catch {
        tokens.clear();
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback(async (email, password) => {
    const data = await post('/auth/login', { email, password });
    /* The back office is for staff. A client account has no seat here. */
    if (!['artist', 'admin'].includes(data.user.role)) {
      throw new Error('This account has no back-office access');
    }
    tokens.set(data);
    setSession({ user: data.user, artist: data.artist });
    connectSocket();
    return data;
  }, []);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      artist: session?.artist ?? null,
      isAdmin: session?.user?.role === 'admin',
      loading,
      signIn,
      signOut,
    }),
    [session, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
