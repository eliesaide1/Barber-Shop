import type { Fulfilment } from '../types';

export type RootStackParamList = {
  Tabs: undefined;
  Product: { id: string };
  Cart: undefined;
  Loyalty: undefined;
  Appointments: undefined;
  Notifications: undefined;
  Preferences: undefined;
  Lookbook: undefined;
  Haircuts: undefined;
  Device: undefined;
  Privacy: undefined;
  /* Sign-in lives in the client stack rather than in front of it, because the
     app is browsable without an account: it is a screen you are sent to when
     you reach for something personal, not a wall you start behind.
     `reason` is what to say at the top of it. */
  Login: { reason?: string } | undefined;
  Register: undefined;
};

export type TabParamList = {
  Home: undefined;
  Book: undefined;
  Scan: undefined;
  Shop: undefined;
  Profile: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

/* ---------------- artist portal ---------------- */

export type ArtistStackParamList = {
  ArtistTabs: undefined;
  Broadcast: undefined;
  Portfolio: undefined;
  Device: undefined;
  Privacy: undefined;
  /* Params rather than a fetch: the client book already has these, and the
     screen should not re-request what the caller is holding. */
  ClientHistory: {
    userId: string;
    name?: string;
    phone?: string;
    dateOfBirth?: string;
    visitFrequencyWeeks?: number | null;
  };
  Notifications: undefined;
};

export type ArtistTabParamList = {
  Today: undefined;
  Requests: undefined;
  CheckIn: undefined;
  Clients: undefined;
  More: undefined;
};
