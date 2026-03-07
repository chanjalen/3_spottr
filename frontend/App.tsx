import React from 'react';
import * as WebBrowser from 'expo-web-browser';
import { StatusBar } from 'expo-status-bar';

// Required for expo-auth-session (Google OAuth) to close the browser on redirect
WebBrowser.maybeCompleteAuthSession();
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { AuthProvider, useAuth } from './src/store/AuthContext';
import { UnreadCountProvider } from './src/store/UnreadCountContext';
import { ActiveWorkoutProvider } from './src/store/ActiveWorkoutContext';
import { TutorialProvider } from './src/store/TutorialContext';
import TutorialOverlay from './src/components/tutorial/TutorialOverlay';
import { usePushNotifications } from './src/hooks/usePushNotifications';
import ActiveWorkoutBanner from './src/components/navigation/ActiveWorkoutBanner';
import MainTabs from './src/navigation/MainTabs';
import LoginScreen from './src/screens/auth/LoginScreen';
import SignupScreen from './src/screens/auth/SignupScreen';
import EmailVerificationScreen from './src/screens/auth/EmailVerificationScreen';
import ForgotPasswordScreen from './src/screens/auth/ForgotPasswordScreen';
import ResetPasswordScreen from './src/screens/auth/ResetPasswordScreen';
import OnboardingStep1Screen from './src/screens/onboarding/OnboardingStep1Screen';
import OnboardingStep2Screen from './src/screens/onboarding/OnboardingStep2Screen';
import OnboardingStep3Screen from './src/screens/onboarding/OnboardingStep3Screen';
import OnboardingStep4Screen from './src/screens/onboarding/OnboardingStep4Screen';
import OnboardingCompleteScreen from './src/screens/onboarding/OnboardingCompleteScreen';
import { colors } from './src/theme';
import { AuthStackParamList, OnboardingStackParamList, RootStackParamList } from './src/navigation/types';

const navigationRef = createNavigationContainerRef<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background.base,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.border.default,
    notification: colors.primary,
  },
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const OnboardingStack = createNativeStackNavigator<OnboardingStackParamList>();
const VerificationStack = createNativeStackNavigator<AuthStackParamList>();

/** Shown when the user has a token but never verified their email (onboarding_step === 0). */
function VerificationNavigator() {
  const { token, user } = useAuth();
  return (
    <VerificationStack.Navigator screenOptions={{ headerShown: false }}>
      <VerificationStack.Screen
        name="EmailVerification"
        component={EmailVerificationScreen}
        initialParams={{
          email: user?.email ?? '',
          token: token ?? '',
          autoResend: true,
        }}
      />
    </VerificationStack.Navigator>
  );
}

function OnboardingNavigator() {
  const { user } = useAuth();
  const step = user?.onboarding_step ?? 1;

  const initialRoute: keyof OnboardingStackParamList =
    step <= 1 ? 'OnboardingStep1' :
    step === 2 ? 'OnboardingStep2' :
    step === 3 ? 'OnboardingStep3' :
    step === 4 ? 'OnboardingStep4' :
    'OnboardingStep1';

  return (
    <OnboardingStack.Navigator
      id="OnboardingStack"
      initialRouteName={initialRoute}
      screenOptions={{ headerShown: false }}
    >
      <OnboardingStack.Screen name="OnboardingStep1" component={OnboardingStep1Screen} />
      <OnboardingStack.Screen name="OnboardingStep2" component={OnboardingStep2Screen} />
      <OnboardingStack.Screen name="OnboardingStep3" component={OnboardingStep3Screen} />
      <OnboardingStack.Screen name="OnboardingStep4" component={OnboardingStep4Screen} />
      <OnboardingStack.Screen name="OnboardingComplete" component={OnboardingCompleteScreen} />
    </OnboardingStack.Navigator>
  );
}

function RootNavigator() {
  const { token, user, isLoading } = useAuth();
  usePushNotifications(navigationRef, !!(token && user && (user.onboarding_step ?? 5) >= 5));

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!token) {
    return (
      <AuthStack.Navigator id="AuthStack" screenOptions={{ headerShown: false }}>
        <AuthStack.Screen name="Login" component={LoginScreen} />
        <AuthStack.Screen name="Signup" component={SignupScreen} />
        <AuthStack.Screen name="EmailVerification" component={EmailVerificationScreen} />
        <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <AuthStack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      </AuthStack.Navigator>
    );
  }

  const onboardingStep = user?.onboarding_step ?? 5;

  // Token exists but email never verified — send a fresh code and show verification.
  if (onboardingStep === 0) {
    return <VerificationNavigator />;
  }

  if (onboardingStep < 5) {
    return <OnboardingNavigator />;
  }

  return <MainTabs />;
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <SafeAreaProvider>
          <AuthProvider>
            <TutorialProvider>
              <ActiveWorkoutProvider>
                <UnreadCountProvider>
                  <NavigationContainer theme={navTheme} ref={navigationRef}>
                    <RootNavigator />
                    <StatusBar style="dark" />
                  </NavigationContainer>
                  <ActiveWorkoutBanner navigationRef={navigationRef} />
                </UnreadCountProvider>
              </ActiveWorkoutProvider>
              <TutorialOverlay />
            </TutorialProvider>
          </AuthProvider>
        </SafeAreaProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.background.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
