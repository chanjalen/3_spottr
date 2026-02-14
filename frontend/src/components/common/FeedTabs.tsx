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
}

const TABS: { key: FeedTab; label: string }[] = [
  { key: 'main', label: 'Main' },
  { key: 'friends', label: 'Friends' },
];

export default function FeedTabs({ activeTab, onTabChange }: FeedTabsProps) {
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
      <View style={styles.tabRow}>
        {TABS.map((tab, index) => {
          const isActive = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onTabChange(tab.key)}
              onLayout={handleTabLayout(index)}
              style={styles.tab}
            >
              <Text
                style={[
                  styles.tabLabel,
                  isActive && styles.tabLabelActive,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Animated.View style={[styles.indicator, indicatorStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
    paddingTop: spacing.md,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    gap: spacing['2xl'],
  },
  tab: {
    paddingBottom: spacing.md,
  },
  tabLabel: {
    fontSize: typography.size.base,
    fontFamily: typography.family.medium,
    color: colors.tab.inactive,
  },
  tabLabelActive: {
    color: colors.tab.active,
    fontFamily: typography.family.semibold,
  },
  indicator: {
    height: 2,
    backgroundColor: colors.tab.indicator,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
    position: 'absolute',
    bottom: 0,
  },
});
