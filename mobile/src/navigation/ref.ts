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
