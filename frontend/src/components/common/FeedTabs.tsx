import React from 'react';
import { View, Text, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { colors, spacing, typography } from '../../theme';

export type FeedTab = 'main' | 'friends';

interface FeedTabsProps {
  activeTab: FeedTab;
  onTabChange: (tab: FeedTab) => void;
  streakCount?: number;
}

const TABS: { key: FeedTab; label: string }[] = [
  { key: 'main', label: 'Discover' },
  { key: 'friends', label: 'Following' },
];

export default function FeedTabs({ activeTab, onTabChange, streakCount }: FeedTabsProps) {
  const tabWidths = React.useRef<number[]>([0, 0]);
  const tabPositions = React.useRef<number[]>([0, 0]);
  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);

  const handleTabLayout = (index: number) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    tabWidths.current[index] = width;
    tabPositions.current[index] = x;

    if (TABS[index].key === activeTab) {
      indicatorX.value = x;
      indicatorWidth.value = width;
    }
  };

  React.useEffect(() => {
    const index = TABS.findIndex((t) => t.key === activeTab);
    if (tabPositions.current[index] !== undefined) {
      indicatorX.value = withSpring(tabPositions.current[index], {
        stiffness: 400,
        damping: 35,
      });
      indicatorWidth.value = withSpring(tabWidths.current[index], {
        stiffness: 400,
        damping: 35,
      });
    }
  }, [activeTab]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorWidth.value,
  }));

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.tabRow}>
          {TABS.map((tab, index) => {
            const isActive = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => onTabChange(tab.key)}
                onLayout={handleTabLayout(index)}
                style={styles.tab}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={tab.label}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    isActive ? styles.tabLabelActive : styles.tabLabelInactive,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
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
  container: {
    // transparent — sits inside the gradient wrapper in FeedScreen
  },
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
  streakIcon: {
    fontSize: 14,
  },
  streakCount: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
});
