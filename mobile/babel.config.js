module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    /**
     * Substitutes `process.env.API_URL` with the value in the environment at
     * the moment the bundle is built.
     *
     * React Native has no `process.env` at runtime — the preset does not inline
     * anything beyond NODE_ENV, so without this the reference is `undefined`,
     * the fallback in config.ts always wins, and an override appears to be
     * ignored for no visible reason.
     *
     * `include` is a deliberate allow-list of one. Inlining the whole
     * environment would bake whatever happens to be exported in the shell that
     * ran the build — tokens included — into a JavaScript bundle that ships.
     */
    [
      'transform-inline-environment-variables',
      {
        include: ['API_URL'],
      },
    ],
  ],
};
