import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import Avatar from '../common/Avatar';
import PersonalRecordCard from './PersonalRecordCard';
import LinkPreview from './LinkPreview';
import PollCard from './PollCard';
import WorkoutDetailModal from './WorkoutDetailModal';
import { FeedItem } from '../../types/feed';
import { RootStackParamList } from '../../navigation/types';
import { timeAgo } from '../../utils/timeAgo';
import { colors, spacing, typography } from '../../theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Maps the raw activity type stored on the backend to a readable emoji + label
const ACTIVITY_LABELS: Record<string, string> = {
  strength_training: '💪 Strength',
  cardio: '🏃 Cardio',
  hiit: '🔥 HIIT',
  yoga: '🧘 Yoga',
  cycling: '🚴 Cycling',
  swimming: '🏊 Swimming',
  boxing: '🥊 Boxing',
  stretching: '🤸 Stretch',
  sports: '⚽ Sports',
  hiking: '🥾 Hiking',
  other: '🏅 Other',
};

interface ImmersivePostCardProps {
  item: FeedItem;
  itemHeight: number;
  /** Height of the floating header — content must start below this */
  topInset: number;
  /** Height of the bottom nav bar — content must end above this */
  bottomInset: number;
  onLike: () => void;
  onComment: () => void;
  onShare: () => void;
  onPollVote: (optionId: number | string) => void;
}

