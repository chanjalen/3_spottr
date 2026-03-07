import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { colors } from '../../theme';
import CreateMenuSheet from '../feed/CreateMenuSheet';
import { useUnreadCount } from '../../store/UnreadCountContext';
import { useTutorial } from '../../store/TutorialContext';

const TAB_ICONS: Record<string, React.ComponentProps<typeof Feather>['name']> = {
  Feed: 'home',
  Gyms: 'map-pin',
  Social: 'message-circle',
  Ranks: 'award',
};

export default function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const { total: unreadTotal } = useUnreadCount();

  const { isActive: tutorialActive, step: tutorialStep, next: tutorialNext } = useTutorial();

  const openCreateMenu = useCallback(() => {
    // Step index 3 = tutorial step 4 — tapping + advances to step 5 and opens the sheet
    if (tutorialActive && tutorialStep === 3) tutorialNext();
    setShowCreateMenu(true);
  }, [tutorialActive, tutorialStep, tutorialNext]);

  return (
    <>
      <View style={[styles.pill, { bottom: 14 }]}>
        {/* Frosted glass background */}
        <BlurView intensity={72} tint="dark" style={styles.blurBg} />
        {/* Subtle border for definition */}
        <View style={styles.pillBorder} />

        {/* Nav items */}
        <View style={styles.navBar}>
          {state.routes.map((route, index) => {
            const isFocused = state.index === index;
            const iconName = TAB_ICONS[route.name] ?? 'circle';

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
              // Tutorial: tap interactions that advance the tutorial
              if (tutorialActive && tutorialStep === 5 && route.name === 'Gyms') tutorialNext();
              if (tutorialActive && tutorialStep === 8 && route.name === 'Social') tutorialNext();
              if (tutorialActive && tutorialStep === 11 && route.name === 'Ranks') tutorialNext();
            };

            return (
              <NavItem
                key={route.key}
                iconName={iconName}
                isActive={isFocused}
                onPress={onPress}
                accessibilityLabel={route.name}
                badgeCount={route.name === 'Social' ? unreadTotal : 0}
              />
            );
          })}
        </View>

        {/* FAB */}
        <FabButton onPress={openCreateMenu} />
      </View>

      <CreateMenuSheet visible={showCreateMenu} onClose={() => setShowCreateMenu(false)} />
    </>
  );
}

// ─── Nav Item ────────────────────────────────────────────────────────────────

interface NavItemProps {
  iconName: React.ComponentProps<typeof Feather>['name'];
  isActive: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  badgeCount?: number;
}

function NavItem({ iconName, isActive, onPress, accessibilityLabel, badgeCount = 0 }: NavItemProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.9, { stiffness: 500, damping: 25 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { stiffness: 500, damping: 25 });
  };

  return (
    <Pressable
      style={styles.navItem}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: isActive }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Animated.View style={[styles.navItemInner, animStyle]}>
        <View>
          <Feather
            name={iconName}
            size={24}
            color={isActive ? colors.iconActive : colors.iconInactive}
          />
          {badgeCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badgeCount > 99 ? '99+' : badgeCount}</Text>
            </View>
          )}
        </View>
        {isActive && <View style={styles.activeDot} />}
      </Animated.View>
    </Pressable>
  );
}

// ─── FAB ─────────────────────────────────────────────────────────────────────

interface FabButtonProps {
  onPress: () => void;
}

function FabButton({ onPress }: FabButtonProps) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.95, { stiffness: 500, damping: 25 });
  };
  const handlePressOut = () => {
    scale.value = withSpring(1, { stiffness: 500, damping: 25 });
  };

  return (
    <Animated.View style={[styles.fabShadowWrap, animStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityLabel="Create new content"
        accessibilityRole="button"
        accessibilityHint="Opens create menu"
      >
        <LinearGradient
          colors={['#4FC3E0', '#2FA4C7']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fab}
        >
          <Feather name="plus" size={22} color={colors.iconOnPrimary} />
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 36,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.28,
        shadowRadius: 20,
      },
      android: { elevation: 16 },
    }),
  },
  blurBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 36,
    overflow: 'hidden',
  },
  pillBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 36,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
  },
  navBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 0,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
    minHeight: 36,
  },
  navItemInner: {
    alignItems: 'center',
    gap: 4,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 12,
  },
  fabShadowWrap: {
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(79, 195, 224, 0.5)',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 1,
        shadowRadius: 20,
      },
      android: { elevation: 12 },
    }),
  },
  fab: {
    width: 50,
    height: 50,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
