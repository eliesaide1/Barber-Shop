import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Theme, ThemeName, themes } from '../theme';

const KEY = 'faderoom.theme';

interface ThemeContextValue {
  theme: Theme;
  name: ThemeName;
  /** null = follow the phone's setting */
  preference: ThemeName | null;
  setPreference: (p: ThemeName | null) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<ThemeName | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => {
      if (v === 'light' || v === 'dark') setPref(v);
    });
  }, []);

  const setPreference = (p: ThemeName | null) => {
    setPref(p);
    if (p) AsyncStorage.setItem(KEY, p);
    else AsyncStorage.removeItem(KEY);
  };

  const name: ThemeName = preference ?? (system === 'dark' ? 'dark' : 'light');

  const value = useMemo(
    () => ({
      theme: themes[name],
      name,
      preference,
      setPreference,
      toggle: () => setPreference(name === 'dark' ? 'light' : 'dark'),
    }),
    [name, preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

/** Shorthand — most components only want the palette. */
export const useColors = () => useTheme().theme;
