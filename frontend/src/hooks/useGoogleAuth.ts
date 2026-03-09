import * as Google from 'expo-auth-session/providers/google';
import { makeRedirectUri } from 'expo-auth-session';

// The reversed iOS client ID is the URL scheme registered in Google Cloud Console.
// Dev and prod use different OAuth client IDs, so the redirect scheme must match.
const IS_DEV = process.env.EXPO_PUBLIC_APP_VARIANT === 'development';
const IOS_CLIENT_ID = IS_DEV
  ? (process.env.EXPO_PUBLIC_GOOGLE_IOS_DEV_CLIENT_ID ?? '')
  : (process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '');
const REVERSED_IOS_CLIENT_ID = IOS_CLIENT_ID
  ? `com.googleusercontent.apps.${IOS_CLIENT_ID.replace('.apps.googleusercontent.com', '')}`
  : 'com.googleusercontent.apps.265741649084-vabnoi82qr737r6fk6d1b462mb7qo9vv';

export const googleRedirectUri = makeRedirectUri({
  native: `${REVERSED_IOS_CLIENT_ID}:/oauth2redirect`,
});

export function useGoogleAuth() {
  // Use authorization code flow (PKCE) — more reliable than implicit grant on iOS.
  // The implicit grant puts the id_token in the URL fragment, which iOS URL scheme
  // handlers can silently drop. Code flow puts the code in the query string (safe).
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
    iosClientId: IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '',
    scopes: ['openid', 'email', 'profile'],
    redirectUri: googleRedirectUri,
  });

  return { request, response, promptAsync };
}
