import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      mockStore[k] = v;
    }),
  },
}));

const mockGet = jest.fn();
jest.mock('../src/api/client', () => ({ api: { get: (...a: any[]) => mockGet(...a) } }));
jest.mock('../src/api/socket', () => ({
  getSocket: () => null,
  /* Returns its unsubscribe, like the real one — a provider that unmounts
     would otherwise throw on cleanup and the failure would look like the
     component's. */
  onSocketEvent: () => () => {},
}));

import { CopyProvider, useT } from '../src/store/CopyContext';

function Label({ k, d }: { k: string; d: string }) {
  const t = useT();
  return <Text>{t(k, d)}</Text>;
}

const show = async (node: React.ReactElement) => {
  let tree: any;
  await act(async () => {
    tree = renderer.create(node);
  });
  return JSON.stringify(tree.toJSON());
};

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  mockGet.mockReset();
});

it('renders the words the app shipped with when nothing is overridden', async () => {
  mockGet.mockResolvedValue({});
  const json = await show(
    <CopyProvider>
      <Label k="auth.signIn" d="Sign in" />
    </CopyProvider>,
  );
  expect(json).toContain('Sign in');
});

it('prefers the shop wording over the default', async () => {
  mockGet.mockResolvedValue({ 'auth.signIn': 'Log in' });
  const json = await show(
    <CopyProvider>
      <Label k="auth.signIn" d="Sign in" />
    </CopyProvider>,
  );
  expect(json).toContain('Log in');
  expect(json).not.toContain('Sign in');
});

it('treats a cleared override as a reset, not as empty text', async () => {
  mockGet.mockResolvedValue({ 'auth.signIn': '' });
  const json = await show(
    <CopyProvider>
      <Label k="auth.signIn" d="Sign in" />
    </CopyProvider>,
  );
  expect(json).toContain('Sign in');
});

it('still renders when the server is unreachable', async () => {
  mockGet.mockRejectedValue(new Error('offline'));
  const json = await show(
    <CopyProvider>
      <Label k="auth.signIn" d="Sign in" />
    </CopyProvider>,
  );
  expect(json).toContain('Sign in');
});

it('renders outside the provider rather than throwing', async () => {
  expect(await show(<Label k="auth.signIn" d="Sign in" />)).toContain('Sign in');
});
