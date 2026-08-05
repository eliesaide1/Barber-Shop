/**
 * FadeRoom — client app.
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
import { CartProvider } from './src/store/CartContext';
import { RootNavigator } from './src/navigation/RootNavigator';

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
            <CartProvider>
              <RootNavigator />
            </CartProvider>
          </AuthProvider>
        </DialogProvider>
      </ToastProvider>
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
