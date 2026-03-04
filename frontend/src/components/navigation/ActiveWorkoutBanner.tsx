import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { NavigationContainerRef } from '@react-navigation/native';
import { useActiveWorkout } from '../../store/ActiveWorkoutContext';
import { deleteWorkout } from '../../api/workouts';
import { colors, spacing, typography } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';

interface Props {
  navigationRef: NavigationContainerRef<RootStackParamList>;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function ActiveWorkoutBanner({ navigationRef }: Props) {
  const { workoutId, startedAt, fromCheckin, showBanner, endWorkout } = useActiveWorkout();
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Slide-in animation
  const translateY = useSharedValue(120);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  useEffect(() => {
    translateY.value = withSpring(showBanner ? 0 : 120, {
      stiffness: 200,
      damping: 22,
    });
  }, [showBanner]);

  // Timer: sync with startedAt whenever banner becomes visible
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!showBanner || startedAt === null) {
      setSeconds(0);
      return;
    }
    const tick = () => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    };
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [showBanner, startedAt]);

  const handleReturn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (workoutId) {
      navigationRef.navigate('ActiveWorkout', { workoutId, fromCheckin });
    }
  };

  const handleCancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      'Cancel Workout',
      'Are you sure you want to cancel this workout? Your progress will be lost.',
      [
        { text: 'Keep Going', style: 'cancel' },
        {
          text: 'Cancel Workout',
          style: 'destructive',
          onPress: async () => {
            if (workoutId) {
              await deleteWorkout(workoutId).catch(() => {});
            }
            endWorkout();
          },
        },
      ],
    );
  };

  // Always render — animation handles visibility
  return (
    <Animated.View style={[styles.container, animStyle]} pointerEvents={showBanner ? 'box-none' : 'none'}>
      <BlurView intensity={72} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.pillBorder} />

      {/* Left: indicator + timer */}
      <View style={styles.left}>
        <View style={styles.activeDot} />
        <Feather name="activity" size={14} color={colors.primary} />
        <Text style={styles.timerText}>{formatTime(seconds)}</Text>
      </View>

      {/* Right: actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={handleReturn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.returnText}>Return</Text>
        </Pressable>
        <View style={styles.divider} />
        <Pressable
          onPress={handleCancel}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 90,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: 36,
    overflow: 'hidden',
    zIndex: 999,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
      },
      android: { elevation: 16 },
    }),
  },
  pillBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flex: 1,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981', // success green
  },
  timerText: {
    fontSize: typography.size.base,
    fontFamily: typography.family.semibold,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  returnText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: colors.primary,
  },
  divider: {
    width: 1,
    height: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  cancelText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.medium,
    color: 'rgba(255,255,255,0.5)',
  },
});
