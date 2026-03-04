import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Platform,
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

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'CameraCapture'>;
};

const MAX_VIDEO_DURATION = 30; // seconds

export default function CameraCaptureScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const navigatedToWorkoutRef = useRef(false);
  const [attachedWorkoutId, setAttachedWorkoutId] = useState<string | null>(null);

  // Camera mode as state so we control when it changes
  const [cameraMode, setCameraMode] = useState<'picture' | 'video'>('picture');

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
            setAttachedWorkoutId(newest.id);
          }
        }
      } catch {
        // Non-fatal
      }
    });
    return unsub;
  }, [navigation]);

  // Reset camera-ready whenever facing changes (camera reinitializes)
  const handleFacingChange = useCallback(() => {
    setIsCameraReady(false);
    setFacing((f) => (f === 'back' ? 'front' : 'back'));
  }, []);

  const handleCameraReady = useCallback(() => {
    setIsCameraReady(true);
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

  const handleTakePhoto = useCallback(async () => {
    if (!cameraRef.current || !isCameraReady) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (photo?.uri) {
        navigation.replace('CheckInReview', {
          mediaUri: photo.uri,
          mediaType: 'photo',
          workoutId: attachedWorkoutId ?? undefined,
        });
      }
    } catch (err) {
      console.error('[CameraCapture] takePictureAsync error:', err);
      Alert.alert('Error', 'Could not take photo. Please try again.');
    }
  }, [navigation, attachedWorkoutId, isCameraReady]);

  const handleStartRecording = useCallback(async () => {
    if (!cameraRef.current || isRecording || !isCameraReady) return;
    // Switch to video mode, then wait for camera to be ready again
    setIsCameraReady(false);
    setCameraMode('video');
    setIsRecording(true);
    shutterScale.value = withSpring(0.75, { stiffness: 300, damping: 20 });
    shutterRingScale.value = withSpring(1.25, { stiffness: 300, damping: 20 });
    progressAnim.value = withTiming(1, { duration: MAX_VIDEO_DURATION * 1000 });
    startRecordingTimer();
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: MAX_VIDEO_DURATION });
      if (video?.uri) {
        navigation.replace('CheckInReview', {
          mediaUri: video.uri,
          mediaType: 'video',
          workoutId: attachedWorkoutId ?? undefined,
        });
      }
    } catch (err) {
      console.error('[CameraCapture] recordAsync error:', err);
      setIsRecording(false);
      setCameraMode('picture');
    }
  }, [isRecording, navigation, startRecordingTimer, attachedWorkoutId, isCameraReady]);

  const handleStopRecording = useCallback(() => {
    if (!isRecording || !cameraRef.current) return;
    cameraRef.current.stopRecording();
    setIsRecording(false);
    stopRecordingTimer();
    shutterScale.value = withSpring(1);
    shutterRingScale.value = withSpring(1);
    progressAnim.value = 0;
    // Switch back to picture mode (camera will call onCameraReady again)
    setIsCameraReady(false);
    setCameraMode('picture');
  }, [isRecording, stopRecordingTimer]);

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
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        mode={cameraMode}
        onCameraReady={handleCameraReady}
      />

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
            style={({ pressed }) => [
              styles.logWorkoutBtn,
              pressed && !attachedWorkoutId && styles.logWorkoutBtnPressed,
              attachedWorkoutId ? styles.logWorkoutBtnAttached : undefined,
            ]}
            onPress={handleLogWorkout}
            disabled={!!attachedWorkoutId}
          >
            <LinearGradient
              colors={['#4FC3E0', '#2FA4C7']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.logWorkoutGradient}
            >
              <Feather name="plus-circle" size={18} color="#fff" />
              <Text style={styles.logWorkoutTitle}>
                {attachedWorkoutId ? 'Workout Attached ✓' : 'Log Full Workout'}
              </Text>
              {!attachedWorkoutId && (
                <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.75)" />
              )}
            </LinearGradient>
          </Pressable>
        )}

        <Pressable onPress={handleFacingChange} style={styles.topBtn} hitSlop={12}>
          <Feather name="refresh-cw" size={22} color="#fff" />
        </Pressable>
      </View>

      {/* Hint label */}
      {!isRecording && (
        <View style={styles.hintWrap}>
          <Text style={styles.hintText}>
            {isCameraReady ? 'Tap for photo · Hold for video' : 'Camera starting…'}
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

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  topBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 22,
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
  logWorkoutBtnAttached: {
    opacity: 0.75,
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
