import React, { useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

type RootNav = NativeStackNavigationProp<RootStackParamList>;

interface Props {
  sheetRef: React.RefObject<BottomSheet>;
  onCheckIn: () => void;
  onCreatePost: () => void;
}

const MENU_ITEMS: Array<{
  label: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  action: 'WorkoutLog' | 'CreatePost' | 'CheckIn' | 'SharePR';
}> = [
  { label: 'Log Workout', icon: 'activity', action: 'WorkoutLog' },
  { label: 'Post to Feed', icon: 'edit-2', action: 'CreatePost' },
  { label: 'Check In', icon: 'map-pin', action: 'CheckIn' },
  { label: 'Share PR', icon: 'award', action: 'SharePR' },
];

export default function CreateMenuSheet({ sheetRef, onCheckIn, onCreatePost }: Props) {
  const navigation = useNavigation<RootNav>();

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.4} />
    ),
    [],
  );

  const handleAction = (action: string) => {
    sheetRef.current?.close();
    if (action === 'WorkoutLog') {
      navigation.navigate('WorkoutLog');
    } else if (action === 'CheckIn') {
      onCheckIn();
    } else if (action === 'CreatePost') {
      onCreatePost();
    }
  };

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={['40%']}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.sheetBg}
    >
      <BottomSheetView style={styles.content}>
        <Text style={styles.title}>Create</Text>
        <View style={styles.grid}>
          {MENU_ITEMS.map((item) => (
            <Pressable
              key={item.action}
              style={({ pressed }) => [styles.gridItem, pressed && styles.gridItemPressed]}
              onPress={() => handleAction(item.action)}
            >
              <LinearGradient
                colors={['#4FC3E0', '#2FA4C7']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconCircle}
              >
                <Feather name={item.icon} size={22} color="#fff" />
              </LinearGradient>
              <Text style={styles.itemLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
      },
      android: { elevation: 10 },
    }),
  },
  handle: {
    backgroundColor: colors.borderColor,
    width: 36,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing['2xl'],
  },
  title: {
    fontSize: typography.size.lg,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  gridItem: {
    width: '47%',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background.elevated,
    borderRadius: 16,
    paddingVertical: spacing.lg,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  gridItemPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.97 }],
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: {
    fontSize: typography.size.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
