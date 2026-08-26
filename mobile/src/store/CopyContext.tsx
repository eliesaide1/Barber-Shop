import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { api } from '../api/client';
import { getSocket } from '../api/socket';

/**
 * Interface copy the shop can rewrite.
 *
 * Every label is asked for with the words the app shipped with:
 *
 *     t('auth.signIn', 'Sign in')
 *
 * which is the whole design. The default lives at the call site rather than in
 * a translations file, so there is no second list to keep in step and no way to
 * end up with a screen of blank buttons — a first launch, a dead network, a key
 * the shop has never touched and a server that is down all render the same
 * words, because those words are in the binary.
 *
 * What comes back from the server is only the overrides, so a shop that has
 * changed nothing costs one request returning `{}`.
 */
const KEY = 'faderoom.labels';

type Overrides = Record<string, string>;

interface CopyValue {
  t: (key: string, fallback: string) => string;
  /** Overrides currently in force — for the debug screen, not for rendering. */
  overrides: Overrides;
}

const CopyContext = createContext<CopyValue | null>(null);

export function CopyProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<Overrides>({});

  /* Kept on the device so the shop's wording survives a cold start with no
     network. Without it the app would flash the built-in words and then correct
     itself a moment later, on every single launch. */
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') setOverrides(parsed);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    api
      .get<Overrides>('/labels')
      .then((next) => {
        setOverrides(next ?? {});
        AsyncStorage.setItem(KEY, JSON.stringify(next ?? {})).catch(() => {});
      })
      .catch(() => {
        /* Silent: the app is fully readable without this, which is the point. */
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /* The same three moments as the shop's settings: now, when an admin saves,
     and when the app comes back from the background having missed the event. */
  useEffect(() => {
    const socket = getSocket();
    const onChanged = () => load();
    socket?.on('labels:changed', onChanged);

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') load();
    });

    return () => {
      socket?.off('labels:changed', onChanged);
      sub.remove();
    };
  }, [load]);

  const value = useMemo<CopyValue>(
    () => ({
      /* An override of '' means the shop cleared the box, which is how a label
         is put back to what it was — so an empty string falls through to the
         default rather than rendering nothing. */
      t: (key, fallback) => overrides[key] || fallback,
      overrides,
    }),
    [overrides],
  );

  return <CopyContext.Provider value={value}>{children}</CopyContext.Provider>;
}

export function useCopy() {
  const ctx = useContext(CopyContext);
  /* Deliberately not throwing. A label is not worth a blank screen: outside the
     provider — a test rendering one component, say — every call returns the
     words the app shipped with, which is exactly the fallback behaviour. */
  return ctx ?? { t: (_key: string, fallback: string) => fallback, overrides: {} };
}

/** Shorthand for the common case. */
export const useT = () => useCopy().t;
