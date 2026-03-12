import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
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
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import Avatar from '../common/Avatar';
import PersonalRecordCard from './PersonalRecordCard';
import LinkPreview from './LinkPreview';
import PollCard from './PollCard';
import WorkoutDetailModal from './WorkoutDetailModal';
import LikersSheet from './LikersSheet';
import { FeedItem } from '../../types/feed';
import { RootStackParamList } from '../../navigation/types';
import { timeAgo } from '../../utils/timeAgo';
import { getImageUrl } from '../../utils/imageUrl';
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
  /** True when this card is the currently visible item in the feed */
  isActive?: boolean;
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
  isActive = false,
  onLike,
  onComment,
  onShare,
  onPollVote,
}: ImmersivePostCardProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isFocused = useIsFocused();
  const goToProfile = () => navigation.navigate('Profile', { username: item.user.username });

  const likeScale = useSharedValue(1);
  const [workoutDetailId, setWorkoutDetailId] = useState<string | null>(null);
  const [likersVisible, setLikersVisible] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const hasPhoto = !!item.photo_url;
  const hasVideo = !!item.video_url;
  const activityLabel = item.workout_type ? (ACTIVITY_LABELS[item.workout_type] ?? item.workout_type) : null;
  const gymName = item.location_name ?? null;
  const gymId = item.gym_id ?? null;

  // ─── Video playback ──────────────────────────────────────────────────────────
  // isVideoPlaying: tracks actual play state
  // userPaused: true only when the user manually tapped to pause (shows pause icon)
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const videoPlayer = useVideoPlayer(hasVideo ? item.video_url! : null, (p) => {
    p.loop = true;
    p.muted = false;
  });

  useEffect(() => {
    if (!hasVideo) return;
    if (isActive && isFocused) {
      videoPlayer.play();
      setIsVideoPlaying(true);
      setUserPaused(false);
    } else {
      videoPlayer.pause();
      setIsVideoPlaying(false);
      if (!isActive) setUserPaused(false);
    }
  }, [isActive, isFocused, hasVideo]);

  const lastVideoTapRef = useRef(0);
  const videoTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVideoTap = () => {
    const now = Date.now();
    if (now - lastVideoTapRef.current < 300) {
      // Second tap within 300ms = double-tap — cancel pending pause/play
      if (videoTapTimerRef.current) { clearTimeout(videoTapTimerRef.current); videoTapTimerRef.current = null; }
      lastVideoTapRef.current = 0;
      return;
    }
    lastVideoTapRef.current = now;
    const playing = isVideoPlaying;
    videoTapTimerRef.current = setTimeout(() => {
      videoTapTimerRef.current = null;
      if (playing) {
        videoPlayer.pause();
        setIsVideoPlaying(false);
        setUserPaused(true);
      } else {
        videoPlayer.play();
        setIsVideoPlaying(true);
        setUserPaused(false);
      }
    }, 300);
  };

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
            source={{ uri: getImageUrl(item.photo_url, 'feed') ?? item.photo_url! }}
            style={[StyleSheet.absoluteFill, { bottom: bottomInset }, item.is_front_camera ? { transform: [{ scaleX: -1 }] } : null]}
            contentFit="cover"
          />

          {/* Front camera PIP — shown when dual camera was used */}
          {!!item.front_camera_url && (
            <View style={[styles.pip, { top: topInset + 16 }]}>
              <Image
                source={{ uri: getImageUrl(item.front_camera_url, 'feed') ?? item.front_camera_url! }}
                style={styles.pipImage}
                contentFit="cover"
              />
            </View>
          )}

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
              onLongPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setLikersVisible(true);
              }}
              delayLongPress={300}
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
                <View style={styles.nameStreakRow}>
                  <Text style={styles.displayNamePhoto} numberOfLines={1}>
                    {item.user.display_name}
                  </Text>
                  {!!item.user.streak && item.user.streak > 0 && (
                    <Text style={styles.streakPhoto}>🔥{item.user.streak}</Text>
                  )}
                </View>
                {item.description !== '' && (
                  <Pressable onPress={() => setCaptionExpanded(v => !v)}>
                    <Text style={styles.captionPhoto} numberOfLines={captionExpanded ? undefined : 2}>
                      {item.description}
                    </Text>
                    {!captionExpanded && item.description.length > 80 && (
                      <Text style={styles.captionMore}>more</Text>
                    )}
                  </Pressable>
                )}
              </View>
            </Pressable>

            <View style={styles.metaRow}>
              {(gymName || activityLabel) && (
                <Feather name="map-pin" size={11} color="rgba(255,255,255,0.7)" />
              )}
              {gymName && gymId ? (
                <Pressable onPress={() => navigation.navigate('GymDetail', { gymId, gymName })} hitSlop={8}>
                  <Text style={[styles.metaText, styles.metaLink]}>{gymName}</Text>
                </Pressable>
              ) : gymName ? (
                <Text style={styles.metaText}>{gymName}</Text>
              ) : null}
              {gymName && activityLabel && (
                <Text style={styles.metaSep}>·</Text>
              )}
              {activityLabel && (
                <Text style={styles.metaText}>{activityLabel}</Text>
              )}
              {(gymName || activityLabel) && (
                <Text style={styles.metaSep}>·</Text>
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
        <LikersSheet
          visible={likersVisible}
          itemId={item.id}
          itemType={item.type}
          likeCount={item.like_count}
          onClose={() => setLikersVisible(false)}
        />
      </>
    );
  }

  // ─── Video card ───────────────────────────────────────────────────────────────
  if (hasVideo) {
    return (
      <>
        <Pressable
          style={[styles.card, { height: itemHeight }]}
          onPress={handleVideoTap}
          accessibilityLabel={isVideoPlaying ? 'Pause video' : 'Play video'}
        >
          {/* Mirror only front-camera videos */}
          <View style={[StyleSheet.absoluteFill, { bottom: bottomInset }, item.is_front_camera ? { transform: [{ scaleX: -1 }] } : null]}>
            <VideoView
              player={videoPlayer}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              nativeControls={false}
            />
          </View>

          {/* Dark gradient overlay */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.72)']}
            locations={[0.4, 1]}
            style={[StyleSheet.absoluteFill, { bottom: bottomInset }]}
            pointerEvents="none"
          />

          {/* Pause indicator — shown only when user manually paused */}
          {userPaused && (
            <View style={styles.pauseIndicator} pointerEvents="none">
              <Feather name="pause" size={36} color="rgba(255,255,255,0.85)" />
            </View>
          )}

          {/* Right-side vertical action bar */}
          <View style={[styles.actionBar, { bottom: bottomInset + spacing.base }]}>
            <AnimatedPressable
              style={[styles.actionBtn, likeAnimatedStyle]}
              onPress={handleLike}
              onLongPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setLikersVisible(true);
              }}
              delayLongPress={300}
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

          {/* Bottom-left: user info + caption + meta */}
          <View style={[styles.bottomInfo, { bottom: bottomInset + spacing.base }]}>
            <Pressable style={styles.userRow} onPress={goToProfile}>
              <Avatar uri={item.user.avatar_url} name={item.user.display_name} size={36} />
              <View style={styles.userText}>
                <View style={styles.nameStreakRow}>
                  <Text style={styles.displayNamePhoto} numberOfLines={1}>
                    {item.user.display_name}
                  </Text>
                  {!!item.user.streak && item.user.streak > 0 && (
                    <Text style={styles.streakPhoto}>🔥{item.user.streak}</Text>
                  )}
                </View>
                {item.description !== '' && (
                  <Pressable onPress={() => setCaptionExpanded(v => !v)}>
                    <Text style={styles.captionPhoto} numberOfLines={captionExpanded ? undefined : 2}>
                      {item.description}
                    </Text>
                    {!captionExpanded && item.description.length > 80 && (
                      <Text style={styles.captionMore}>more</Text>
                    )}
                  </Pressable>
                )}
              </View>
            </Pressable>

            <View style={styles.metaRow}>
              {(gymName || activityLabel) && (
                <Feather name="map-pin" size={11} color="rgba(255,255,255,0.7)" />
              )}
              {gymName && gymId ? (
                <Pressable onPress={() => navigation.navigate('GymDetail', { gymId, gymName })} hitSlop={8}>
                  <Text style={[styles.metaText, styles.metaLink]}>{gymName}</Text>
                </Pressable>
              ) : gymName ? (
                <Text style={styles.metaText}>{gymName}</Text>
              ) : null}
              {gymName && activityLabel && <Text style={styles.metaSep}>·</Text>}
              {activityLabel && <Text style={styles.metaText}>{activityLabel}</Text>}
              {(gymName || activityLabel) && <Text style={styles.metaSep}>·</Text>}
              <Text style={styles.metaTime}>{timeAgo(item.created_at)}</Text>
            </View>

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
        </Pressable>

        <WorkoutDetailModal
          workoutId={workoutDetailId}
          onClose={() => setWorkoutDetailId(null)}
        />
        <LikersSheet
          visible={likersVisible}
          itemId={item.id}
          itemType={item.type}
          likeCount={item.like_count}
          onClose={() => setLikersVisible(false)}
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
            onLongPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setLikersVisible(true);
            }}
            delayLongPress={300}
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
          <View style={styles.lightHeader}>
            <Pressable style={styles.lightHeaderMain} onPress={goToProfile}>
              <Avatar uri={item.user.avatar_url} name={item.user.display_name} size={44} />
              <Text style={styles.displayNameLight} numberOfLines={1}>
                {item.user.display_name}
              </Text>
              {!!item.user.streak && item.user.streak > 0 && (
                <Text style={styles.streakLight}>🔥{item.user.streak}</Text>
              )}
            </Pressable>
            <View style={styles.metaLightRow}>
              {(gymName || activityLabel) && (
                <Feather name="map-pin" size={11} color={colors.textSecondary} />
              )}
              {gymName && gymId ? (
                <Pressable onPress={() => navigation.navigate('GymDetail', { gymId, gymName })} hitSlop={8}>
                  <Text style={[styles.metaLight, styles.metaLightLink]}>{gymName}</Text>
                </Pressable>
              ) : gymName ? (
                <Text style={styles.metaLight}>{gymName}</Text>
              ) : null}
              {gymName && activityLabel && <Text style={styles.metaLight}> · </Text>}
              {activityLabel && <Text style={styles.metaLight}>{activityLabel}</Text>}
              {(gymName || activityLabel) && <Text style={styles.metaLight}> · </Text>}
              <Text style={styles.metaLight}>{timeAgo(item.created_at)}</Text>
            </View>
          </View>

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
      <LikersSheet
        visible={likersVisible}
        itemId={item.id}
        itemType={item.type}
        likeCount={item.like_count}
        onClose={() => setLikersVisible(false)}
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

  // ─── Front camera PIP ───────────────────────────────────────────────────────
  pip: {
    position: 'absolute',
    left: spacing.base,
    width: 135,
    height: 180,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#fff',
    overflow: 'hidden',
    zIndex: 10,
  },
  pipImage: {
    width: '100%',
    height: '100%',
    transform: [{ scaleX: -1 }],
  },

  // ─── Video overlay ──────────────────────────────────────────────────────────
  pauseIndicator: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
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
  nameStreakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  displayNamePhoto: {
    fontSize: typography.size.base,
    fontFamily: typography.family.semibold,
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  streakPhoto: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: '#fb923c',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
  captionMore: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: 'rgba(255,255,255,0.6)',
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
  metaSep: {
    fontSize: typography.size.xs,
    color: 'rgba(255,255,255,0.45)',
  },
  metaLink: {
    color: '#FFFFFF',
    textDecorationLine: 'underline',
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
    gap: spacing.xs,
  },
  lightHeaderMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  displayNameLight: {
    fontSize: typography.size.md,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
  streakLight: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: '#fb923c',
  },
  metaLightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 3,
    marginTop: 2,
  },
  metaLight: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textSecondary,
  },
  metaLightLink: {
    color: colors.primary,
    textDecorationLine: 'underline',
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
