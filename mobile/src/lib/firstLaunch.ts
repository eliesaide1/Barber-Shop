import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Whether the walkthrough has been seen.
 *
 * Stored under the same `faderoom.` prefix as the theme and the cart, and
 * deliberately outside the session: signing out is not a reason to be shown
 * the introduction again, and neither is deleting the account and starting
 * over on the same phone. It is a fact about the install, not about the user.
 */
const KEY = 'faderoom.firstLogin';

export type LaunchState = 'loading' | 'first' | 'returning';

export function useFirstLaunch() {
  const [state, setState] = useState<LaunchState>('loading');

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(KEY)
      /* Absent means nobody has finished the walkthrough on this install —
         which is a first launch. Anything else means they have. */
      .then((v) => !cancelled && setState(v === 'false' ? 'returning' : 'first'))
      /* If storage cannot be read at all, skip rather than show. A failing
         read fails the same way on every launch, and a walkthrough that
         reappears forever is worse than one that is missed once. */
      .catch(() => !cancelled && setState('returning'));

    return () => {
      cancelled = true;
    };
  }, []);

  /* The screen goes first and the write follows. AsyncStorage is a round trip
     to native, and making the last tap of the walkthrough wait on it would put
     a visible pause between the checkmark and the sign-in screen. */
  const complete = useCallback(async () => {
    setState('returning');
    try {
      await AsyncStorage.setItem(KEY, 'false');
    } catch {
      /* Nothing to do — worst case it is shown once more next launch. */
    }
  }, []);

  return { state, complete };
}
