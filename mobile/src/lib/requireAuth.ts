import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';

import { useAuth } from '../store/AuthContext';

/**
 * "You need an account for this bit."
 *
 * The app is browsable without one — the barbers, the price list, the shelf and
 * the lookbook are the shop's shopfront and belong to nobody. This is what
 * guards the other half: a booking, a stamp, a profile, a saved style. Each of
 * those belongs to a person, and Apple's 5.1.1(v) is the line between them.
 *
 * Used as a guard at the top of an action rather than as a wrapper around a
 * screen, so somebody can read the whole booking form, choose an artist, a
 * service and a time, and only meet the question when they ask for it. Being
 * stopped after deciding is far easier to accept than being stopped before
 * looking.
 *
 *     const requireAuth = useRequireAuth();
 *     if (!requireAuth('Sign in to book a chair')) return;
 *
 * Returns true when there is a session and the caller should carry on; false
 * when it has sent them to sign in instead.
 */
export function useRequireAuth() {
  const { user } = useAuth();
  const nav = useNavigation<any>();

  return useCallback(
    (reason?: string) => {
      if (user) return true;
      /* The reason travels with them, so the sign-in screen can say what it is
         for rather than appearing out of nowhere. */
      nav.navigate('Login', reason ? { reason } : undefined);
      return false;
    },
    [user, nav],
  );
}
