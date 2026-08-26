import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}) },
}));

jest.mock('react-native-device-info', () => ({
  __esModule: true,
  default: {
    getUniqueId: jest.fn(async () => 'install-abc'),
    getVersion: () => '1.1',
    getBuildNumber: () => '7',
    getModel: () => 'iPhone 17 Pro',
  },
}));

import { ThemeProvider } from '../src/store/ThemeContext';
import { DeviceScreen } from '../src/screens/DeviceScreen';

jest.mock('../src/store/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Marc', email: 'marc@faderoom.app', role: 'client' },
    artist: null,
    isArtist: false,
  }),
}));

it('shows the device, the app version and who is signed in', async () => {
  let tree: any;
  await act(async () => {
    tree = renderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, left: 0, right: 0, bottom: 34 },
        }}
      >
        <ThemeProvider>
          <DeviceScreen />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  const json = JSON.stringify(tree.toJSON());
  for (const t of ['iOS', 'iPhone 17 Pro', '1.1', 'Marc', 'marc@faderoom.app', 'Client']) {
    expect(json).toContain(t);
  }
});
