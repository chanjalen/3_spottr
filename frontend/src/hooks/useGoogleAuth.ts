import * as Google from 'expo-auth-session/providers/google';
import { makeRedirectUri } from 'expo-auth-session';

// The reversed iOS client ID is the URL scheme used by Google's native iOS credential.
const REVERSED_IOS_CLIENT_ID =
  'com.googleusercontent.apps.265741649084-vabnoi82qr737r6fk6d1b462mb7qo9vv';

export const googleRedirectUri = makeRedirectUri({
  native: `${REVERSED_IOS_CLIENT_ID}:/oauth2redirect`,
});

export function useGoogleAuth() {
  // Use authorization code flow (PKCE) — more reliable than implicit grant on iOS.
  // The implicit grant puts the id_token in the URL fragment, which iOS URL scheme
  // handlers can silently drop. Code flow puts the code in the query string (safe).
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '',
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '',
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '',
    scopes: ['openid', 'email', 'profile'],
    redirectUri: googleRedirectUri,
  });

  return { request, response, promptAsync };
}
