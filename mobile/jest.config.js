module.exports = {
  preset: '@react-native/jest-preset',
  /* The preset only transforms `react-native` and `@react-native-community`,
     and these three ship ES modules that Node cannot load as-is. Anything that
     renders a screen pulls in all of them. */
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?@?react-native|@react-native-async-storage|react-native-svg|react-native-safe-area-context)',
  ],
};