export default function ImmersivePostCard({
  item,
  itemHeight,
  topInset,
  bottomInset,
  onLike,
  onComment,
  onShare,
  onPollVote,
}: ImmersivePostCardProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const goToProfile = () => navigation.navigate('Profile', { username: item.user.username });

  const likeScale = useSharedValue(1);
  const [workoutDetailId, setWorkoutDetailId] = useState<string | null>(null);
  const hasPhoto = !!item.photo_url;
  // Use formatted activity label if available, otherwise fall back to location
  const activityLabel = item.workout_type ? (ACTIVITY_LABELS[item.workout_type] ?? item.workout_type) : null;
  const postedIn = activityLabel ?? item.location_name;

  const likeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: likeScale.value }],
  }));

  const handleLike = () => {
    likeScale.value = withSequence(
      withTiming(0.7, { duration: 80 }),
      withSpring(1, { stiffness: 400, damping: 10 }),
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onLike();
  };

  const handleShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onShare();
  };

  // ─── Photo card ──────────────────────────────────────────────────────────────
  if (hasPhoto) {
    return (
      <>
        <View style={[styles.card, { height: itemHeight }]}>
          {/* Full-bleed photo background — clipped above the nav bar */}
          <Image
            source={{ uri: item.photo_url! }}
            style={[StyleSheet.absoluteFill, { bottom: bottomInset }]}
            contentFit="cover"
          />

          {/* Dark gradient overlay — clipped to match the photo */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.72)']}
            locations={[0.4, 1]}
            style={[StyleSheet.absoluteFill, { bottom: bottomInset }]}
            pointerEvents="none"
          />

          {/* Right-side vertical action bar — sits above the nav bar */}
          <View style={[styles.actionBar, { bottom: bottomInset + spacing.base }]}>
            <AnimatedPressable
              style={[styles.actionBtn, likeAnimatedStyle]}
              onPress={handleLike}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={`Like, ${item.like_count} likes`}
              accessibilityRole="button"
            >
              <Feather
                name="heart"
                size={26}
                color={item.user_liked ? colors.semantic.like : '#FFFFFF'}
              />
              {item.like_count > 0 && (
                <Text
                  style={[
                    styles.actionCountPhoto,
                    item.user_liked && { color: colors.semantic.like },
                  ]}
                >
                  {item.like_count}
                </Text>
              )}
            </AnimatedPressable>

            <Pressable
              style={styles.actionBtn}
              onPress={onComment}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={`Comment, ${item.comment_count} comments`}
              accessibilityRole="button"
            >
              <Feather name="message-circle" size={26} color="#FFFFFF" />
              {item.comment_count > 0 && (
                <Text style={styles.actionCountPhoto}>{item.comment_count}</Text>
              )}
            </Pressable>

            <Pressable
              style={styles.actionBtn}
              onPress={handleShare}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Share"
              accessibilityRole="button"
            >
              <Feather name="send" size={26} color="#FFFFFF" />
            </Pressable>
          </View>

          {/* Bottom-left: user info + caption + meta — sits above the nav bar */}
          <View style={[styles.bottomInfo, { bottom: bottomInset + spacing.base }]}>
            <Pressable style={styles.userRow} onPress={goToProfile}>
              <Avatar uri={item.user.avatar_url} name={item.user.display_name} size={36} />
              <View style={styles.userText}>
                <Text style={styles.displayNamePhoto} numberOfLines={1}>
                  {item.user.display_name}
                </Text>
                {item.description !== '' && (
                  <Text style={styles.captionPhoto} numberOfLines={2}>
                    {item.description}
                  </Text>
                )}
              </View>
            </Pressable>

            <View style={styles.metaRow}>
              {postedIn && (
                <View style={styles.metaBadge}>
                  <Feather name="map-pin" size={11} color="rgba(255,255,255,0.7)" />
                  <Text style={styles.metaText}>{postedIn}</Text>
                </View>
              )}
              <Text style={styles.metaTime}>{timeAgo(item.created_at)}</Text>
            </View>

            {/* Workout chip — shown on photo cards when a workout is attached */}
            {item.workout && (
              <Pressable
                style={styles.workoutChipPhoto}
                onPress={() => setWorkoutDetailId(item.workout!.id)}
              >
                <Feather name="activity" size={13} color="#fff" />
                <View style={styles.workoutChipPhotoInfo}>
                  <Text style={styles.workoutChipPhotoName} numberOfLines={1}>
                    {item.workout.name}
                  </Text>
                  <Text style={styles.workoutChipPhotoMeta}>
                    {item.workout.exercise_count} exercises · {item.workout.duration}
                  </Text>
                </View>
                <Feather name="chevron-right" size={13} color="rgba(255,255,255,0.8)" />
              </Pressable>
            )}

            {item.shared_context && item.shared_context.length > 0 && (
              <View style={styles.tagsRow}>
                {item.shared_context.map((tag, i) => (
                  <View key={i} style={styles.overlayTag}>
                    <Text style={styles.overlayTagText}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>

        <WorkoutDetailModal
          workoutId={workoutDetailId}
          onClose={() => setWorkoutDetailId(null)}
        />
      </>
    );
  }

  // ─── Non-photo card ───────────────────────────────────────────────────────────
  return (
    <>
      <View style={[styles.card, styles.cardLight, { height: itemHeight }]}>
        {/* Subtle top accent — visually ties to the cyan header above */}
        <LinearGradient
          colors={[colors.primary + '18', 'transparent']}
          locations={[0, 0.25]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Right-side vertical action bar — sits above the nav bar */}
        <View style={[styles.actionBar, { bottom: bottomInset + spacing.base }]}>
          <AnimatedPressable
            style={[styles.actionBtn, likeAnimatedStyle]}
            onPress={handleLike}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={`Like, ${item.like_count} likes`}
            accessibilityRole="button"
          >
            <Feather
              name="heart"
              size={24}
              color={item.user_liked ? colors.semantic.like : colors.textMuted}
            />
            {item.like_count > 0 && (
              <Text
                style={[
                  styles.actionCountLight,
                  item.user_liked && { color: colors.semantic.like },
                ]}
              >
                {item.like_count}
              </Text>
            )}
          </AnimatedPressable>

          <Pressable
            style={styles.actionBtn}
            onPress={onComment}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={`Comment, ${item.comment_count} comments`}
            accessibilityRole="button"
          >
            <Feather name="message-circle" size={24} color={colors.textMuted} />
            {item.comment_count > 0 && (
              <Text style={styles.actionCountLight}>{item.comment_count}</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.actionBtn}
            onPress={handleShare}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Share"
            accessibilityRole="button"
          >
            <Feather name="send" size={24} color={colors.textMuted} />
          </Pressable>
        </View>

        {/* Scrollable content — padded to stay between header and nav bar */}
        <ScrollView
          style={styles.lightScroll}
          contentContainerStyle={[
            styles.lightContent,
            {
              paddingTop: topInset + spacing.xl,
              paddingBottom: bottomInset + spacing.xl,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* User header */}
          <Pressable style={styles.lightHeader} onPress={goToProfile}>
            <Avatar uri={item.user.avatar_url} name={item.user.display_name} size={44} />
            <View style={styles.lightHeaderText}>
              <Text style={styles.displayNameLight} numberOfLines={1}>
                {item.user.display_name}
              </Text>
              <Text style={styles.metaLight} numberOfLines={1}>
                {postedIn ? `${postedIn} · ` : ''}{timeAgo(item.created_at)}
              </Text>
            </View>
          </Pressable>

          {/* Activity + context tags */}
          {(activityLabel || (item.shared_context && item.shared_context.length > 0)) && (
            <View style={styles.tagsRowLight}>
              {activityLabel && (
                <View style={[styles.lightTag, styles.activityTag]}>
                  <Text style={styles.activityTagText}>{activityLabel}</Text>
                </View>
              )}
              {item.shared_context?.map((tag, i) => (
                <View key={i} style={styles.lightTag}>
                  <Text style={styles.lightTagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Caption */}
          {item.description !== '' && (
            <Text style={styles.descriptionLight}>{item.description}</Text>
          )}

          {/* Workout chip — tappable, opens full workout detail */}
          {item.workout && (
            <Pressable
              style={({ pressed }) => [styles.workoutChip, pressed && styles.workoutChipPressed]}
              onPress={() => setWorkoutDetailId(item.workout!.id)}
            >
              <Feather name="activity" size={14} color={colors.primary} />
              <View style={styles.workoutChipInfo}>
                <Text style={styles.workoutChipName} numberOfLines={1}>
                  {item.workout.name}
                </Text>
                <Text style={styles.workoutChipMeta}>
                  {item.workout.exercise_count} exercises · {item.workout.duration}
                </Text>
              </View>
              <Feather name="chevron-right" size={14} color={colors.primary} />
            </Pressable>
          )}
          {item.personal_record && (
            <PersonalRecordCard record={item.personal_record} />
          )}
          {item.link_url && <LinkPreview url={item.link_url} />}
          {item.poll && (
            <PollCard poll={item.poll} onVote={onPollVote} isOwner={false} />
          )}
        </ScrollView>
      </View>

      <WorkoutDetailModal
        workoutId={workoutDetailId}
        onClose={() => setWorkoutDetailId(null)}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    width: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  cardLight: {
    backgroundColor: colors.background.base,
  },

  // ─── Shared action bar ──────────────────────────────────────────────────────
  actionBar: {
    position: 'absolute',
    right: spacing.base,
    // bottom is set inline to respect bottomInset
    alignItems: 'center',
    gap: spacing.xl,
    zIndex: 10,
  },
  actionBtn: {
    alignItems: 'center',
    gap: 5,
    minHeight: 44,
    justifyContent: 'center',
  },

  // ─── Photo overlay ──────────────────────────────────────────────────────────
  actionCountPhoto: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bottomInfo: {
    position: 'absolute',
    left: spacing.base,
    right: 72,
    // bottom is set inline to respect bottomInset
    gap: spacing.sm,
    zIndex: 10,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  userText: {
    flex: 1,
    gap: 3,
  },
  displayNamePhoto: {
    fontSize: typography.size.base,
    fontFamily: typography.family.semibold,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  captionPhoto: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 18,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.medium,
    color: 'rgba(255,255,255,0.75)',
  },
  metaTime: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: 'rgba(255,255,255,0.6)',
  },
  tagsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  overlayTag: {
    backgroundColor: 'rgba(79,195,224,0.25)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(79,195,224,0.4)',
  },
  overlayTagText: {
    fontSize: 10,
    fontFamily: typography.family.semibold,
    color: '#8EDFF2',
  },

  // ─── Light (non-photo) ──────────────────────────────────────────────────────
  actionCountLight: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.textMuted,
  },
  lightScroll: {
    flex: 1,
  },
  lightContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingLeft: spacing.xl,
    paddingRight: 72, // leave room for right-side action bar
    // paddingTop and paddingBottom are set inline (topInset + bottomInset)
    gap: spacing.base,
  },
  lightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  lightHeaderText: {
    flex: 1,
  },
  displayNameLight: {
    fontSize: typography.size.md,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
  metaLight: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textSecondary,
    marginTop: 2,
  },
  tagsRowLight: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  lightTag: {
    backgroundColor: colors.primary + '18',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  lightTagText: {
    fontSize: 10,
    fontFamily: typography.family.semibold,
    color: colors.primary,
  },
  // Activity type tag — slightly more prominent than shared_context tags
  activityTag: {
    backgroundColor: colors.primary + '22',
    borderColor: colors.primary + '45',
  },
  activityTagText: {
    fontSize: 11,
    fontFamily: typography.family.semibold,
    color: colors.primary,
  },
  descriptionLight: {
    fontSize: typography.size.base,
    fontFamily: typography.family.regular,
    color: colors.textPrimary,
    lineHeight: 22,
  },

  // ─── Workout chip — photo card (white glass overlay on dark background) ─────
  workoutChipPhoto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  workoutChipPhotoInfo: {
    flex: 1,
  },
  workoutChipPhotoName: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  workoutChipPhotoMeta: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 1,
  },

  // ─── Workout chip — non-photo card ───────────────────────────────────────────
  workoutChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary + '12',
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary + '30',
  },
  workoutChipPressed: {
    opacity: 0.7,
  },
  workoutChipInfo: {
    flex: 1,
  },
  workoutChipName: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
  workoutChipMeta: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
