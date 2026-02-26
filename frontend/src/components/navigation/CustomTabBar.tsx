import React, { useCallback, useRef } from 'react';
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
import { colors } from '../../theme';
import CreateMenuSheet from '../feed/CreateMenuSheet';
import { useUnreadCount } from '../../store/UnreadCountContext';
import type BottomSheet from '@gorhom/bottom-sheet';

const TAB_ICONS: Record<string, React.ComponentProps<typeof Feather>['name']> = {
  Feed: 'home',
  Gyms: 'activity',
  Social: 'message-circle',
  Ranks: 'award',
};

export default function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 16);
  const sheetRef = useRef<BottomSheet>(null);
  const { total: unreadTotal } = useUnreadCount();

  const openCreateMenu = useCallback(() => {
    sheetRef.current?.expand();
  }, []);

  return (
    <>
      <View
        style={[styles.wrapper, { paddingBottom: bottomPad }]}
      >
        {/* Pill nav bar */}
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

      <CreateMenuSheet sheetRef={sheetRef} />
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
          <Feather name="plus" size={28} color={colors.iconOnPrimary} />
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: colors.surface,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.07,
        shadowRadius: 12,
      },
      android: { elevation: 12 },
    }),
  },
  navBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 6,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
    minHeight: 48,
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
    width: 64,
    height: 64,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
