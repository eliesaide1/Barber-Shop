import type { Fulfilment } from '../types';

export type RootStackParamList = {
  Tabs: undefined;
  Product: { id: string };
  Cart: undefined;
  /* Carried over from the cart so the choice survives the hop. */
  Checkout: { fulfilment?: Fulfilment } | undefined;
  Orders: undefined;
  /* `justPlaced` swaps the header for a confirmation panel. */
  OrderDetail: { id: string; justPlaced?: boolean };
  Loyalty: undefined;
  Appointments: undefined;
  Notifications: undefined;
  Preferences: undefined;
  Lookbook: undefined;
  Haircuts: undefined;
  Device: undefined;
  Privacy: undefined;
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
  Clients: undefined;
  CheckIn: undefined;
  Orders: undefined;
  More: undefined;
};
