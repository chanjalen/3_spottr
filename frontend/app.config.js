const { expo } = require('./app.json');

const IS_DEV = process.env.EXPO_PUBLIC_APP_VARIANT === 'development';

// Google OAuth URL scheme = client ID with .apps.googleusercontent.com stripped,
// prepended with com.googleusercontent.apps.
// e.g. 265741649084-abc123.apps.googleusercontent.com → com.googleusercontent.apps.265741649084-abc123
const devClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_DEV_CLIENT_ID ?? '';
const devGoogleScheme = devClientId
  ? `com.googleusercontent.apps.${devClientId.replace('.apps.googleusercontent.com', '')}`
  : null;

module.exports = {
  ...expo,
  name: IS_DEV ? 'Spottr (Dev)' : expo.name,
  ios: {
    ...expo.ios,
    bundleIdentifier: IS_DEV ? 'app.spottr.mobile.dev' : expo.ios.bundleIdentifier,
    infoPlist: {
      ...expo.ios.infoPlist,
      CFBundleURLTypes: [
        ...(expo.ios.infoPlist?.CFBundleURLTypes ?? []),
        ...(IS_DEV && devGoogleScheme ? [{ CFBundleURLSchemes: [devGoogleScheme] }] : []),
      ],
    },
  },
};
