/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { setPushAdapter } from './src/api/push';
import { firebaseAdapter, firebaseAvailable, installFirebaseBackgroundHandler } from './src/api/pushFirebase';

/* Before the component registers, not inside it: the OS can start this app
   headless just to hand over a message, in which case no component ever mounts.
   Both calls no-op when Firebase isn't installed or configured, so a build
   without credentials behaves exactly as it did — socket delivery only. */
if (firebaseAvailable()) {
  setPushAdapter(firebaseAdapter);
  installFirebaseBackgroundHandler();
}

AppRegistry.registerComponent(appName, () => App);
