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
  Notifications: undefined;
};

export type ArtistTabParamList = {
  Today: undefined;
  Clients: undefined;
  CheckIn: undefined;
  Orders: undefined;
  More: undefined;
};
