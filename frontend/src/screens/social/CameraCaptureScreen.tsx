import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../navigation/types';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, typography } from '../../theme';
import { fetchRecentWorkouts } from '../../api/workouts';
import {
  CameraView,
  CameraType,
  useCameraPermissions,
  useMicrophonePermissions,
} from 'expo-camera';

import { RouteProp, useFocusEffect, CommonActions } from '@react-navigation/native';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CameraCapture'>;
  route: RouteProp<RootStackParamList, 'CameraCapture'>;
};

const MAX_VIDEO_DURATION = 30; // seconds


export default function CameraCaptureScreen({ navigation, route }: Props) {
  const fromCheckinReview = route.params?.fromCheckinReview ?? false;
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  // cameraKey increments only on user-initiated flip, NOT during dual capture
  // This avoids crashing by not tearing down the active session mid-capture
  const [cameraKey, setCameraKey] = useState(0);
  const [isDualCamera, setIsDualCamera] = useState(false);
  const [isDualCapturing, setIsDualCapturing] = useState(false);
  // Resolves when camera reports ready — used to await facing change during dual capture
  const cameraReadyResolverRef = useRef<(() => void) | null>(null);
  // Ref mirrors isCameraReady state so async dual-capture code reads the live value
  const isCameraReadyRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const navigatedToWorkoutRef = useRef(false);
  const isCapturingRef = useRef(false);
  // Guards against multiple rapid taps on the stop button
  const isStoppingRef = useRef(false);
  // Tracks last tap time for double-tap-to-flip detection
  const lastTapRef = useRef(0);
  // Shows a spinner between recording stop and navigation
  const [isFinalizingVideo, setIsFinalizingVideo] = useState(false);

  // Mount/unmount CameraView on focus so it always initializes fresh
  const [isFocused, setIsFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      isCameraReadyRef.current = false;
      setIsCameraReady(false);
      return () => {
        if (isCapturingRef.current) return;
        setIsFocused(false);
        isCameraReadyRef.current = false;
        setIsCameraReady(false);
      };
    }, []),
  );

  const shutterScale = useSharedValue(1);
  const shutterRingScale = useSharedValue(1);
  const progressAnim = useSharedValue(0);

  const shutterStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shutterScale.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shutterRingScale.value }],
  }));

  useEffect(() => {
    (async () => {
      if (!cameraPermission?.granted) await requestCameraPermission();
      if (!micPermission?.granted) await requestMicPermission();
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', async () => {
      if (!navigatedToWorkoutRef.current) return;
      navigatedToWorkoutRef.current = false;
      try {
        const workouts = await fetchRecentWorkouts();
        const completed = workouts.filter((w) => !w.is_active);
        if (completed.length > 0) {
          const newest = completed[0];
          if (Date.now() - new Date(newest.started_at).getTime() < 5 * 60 * 1000) {
            // Skip the camera step — go directly to review with workout attached, no photo yet
            navigation.navigate('CheckInReview', { workoutId: newest.id });
          }
        }
      } catch {
        // Non-fatal
      }
    });
    return unsub;
  }, [navigation]);

  // Flip camera — disabled during recording
  const handleFacingChange = useCallback(() => {
    if (isCapturingRef.current || isRecording) return;
    setIsCameraReady(false);
    setFacing((f) => (f === 'back' ? 'front' : 'back'));
    setCameraKey((k) => k + 1);
  }, [isRecording]);

  const handleToggleDualCamera = useCallback(() => {
    setIsDualCamera((d) => !d);
  }, []);

  const handleCameraReady = useCallback(() => {
    isCameraReadyRef.current = true;
    setIsCameraReady(true);
    // Unblock any in-progress dual capture waiting for camera to reinitialize
    cameraReadyResolverRef.current?.();
    cameraReadyResolverRef.current = null;
  }, []);

  const stopRecordingTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startRecordingTimer = useCallback(() => {
    setRecordingSeconds(0);
    timerRef.current = setInterval(() => {
      setRecordingSeconds((s) => {
        if (s + 1 >= MAX_VIDEO_DURATION) {
          stopRecordingTimer();
        }
        return s + 1;
      });
    }, 1000);
  }, [stopRecordingTimer]);

  // When returning to an existing CheckInReview (fromCheckinReview mode), preserve
  // any workoutId that was already in its params so it doesn't get dropped on navigate.
  const getCheckinParams = useCallback(
    (mediaUri: string, mediaType: 'photo' | 'video', frontCameraUri?: string) => {
      const existingWorkoutId = (
        navigation.getState().routes.find((r) => r.name === 'CheckInReview')
          ?.params as { workoutId?: string } | undefined
      )?.workoutId;
      return {
        mediaUri,
        mediaType,
        isFrontCamera: facing === 'front',
        ...(frontCameraUri ? { frontCameraUri } : {}),
        ...(existingWorkoutId ? { workoutId: existingWorkoutId } : {}),
      };
    },
    [navigation, facing],
  );

  const handleTakePhoto = useCallback(async () => {
    if (!cameraRef.current || !isCameraReady || isCapturingRef.current) return;
    isCapturingRef.current = true;
    const originalFacing = facing;
    try {
      // Capture main photo
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!photo?.uri) return;

      let frontUri: string | undefined;

      if (isDualCamera) {
        const oppositeFacing: CameraType = originalFacing === 'back' ? 'front' : 'back';
        setIsDualCapturing(true);
        isCameraReadyRef.current = false;
        setIsCameraReady(false);
        setFacing(oppositeFacing);
        setCameraKey((k) => k + 1); // remount CameraView with opposite facing

        // Wait for onCameraReady to fire (up to 12 seconds for slow devices)
        await new Promise<void>((resolve) => {
          cameraReadyResolverRef.current = resolve;
          setTimeout(resolve, 12000);
        });

        // Extra settle: poll isCameraReadyRef until truly ready, max 3 more seconds
        const settleStart = Date.now();
        while (!isCameraReadyRef.current && Date.now() - settleStart < 3000) {
          await new Promise((r) => setTimeout(r, 200));
        }
        // Final settle after ready is confirmed
        await new Promise((r) => setTimeout(r, 1500));

        // Attempt the second shot up to 3 times
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            if (!cameraRef.current) break;
            const secondPhoto = await cameraRef.current.takePictureAsync({ quality: 0.85 });
            if (secondPhoto?.uri) {
              frontUri = secondPhoto.uri;
              console.log(`[DualCam] second photo captured on attempt ${attempt}`);
              break;
            }
          } catch (e) {
            console.warn(`[DualCam] attempt ${attempt} failed:`, e);
            if (attempt < 3) await new Promise((r) => setTimeout(r, 500));
          }
        }
        if (!frontUri) console.warn('[DualCam] all attempts failed — posting without front camera');
        setIsDualCapturing(false);
      }

      if (fromCheckinReview) {
        const params = getCheckinParams(photo.uri, 'photo', frontUri);
        const state = navigation.getState();
        const prevRoute = state.routes[state.index - 1];
        if (prevRoute?.name === 'CheckInReview') {
          navigation.dispatch({ ...CommonActions.setParams(params), source: prevRoute.key });
        }
        navigation.goBack();
      } else {
        navigation.replace('CheckInReview', {
          mediaUri: photo.uri,
          mediaType: 'photo',
          isFrontCamera: originalFacing === 'front',
          ...(frontUri ? { frontCameraUri: frontUri } : {}),
        });
      }
    } catch (err) {
      console.error('[CameraCapture] takePictureAsync error:', err);
      Alert.alert('Error', 'Could not take photo. Please try again.');
      setIsDualCapturing(false);
    } finally {
      isCapturingRef.current = false;
    }
  }, [navigation, fromCheckinReview, isCameraReady, isDualCamera, facing, getCheckinParams]);

  const handleStartRecording = useCallback(async () => {
    if (!cameraRef.current || isRecording || !isCameraReady) return;

    isStoppingRef.current = false;
    setIsRecording(true);
    shutterScale.value = withSpring(0.75, { stiffness: 300, damping: 20 });
    shutterRingScale.value = withSpring(1.25, { stiffness: 300, damping: 20 });
    progressAnim.value = withTiming(1, { duration: MAX_VIDEO_DURATION * 1000 });
    startRecordingTimer();

    let videoUri: string | undefined;
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: MAX_VIDEO_DURATION });
      videoUri = video?.uri;
    } catch (err) {
      console.error('[CameraCapture] recordAsync error:', err);
    }

    // Finalize UI
    setIsRecording(false);
    stopRecordingTimer();
    shutterScale.value = withSpring(1);
    shutterRingScale.value = withSpring(1);
    progressAnim.value = 0;

    if (!videoUri) {
      setIsFinalizingVideo(false);
      return;
    }

    if (fromCheckinReview) {
      const params = getCheckinParams(videoUri, 'video');
      const state = navigation.getState();
      const prevRoute = state.routes[state.index - 1];
      if (prevRoute?.name === 'CheckInReview') {
        navigation.dispatch({ ...CommonActions.setParams(params), source: prevRoute.key });
      }
      navigation.goBack();
    } else {
      navigation.replace('CheckInReview', {
        mediaUri: videoUri,
        mediaType: 'video',
        isFrontCamera: facing === 'front',
      });
    }
  }, [isRecording, isCameraReady, facing, startRecordingTimer, stopRecordingTimer, fromCheckinReview, navigation, getCheckinParams]);

  const handleStopRecording = useCallback(() => {
    if (!isRecording || !cameraRef.current || isStoppingRef.current) return;
    isStoppingRef.current = true;
    setIsFinalizingVideo(true);
    // Immediate visual reset so the UI responds on first tap
    setIsRecording(false);
    stopRecordingTimer();
    shutterScale.value = withSpring(1);
    shutterRingScale.value = withSpring(1);
    progressAnim.value = 0;
    cameraRef.current.stopRecording();
  }, [isRecording, stopRecordingTimer]);

  // Double-tap anywhere on the camera preview to flip (disabled during recording)
  const handleCameraAreaPress = useCallback(() => {
    if (isRecording) return;
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      handleFacingChange();
    } else {
      lastTapRef.current = now;
    }
  }, [isRecording, handleFacingChange]);

  const handleLogWorkout = useCallback(() => {
    navigatedToWorkoutRef.current = true;
    navigation.navigate('WorkoutLog', { fromCheckin: true });
  }, [navigation]);



  if (!cameraPermission) return <View style={styles.container} />;

  if (!cameraPermission.granted) {
    return (
      <View style={[styles.container, styles.permissionContainer]}>
        <Feather name="camera-off" size={48} color={colors.textMuted} />
        <Text style={styles.permissionTitle}>Camera Access Needed</Text>
        <Text style={styles.permissionBody}>
          Spottr needs camera access to capture your check-in.
        </Text>
        <Pressable style={styles.permissionBtn} onPress={requestCameraPermission}>
          <Text style={styles.permissionBtnText}>Allow Camera</Text>
        </Pressable>
        <Pressable style={styles.permissionBtnSecondary} onPress={() => navigation.goBack()}>
          <Text style={styles.permissionBtnSecondaryText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isFocused && (
        <CameraView
          key={cameraKey}
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mode="video"
          onCameraReady={handleCameraReady}
        />
      )}

      {/* Full-screen tap zone for double-tap-to-flip. Sits above the camera but
          below all controls so button taps still win. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={handleCameraAreaPress} />

      {/* Dual-capture overlay — shown while switching cameras for second shot */}
      {isDualCapturing && (
        <View style={styles.dualCaptureOverlay}>
          <Text style={styles.dualCaptureText}>📸 Capturing front camera…</Text>
        </View>
      )}

      {/* Finalizing overlay — shown after stop until navigation */}
      {isFinalizingVideo && (
        <View style={styles.dualCaptureOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={[styles.dualCaptureText, { marginTop: 12 }]}>Preparing video…</Text>
        </View>
      )}


      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.topBtn} hitSlop={12}>
          <Feather name="x" size={26} color="#fff" />
        </Pressable>

        {isRecording ? (
          <View style={styles.recordingBadge}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>
              {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:
              {String(recordingSeconds % 60).padStart(2, '0')}
            </Text>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [styles.logWorkoutBtn, pressed && styles.logWorkoutBtnPressed]}
            onPress={handleLogWorkout}
          >
            <LinearGradient
              colors={['#4FC3E0', '#2FA4C7']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logWorkoutGradient}
            >
              <Feather name="plus-circle" size={18} color="#fff" />
              <Text style={styles.logWorkoutTitle}>Log Full Workout</Text>
              <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.75)" />
            </LinearGradient>
          </Pressable>
        )}

        {/* Right column: flip + dual camera toggle */}
        <View style={styles.topRightCol}>
          <Pressable
            onPress={handleFacingChange}
            style={[styles.topBtn, isRecording && { opacity: 0.35 }]}
            hitSlop={12}
            disabled={isRecording}
          >
            <Feather name="refresh-cw" size={22} color="#fff" />
          </Pressable>
          {!isRecording && (
            <Pressable
              onPress={handleToggleDualCamera}
              style={[styles.topBtn, styles.topBtnSmall, isDualCamera && styles.topBtnActive]}
              hitSlop={12}
            >
              <Feather name="aperture" size={18} color="#fff" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Hint label */}
      {!isRecording && (
        <View style={styles.hintWrap}>
          <Text style={styles.hintText}>
            {isDualCamera ? 'Dual camera · Tap for both shots' : 'Tap for photo · Hold for video'}
          </Text>
        </View>
      )}

      {/* Bottom controls */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 24 }]}>
        <View style={{ width: 48 }} />

        {/* Shutter */}
        <Animated.View style={[styles.shutterRing, ringStyle]}>
          <Animated.View style={shutterStyle}>
            <Pressable
              onPress={isRecording ? handleStopRecording : handleTakePhoto}
              onLongPress={handleStartRecording}
              delayLongPress={200}
              disabled={!isCameraReady && !isRecording}
              style={[
                styles.shutter,
                isRecording && styles.shutterRecording,
                !isCameraReady && !isRecording && styles.shutterNotReady,
              ]}
              accessibilityLabel={isRecording ? 'Stop recording' : 'Take photo or hold to record video'}
            />
          </Animated.View>
        </Animated.View>

        <View style={{ width: 48 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  permissionContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 32,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 12,
  },
  permissionBody: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  permissionBtn: {
    marginTop: 16,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  permissionBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  permissionBtnSecondary: {
    paddingVertical: 10,
  },
  permissionBtnSecondaryText: {
    fontSize: 14,
    color: colors.textMuted,
  },

  dualCaptureOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dualCaptureText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    overflow: 'hidden',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  topRightCol: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  topBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 22,
  },
  topBtnSmall: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  topBtnActive: {
    backgroundColor: colors.primary,
  },
  recordingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  recordingText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
  logWorkoutBtn: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  logWorkoutBtnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  logWorkoutGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  logWorkoutTitle: {
    fontSize: typography.size.sm,
    fontWeight: '700',
    color: '#fff',
  },

  hintWrap: {
    position: 'absolute',
    bottom: 140,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    overflow: 'hidden',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
  },
  shutterRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutter: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#fff',
  },
  shutterRecording: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#EF4444',
  },
  shutterNotReady: {
    opacity: 0.4,
  },
});
