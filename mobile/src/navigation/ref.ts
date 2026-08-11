import { createNavigationContainerRef } from '@react-navigation/native';

/**
 * A navigation handle usable from outside the tree.
 *
 * The notifications provider wraps the navigator (it has to — the banner must
 * float above every screen), so it cannot use `useNavigation`. This is how a
 * tapped banner still opens the inbox.
 */
export const navigationRef = createNavigationContainerRef<Record<string, object | undefined>>();

export function navigate(name: string, params?: object) {
  /* Silently ignore navigation before the tree is ready — a message can land
     during the split second the app is still mounting. */
  if (!navigationRef.isReady()) return;
  /* The ref is typed against a generic route map, so the tuple overload can't
     be resolved statically. The route names are checked where they're used. */
  (navigationRef.navigate as (n: string, p?: object) => void)(name, params);
}

/* A tab has to be reached through its navigator; a stack screen is named
   directly. `Orders` sits in both trees and means different things in each,
   which is why the portal has to be passed in rather than guessed. */
const CLIENT_TABS = ['Home', 'Book', 'Scan', 'Shop', 'Profile'];
const CLIENT_SCREENS = [
  'Product', 'Cart', 'Checkout', 'Orders', 'OrderDetail',
  'Loyalty', 'Appointments', 'Notifications', 'Preferences', 'Lookbook',
];
const ARTIST_TABS = ['Today', 'Clients', 'CheckIn', 'Orders', 'More'];
const ARTIST_SCREENS = ['Broadcast', 'Portfolio', 'Notifications'];

/**
 * Open what a notification is about.
 *
 * A notification with nowhere to go is half a notification — being told an order
 * is ready and then having to find it yourself is worse than not being told. So
 * every system message carries a `data.screen`, and this is where that becomes
 * a destination.
 *
 * Anything unrecognised falls back to the inbox, which exists in both portals:
 * a message addressed to the wrong tree should still land somewhere readable
 * rather than nowhere at all.
 */
export function openNotification(
  data: { screen?: string; id?: string } | undefined,
  isArtist: boolean,
) {
  const screen = data?.screen;
  const tabs = isArtist ? ARTIST_TABS : CLIENT_TABS;
  const screens = isArtist ? ARTIST_SCREENS : CLIENT_SCREENS;

  if (!screen) return navigate('Notifications');
  if (tabs.includes(screen)) {
    return navigate(isArtist ? 'ArtistTabs' : 'Tabs', { screen });
  }
  if (screens.includes(screen)) {
    return navigate(screen, data?.id ? { id: data.id } : undefined);
  }
  return navigate('Notifications');
}
