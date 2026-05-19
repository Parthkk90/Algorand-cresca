const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Add polyfills for Node.js core modules
config.resolver.alias = {
  crypto: 'react-native-crypto',
  stream: 'readable-stream',
  buffer: '@craftzdog/react-native-buffer',
};

config.resolver.fallback = {
  crypto: require.resolve('react-native-crypto'),
  stream: require.resolve('readable-stream'),
  buffer: require.resolve('buffer'),
};

// Fix @noble/hashes "not listed in exports" warning
config.resolver.unstable_enablePackageExports = true;

// Some deps (algosdk / @walletconnect) request `@noble/hashes/crypto.js`,
// but the package's `exports` field only declares `./crypto` (no .js).
// Rewrite the request so package-exports resolution succeeds cleanly.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@noble/hashes/crypto.js') {
    return context.resolveRequest(context, '@noble/hashes/crypto', platform);
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;