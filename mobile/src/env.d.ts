/**
 * The one build-time variable this app reads.
 *
 * Declared by hand rather than by installing `@types/node`, which would assert
 * that the whole Node standard library — `fs`, `path`, `Buffer` — is available
 * inside a React Native bundle, where none of it is. The type is as narrow as
 * the reality: one optional string, substituted by the Babel plugin in
 * babel.config.js and absent unless someone exported it when Metro started.
 *
 * Optional, not required, because that is the normal case — the default in
 * config.ts is what runs when nobody sets it.
 */
declare const process: {
  env: {
    API_URL?: string;
  };
};
