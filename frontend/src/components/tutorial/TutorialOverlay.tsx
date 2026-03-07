import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTutorial, TUTORIAL_TOTAL_STEPS } from '../../store/TutorialContext';
import { useAuth } from '../../store/AuthContext';
import { colors, spacing, typography } from '../../theme';

// ─── Step definitions ─────────────────────────────────────────────────────────
// target controls what area of the screen gets spotlit.
// Edit title/body text here to customise what users read.

type TargetType =
  | 'tab_feed'
  | 'checkin_tab'
  | 'filter_area'
  | 'posts_tab'
  | 'feed_content'
  | 'fab'
  | 'tab_gyms'
  | 'gyms_content'
  | 'tab_social'
  | 'social_content'
  | 'tab_ranks'
  | 'gym_list_item'
  | 'gym_detail_features'
  | 'social_messages'
  | 'social_orgs_tab'
  | 'streak_pill'
  | 'profile_avatar'
  | 'add_friends_btn';

interface StepConfig {
  title: string;
  body: string;
  target: TargetType;
  /** When true, hide the Next button — the user advances by interacting with the highlighted element */
  hideNext?: boolean;
  /** When true, show the Next button but keep it disabled until unlock() is called */
  requiresUnlock?: boolean;
}

// null entries are steps handled by other components (e.g. CreateMenuSheet for step 5)
const STEPS: (StepConfig | null)[] = [
  {
    title: 'Your Feed',
    body: 'Your home for gym activity. See everything happening with the people you follow.',
    target: 'tab_feed',
  },
  {
    title: 'Check-Ins',
    body: 'Tap here to browse check-ins. Switch between Friends & Groups, your Gym, or Organizations to filter whose check-ins appear.',
    target: 'filter_area',
  },
  {
    title: 'Posts',
    body: 'See what the rest of the fitness community is up to. Browse posts, workouts, and updates from everyone on Spottr.',
    target: 'posts_tab',
    requiresUnlock: true,
  },
  {
    title: 'Post & Check-In',
    body: 'Tap + to get started. Choose Post to share with the fitness community, or Check-In to log your gym visit, update your streak, and share with friends.',
    target: 'fab',
    hideNext: true,
  },
  null, // index 4 — step 5 is handled inside CreateMenuSheet
  {
    title: 'Gyms',
    body: 'Browse gyms, see who is currently working out, view live busyness levels, and check in when you arrive.',
    target: 'tab_gyms',
    hideNext: true,
  },
  {
    title: 'Find Your Gym',
    body: 'Tap on a gym to explore it. See live busyness, connect with workout buddies, and post workout invites.',
    target: 'gym_list_item',
    hideNext: true,
  },
  {
    title: 'Gym Features',
    body: 'Live Activity shows how busy the gym is right now. Workout Buddies lets you find people to train with and post workout invites to set up a session together.',
    target: 'gym_detail_features',
  },
  {
    title: 'Messages & Orgs',
    body: 'Tap the messages icon to connect with friends and organizations.',
    target: 'tab_social',
    hideNext: true,
  },
  {
    title: 'Messages',
    body: 'Send direct messages and create group chats to talk to friends and plan workouts together.',
    target: 'social_messages',
  },
  {
    title: 'Organizations',
    body: 'Tap Orgs to join and create organizations — teams, clubs, and communities to connect and share updates with.',
    target: 'social_orgs_tab',
    hideNext: true,
  },
  {
    title: 'Leaderboard',
    body: 'See how you stack up. Browse rankings for your gym and compare lifts with friends across the Spottr community.',
    target: 'tab_ranks',
    hideNext: true,
  },
  {
    title: 'Your Streak',
    body: 'Tap the streak counter to see your streak details.',
    target: 'streak_pill',
    hideNext: true,
  },
  null, // index 13 — streak page explanation handled inside StreakDetailsScreen
  {
    title: 'Your Profile',
    body: 'Tap your avatar to view your profile.',
    target: 'profile_avatar',
    hideNext: true,
  },
  null, // index 15 — profile page explanation handled inside ProfileScreen
  {
    title: 'Add Friends',
    body: 'Tap the add friend button to find people you know, follow athletes, and join the Spottr community.',
    target: 'add_friends_btn',
    hideNext: true,
  },
];

// ─── Spotlight rect ───────────────────────────────────────────────────────────

