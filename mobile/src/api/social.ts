import { Platform } from 'react-native';

/**
 * Getting an identity token out of Google or Apple.
 *
 * Only that. What comes back goes straight to `POST /auth/social`, which
 * verifies it against the provider's own public keys and takes it from there —
 * the app is never trusted about who somebody is, because a token is the only
 * part of this a client cannot forge.
 *
 * Loaded at runtime rather than imported, on the same terms as the Firebase
 * adapter: these are native modules, and a build without them (or without the
 * OAuth client ids they need) must still run. Both providers simply report
 * themselves unavailable and the email-and-password form carries on as before.
 */

export type Provider = 'google' | 'apple';

export interface ProviderResult {
  idToken: string;
  /** Apple gives the name once, at the very first authorisation, and never again. */
  name?: string;
}

/* Supplied by the server so one build can serve shops with different set-ups,
   and so a client id is never a thing somebody has to edit in source. */
let googleWebClientId: string | null = null;
export function configureGoogle(webClientId: string | null) {
  googleWebClientId = webClientId;
  googleConfigured = false;
}

let googleModule: any | undefined;
let googleConfigured = false;

function google(): any | null {
  if (googleModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      googleModule = require('@react-native-google-signin/google-signin');
    } catch {
      googleModule = null;
    }
  }
  if (!googleModule || !googleWebClientId) return null;

  if (!googleConfigured) {
    /* `webClientId` is the *web* OAuth client, even on Android — it is the
       audience Google puts in the id token, and using the Android client id
       here is the classic reason a sign-in succeeds on the phone and is then
       rejected by the server. */
    googleModule.GoogleSignin.configure({ webClientId: googleWebClientId });
    googleConfigured = true;
  }
  return googleModule;
}

let appleModule: any | undefined;

function apple(): any | null {
  /* Sign in with Apple on Android means a web redirect flow and a paid Apple
     developer account; on iOS it is a native sheet. Only iOS is offered. */
  if (Platform.OS !== 'ios') return null;
  if (appleModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      appleModule = require('@invertase/react-native-apple-authentication');
    } catch {
      appleModule = null;
    }
  }
  return appleModule?.appleAuth?.isSupported ? appleModule : null;
}

/** Which providers this build can actually offer, before asking the server. */
export const providerAvailable = (provider: Provider): boolean =>
  provider === 'google' ? google() !== null : apple() !== null;

/** Thrown when the person backed out. Nothing to report — they know. */
export class SignInCancelled extends Error {}

export async function signInWithProvider(provider: Provider): Promise<ProviderResult> {
  return provider === 'google' ? withGoogle() : withApple();
}

async function withGoogle(): Promise<ProviderResult> {
  const mod = google();
  if (!mod) throw new Error('Google sign-in is not available on this build');

  const { GoogleSignin, statusCodes } = mod;
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result = await GoogleSignin.signIn();

    /* The shape moved in v13: the token used to sit at the top level and now
       sits under `data`. Reading both means the version bump is not a silent
       "sign-in does nothing". */
    const idToken = result?.data?.idToken ?? result?.idToken;
    if (!idToken) throw new Error('Google did not return a sign-in token');

    return { idToken, name: result?.data?.user?.name ?? result?.user?.name };
  } catch (err: any) {
    if (err?.code === statusCodes?.SIGN_IN_CANCELLED) throw new SignInCancelled();
    throw err;
  }
}

async function withApple(): Promise<ProviderResult> {
  const mod = apple();
  if (!mod) throw new Error('Apple sign-in is not available on this device');

  const { appleAuth } = mod;
  const response = await appleAuth.performRequest({
    requestedOperation: appleAuth.Operation.LOGIN,
    requestedScopes: [appleAuth.Scope.FULL_NAME, appleAuth.Scope.EMAIL],
  });

  if (!response.identityToken) throw new SignInCancelled();

  /* Apple sends the name only on the very first authorisation for this app,
     ever — reinstalling does not bring it back. If it is not captured now it is
     gone, so it goes to the server on this one request. */
  const { givenName, familyName } = response.fullName ?? {};
  const name = [givenName, familyName].filter(Boolean).join(' ').trim();

  return { idToken: response.identityToken, name: name || undefined };
}
