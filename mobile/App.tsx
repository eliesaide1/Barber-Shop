/**
 * VIA Barber House — client app.
 *
 * Provider order matters: Theme sits outermost so everything below can read
 * the palette, and Toast sits above Auth so a forced sign-out can still
 * surface a message.
 */
import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider, useColors } from './src/store/ThemeContext';
import { ToastProvider } from './src/store/ToastContext';
import { DialogProvider } from './src/store/DialogContext';
import { AuthProvider } from './src/store/AuthContext';
import { CopyProvider } from './src/store/CopyContext';
import { CartProvider } from './src/store/CartContext';
import { NotificationsProvider } from './src/store/NotificationsContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { AnimatedSplash } from './src/components/AnimatedSplash';

function Shell() {
  const c = useColors();
  return (
    <>
      <StatusBar
        barStyle={c.name === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={c.bg}
      />
      <ToastProvider>
        <DialogProvider>
          <AuthProvider>
            {/* Inside Auth, because the socket it listens on is opened by the
                session — and above everything that draws, because everything
                that draws asks it for its words. */}
            <CopyProvider>
            <CartProvider>
              <NotificationsProvider>
                <RootNavigator />
              </NotificationsProvider>
            </CartProvider>
            </CopyProvider>
          </AuthProvider>
        </DialogProvider>
      </ToastProvider>
      {/* Last child, so it paints over the app rather than under it. Outside
          the providers too — it needs nothing from them, and it has to be on
          screen before any of them have resolved. */}
      <AnimatedSplash />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
