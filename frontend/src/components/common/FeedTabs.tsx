import React from 'react';
import { View, Text, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';

export type FeedTab = 'main' | 'friends' | 'gym' | 'org';

// Tabs that live inside the left dropdown group
const DROPDOWN_TABS: FeedTab[] = ['friends', 'gym', 'org'];

const LEFT_TAB_LABELS: Record<FeedTab, string> = {
  friends: 'Friends/Groups',
  gym: 'Gym',
  org: 'Organizations',
  main: 'Friends/Groups', // fallback, never shown as left label when main is active
};

interface FeedTabsProps {
  activeTab: FeedTab;
  onTabChange: (tab: FeedTab) => void;
  /** Called when the left tab is tapped while already active — caller should open the dropdown */
  onDropdownPress: () => void;
  streakCount?: number;
}

export default function FeedTabs({
  activeTab,
  onTabChange,
  onDropdownPress,
  streakCount,
}: FeedTabsProps) {
  // Two visual positions: 0 = left (friends/gym/org), 1 = right (main)
  const tabWidths = React.useRef<number[]>([0, 0]);
  const tabPositions = React.useRef<number[]>([0, 0]);
  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);

  const activeVisualIndex = activeTab === 'main' ? 1 : 0;

  const handleTabLayout = (index: number) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    tabWidths.current[index] = width;
    tabPositions.current[index] = x;
    if (index === activeVisualIndex) {
      indicatorX.value = x;
      indicatorWidth.value = width;
    }
  };

  React.useEffect(() => {
    const idx = activeVisualIndex;
    if (tabPositions.current[idx] !== undefined) {
      indicatorX.value = withSpring(tabPositions.current[idx], { stiffness: 400, damping: 35 });
      indicatorWidth.value = withSpring(tabWidths.current[idx], { stiffness: 400, damping: 35 });
    }
  }, [activeTab]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorWidth.value,
  }));

  const isDropdownTab = DROPDOWN_TABS.includes(activeTab);
  const leftLabel = isDropdownTab ? LEFT_TAB_LABELS[activeTab] : 'Friends/Groups';

  const handleLeftTabPress = () => {
    if (isDropdownTab) {
      // Already on a dropdown tab — open the picker
      onDropdownPress();
    } else {
      // On Main tab — switch to friends
      onTabChange('friends');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.tabRow}>
          {/* Left tab — dropdown group trigger */}
          <Pressable
            onPress={handleLeftTabPress}
            onLayout={handleTabLayout(0)}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: isDropdownTab }}
            accessibilityLabel={leftLabel}
          >
            <View style={styles.leftTabInner}>
              <Text
                style={[
                  styles.tabLabel,
                  isDropdownTab ? styles.tabLabelActive : styles.tabLabelInactive,
                ]}
              >
                {leftLabel}
              </Text>
              <Feather
                name={isDropdownTab ? 'chevron-down' : 'chevron-down'}
                size={14}
                color={isDropdownTab ? colors.textOnPrimary : 'rgba(255,255,255,0.65)'}
                style={styles.chevron}
              />
            </View>
          </Pressable>

          {/* Right tab — Main */}
          <Pressable
            onPress={() => onTabChange('main')}
            onLayout={handleTabLayout(1)}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === 'main' }}
            accessibilityLabel="Main"
          >
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'main' ? styles.tabLabelActive : styles.tabLabelInactive,
              ]}
            >
              Main
            </Text>
          </Pressable>

          <Animated.View style={[styles.indicator, indicatorStyle]} />
        </View>

        {/* Streak badge */}
        {streakCount != null && streakCount > 0 && (
          <View style={styles.streakBadge}>
            <Text style={styles.streakIcon}>🔥</Text>
            <Text style={styles.streakCount}>{streakCount}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  tabRow: {
    flexDirection: 'row',
    gap: spacing['2xl'],
    position: 'relative',
  },
  tab: {
    paddingBottom: spacing.sm,
    paddingTop: spacing.xs,
    minHeight: 44,
    justifyContent: 'flex-end',
  },
  leftTabInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  chevron: {
    marginBottom: 1,
  },
  tabLabel: {
    fontSize: typography.size.base,
    fontFamily: typography.family.medium,
  },
  tabLabelActive: {
    color: colors.textOnPrimary,
    fontFamily: typography.family.semibold,
  },
  tabLabelInactive: {
    color: 'rgba(255,255,255,0.65)',
  },
  indicator: {
    height: 2,
    backgroundColor: colors.textOnPrimary,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
    position: 'absolute',
    bottom: 0,
  },
  streakBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  streakIcon: { fontSize: 14 },
  streakCount: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
});
