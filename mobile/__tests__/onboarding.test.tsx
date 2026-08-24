import React from 'react';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}) },
}));

import renderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/store/ThemeContext';
import { OnboardingScreen } from '../src/screens/OnboardingScreen';

it('renders all four slides and the finish button', async () => {
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
          <OnboardingScreen onDone={() => {}} />
        </ThemeProvider>
      </SafeAreaProvider>,
    );
  });
  const first = JSON.stringify(tree.toJSON());
  for (const t of [
    'Ask for a chair',
    'Scan when you arrive',
    'Every eighth cut is on us',
    'Shop the shelf',
  ]) {
    expect(first).toContain(t);
  }
  // the finish button belongs to the last slide only; Skip is there throughout
  expect(first).not.toContain('Get started');
  expect(first).toContain('Skip');

  // swipe to the fourth page
  const scroll = tree.root.findByType(require('react-native').ScrollView);
  await act(async () => {
    scroll.props.onMomentumScrollEnd({
      nativeEvent: { contentOffset: { x: require('react-native').Dimensions.get('window').width * 3 } },
    });
  });
  expect(JSON.stringify(tree.toJSON())).toContain('Get started');
});