interface Spotlight {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number; // border radius
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TutorialOverlay() {
  const { isActive, step, totalSteps, nextUnlocked, next, skip } = useTutorial();
  const { user } = useAuth();
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const overlayOpacity = useSharedValue(0);
  const cardOpacity = useSharedValue(0);
  const cardTranslate = useSharedValue(14);

  const shouldShow = isActive && (user?.onboarding_step ?? 0) >= 5;

  useEffect(() => {
    if (shouldShow) {
      const t = setTimeout(() => {
        overlayOpacity.value = withTiming(1, { duration: 350 });
        cardOpacity.value = withTiming(1, { duration: 300 });
        cardTranslate.value = withTiming(0, { duration: 300 });
      }, 700);
      return () => clearTimeout(t);
    } else {
      overlayOpacity.value = 0;
      cardOpacity.value = 0;
      cardTranslate.value = 14;
    }
  }, [shouldShow]);

  useEffect(() => {
    if (!shouldShow) return;
    cardOpacity.value = 0;
    cardTranslate.value = 14;
    cardOpacity.value = withTiming(1, { duration: 220 });
    cardTranslate.value = withTiming(0, { duration: 220 });
  }, [step]);

  // Must be unconditional — before any early return
  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslate.value }],
  }));

  if (!shouldShow) return null;

  // ── Tab bar position maths ─────────────────────────────────────────────────
  // CustomTabBar: floating pill, position absolute, bottom: 14 from the raw
  // screen edge (React Navigation does NOT add safe area to custom tab bar
  // containers). Pill height = paddingVertical(8)*2 + content(50) = 66px.
  const tabBarCenterY = H - 14 - 33; // 33 = half of 66px pill

  // Pill: left 16, right 16, paddingHorizontal 16, gap 8, FAB 50px
  // navBar (flex:1) width = W - 16 - 16 - 16 - 16 - 8 - 50 = W - 122
  // navBar starts at x = 16 (pill left) + 16 (pill padding) = 32
  const navBarWidth = W - 122;
  const navBarStartX = 32;
  const slotW = navBarWidth / 4;

  const getSpotlight = (target: TargetType): Spotlight => {
    // Content area reused by several targets
    const contentTop = insets.top + 64;
    const contentH = H * 0.52;

    // FeedTabs sits below AppHeader (~50px) and search row (~39px)
    // AppHeader = insets.top + paddingTop(8) + row(34) + paddingBottom(8) = insets.top + 50
    const feedTabsY = insets.top + 50 + 39; // ≈ insets.top + 89

    switch (target) {
      case 'tab_feed':
        return { x: navBarStartX + slotW * 0.5 - 27, y: tabBarCenterY - 27, w: 54, h: 54, r: 14 };

      // The "CheckIn (Friends/Groups)" left tab button in the feed header
      case 'checkin_tab':
        return { x: 18, y: feedTabsY + 2, w: 180, h: 34, r: 10 };

      // The filter area: covers the CheckIn tab + dropdown below it.
      // Width capped at ~230px so the Posts tab on the right stays outside the spotlight.
      // Height 200px covers the tab row (~36px) + gap + full 3-option dropdown (~150px).
      case 'filter_area':
        return { x: 32, y: feedTabsY - 2, w: 230, h: 200, r: 14 };

      // The "Posts" right tab in FeedTabs.
      // The tab row is centered (justifyContent: 'center') within paddingHorizontal: 24.
      // tabRow width ≈ 239px, centered in 342px available → offset ≈ 75px from left edge.
      // Posts tab starts at: 75 + CheckIn(~190) + gap(16) = ~281px
      case 'posts_tab':
        return { x: 260, y: feedTabsY + 2, w: 70, h: 34, r: 10 };

      case 'feed_content':
        return { x: 12, y: contentTop, w: W - 24, h: contentH, r: 16 };
      case 'fab':
        return { x: W - 57 - 32, y: tabBarCenterY - 32, w: 64, h: 64, r: 32 };
      case 'tab_gyms':
        return { x: navBarStartX + slotW * 1.5 - 27, y: tabBarCenterY - 27, w: 54, h: 54, r: 14 };
      case 'gyms_content':
        return { x: 12, y: contentTop, w: W - 24, h: contentH, r: 16 };
      case 'tab_social':
        return { x: navBarStartX + slotW * 2.5 - 27, y: tabBarCenterY - 27, w: 54, h: 54, r: 14 };
      case 'social_content':
        return { x: 12, y: contentTop, w: W - 24, h: contentH, r: 16 };
      case 'tab_ranks':
        return { x: navBarStartX + slotW * 3.5 - 27, y: tabBarCenterY - 27, w: 54, h: 54, r: 14 };

      // GymListScreen: spotlight the first gym card in the list.
      // Header = insets.top + AppHeader(58) + searchBar(52) = insets.top + 110.
      // FlatList paddingTop(16) + statsRow(94) + mapContainer(236) = 346px of list header.
      // First gym card starts at insets.top + 110 + 346 = insets.top + 456.
      case 'gym_list_item':
        return { x: 16, y: insets.top + 456, w: W - 32, h: 150, r: 16 };

      // GymDetailScreen: spotlight Live Activity + Workout Buddies cards.
      // Gradient header ≈ insets.top + 140px. First card marginTop 12 → y = insets.top + 152.
      // Two cards together (Live Activity ~180px + gap 12 + Workout Buddies ~130px) ≈ 320px.
      case 'gym_detail_features':
        return { x: 12, y: insets.top + 148, w: W - 24, h: 320, r: 16 };

      // SocialScreen Messages content area.
      // AppHeader (insets.top + 58) + tab row (~50px) = insets.top + 108.
      case 'social_messages':
        return { x: 12, y: insets.top + 110, w: W - 24, h: 260, r: 16 };

      // Orgs tab button inside SocialScreen's internal tab row.
      // tabRow starts at y = insets.top + 58; Orgs occupies the right half.
      case 'social_orgs_tab':
        return { x: W / 2 + 8, y: insets.top + 60, w: W / 2 - 16, h: 44, r: 10 };

      // AppHeader right side: streak pill sits left of avatar.
      // paddingHorizontal: 32, avatar: 34px, gap: 12, pill width ~65px.
      case 'streak_pill':
        return { x: W - 103, y: insets.top + 11, w: 52, h: 26, r: 14 };

      // AppHeader right side: avatar is the rightmost element.
      // x = W - paddingHorizontal(32) - avatarSize(34) = W - 66.
      case 'profile_avatar':
        return { x: W - 58, y: insets.top + 7, w: 34, h: 34, r: 18 };

      // AppHeader left side: add-friend button is second icon.
      // paddingHorizontal: 32, bell: 34px, gap: 12 → add-friend at x = 78.
      case 'add_friends_btn':
        return { x: 65, y: insets.top + 9, w: 34, h: 34, r: 18 };
    }
  };

  const stepData = STEPS[step];
  // Steps beyond this overlay's range are handled by other components (e.g. CreateMenuSheet)
  if (!stepData) return null;
  const spot = getSpotlight(stepData.target);
  const spotCenterX = spot.x + spot.w / 2;
  const spotCenterY = spot.y + spot.h / 2;

  // Place card above spotlight if it's in the lower half of the screen,
  // below if it's in the upper half
  const cardAbove = spotCenterY > H / 2;
  const CARD_W = 264;
  const cardX = Math.max(12, Math.min(W - 12 - CARD_W, spotCenterX - CARD_W / 2));

  return (
    <Animated.View style={[StyleSheet.absoluteFillObject, overlayStyle]} pointerEvents="box-none">
      {/* ── Dark cutout: 4 rects around the spotlight ── */}
      <View style={[styles.overlay, { top: 0, left: 0, right: 0, height: spot.y }]} />
      <View style={[styles.overlay, { top: spot.y + spot.h, left: 0, right: 0, bottom: 0 }]} />
      <View style={[styles.overlay, { top: spot.y, left: 0, width: spot.x, height: spot.h }]} />
      <View style={[styles.overlay, { top: spot.y, left: spot.x + spot.w, right: 0, height: spot.h }]} />

      {/* Spotlight ring */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: spot.y - 4,
          left: spot.x - 4,
          width: spot.w + 8,
          height: spot.h + 8,
          borderRadius: spot.r + 4,
          borderWidth: 2,
          borderColor: colors.primary,
        }}
      />

      {/* ── Tooltip card ── */}
      <Animated.View
        style={[
          styles.card,
          {
            position: 'absolute',
            left: cardX,
            width: CARD_W,
            ...(cardAbove
              ? { bottom: H - spot.y + 14 }   // card sits above spotlight
              : { top: spot.y + spot.h + 14 }), // card sits below spotlight
          },
          cardStyle,
        ]}
      >
        <View style={styles.topRow}>
          <Text style={styles.stepLabel}>Step {step + 1} of {totalSteps}</Text>
          <Pressable onPress={skip} hitSlop={8}>
            <Text style={styles.skipText}>Skip tutorial</Text>
          </Pressable>
        </View>

        <Text style={styles.cardTitle}>{stepData.title}</Text>
        <Text style={styles.cardBody}>{stepData.body}</Text>

        <View style={styles.cardFooter}>
          <View style={styles.dots}>
            {Array.from({ length: totalSteps }).map((_, i) => (
              <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
            ))}
          </View>
          {!stepData.hideNext && (
            <Pressable
              style={[
                styles.nextBtn,
                stepData.requiresUnlock && !nextUnlocked && styles.nextBtnLocked,
              ]}
              onPress={next}
              disabled={stepData.requiresUnlock && !nextUnlocked}
            >
              <Text style={styles.nextBtnText}>
                {step === totalSteps - 1 ? 'Done' : 'Next'}
              </Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.78)',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: spacing.base,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
    elevation: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  stepLabel: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    fontWeight: '500',
  },
  skipText: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  cardTitle: {
    fontSize: typography.size.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  cardBody: {
    fontSize: typography.size.sm,
    color: colors.textSecondary,
    lineHeight: 19,
    marginBottom: spacing.base,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dots: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.borderColor,
  },
  dotActive: {
    width: 16,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  nextBtn: {
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  nextBtnPressed: {
    opacity: 0.85,
  },
  nextBtnLocked: {
    opacity: 0.35,
  },
  nextBtnText: {
    fontSize: typography.size.sm,
    fontWeight: '700',
    color: '#fff',
  },
});
