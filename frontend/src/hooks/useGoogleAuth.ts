import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { makeRedirectUri } from 'expo-auth-session';

// Required so the browser session closes properly on iOS after redirect
WebBrowser.maybeCompleteAuthSession();

// The reversed iOS client ID is the redirect URI that Google's iOS credential
// type expects. Google auto-accepts this without needing it registered manually.
const REVERSED_IOS_CLIENT_ID =
  'com.googleusercontent.apps.265741649084-vabnoi82qr737r6fk6d1b462mb7qo9vv';

const redirectUri = makeRedirectUri({
  native: `${REVERSED_IOS_CLIENT_ID}:/oauth2redirect`,
});

export function useGoogleAuth() {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    redirectUri,
  });

  return { request, response, promptAsync };
}
