import React, { useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import Avatar from '../common/Avatar';
import VideoThumbnail from '../common/VideoThumbnail';
import MentionText from '../common/MentionText';
import { Message, MessageReaction, SharedPost, SharedPostPoll } from '../../types/messaging';
import { colors, spacing, typography } from '../../theme';

// ── Types ────────────────────────────────────────────────────────────────────

type NewDivider = { id: '__new_divider__'; isDivider: true };
export type ListItem = Message | NewDivider;

export interface MessageRowProps {
  item: ListItem;
  myId: string;
  isGroup: boolean;
  onNavigateToProfile: (username: string | null) => void;
  onRetry: (msg: Message) => void;
  onLongPress: (msg: Message, pageY: number, height: number) => void;
  onTapReaction: (msg: Message, emoji: string) => void;
  onLongPressReaction: (msg: Message) => void;
  onVideoPress: (url: string) => void;
  onImagePress: (url: string) => void;
  onMentionPress?: (username: string) => void;
  onSharedPostPress?: (postId: string, itemType: 'post' | 'workout' | 'checkin') => void;
}

// ── Status icon ───────────────────────────────────────────────────────────────

function MsgStatusIcon({ status }: { status: NonNullable<Message['status']> }) {
  if (status === 'sending' || status === 'waiting') {
    return <Feather name="clock" size={10} color="rgba(255,255,255,0.65)" />;
  }
  if (status === 'sent') {
    return <Feather name="check" size={10} color="rgba(255,255,255,0.85)" />;
  }
  if (status === 'failed') {
    return <Feather name="alert-circle" size={10} color="#ff6b6b" />;
  }
  return null;
}

// ── Disabled poll preview (inside shared post card) ──────────────────────────

function SharedPollPreview({ poll }: { poll: SharedPostPoll }) {
  const total = poll.total_votes || 1; // avoid divide-by-zero
  return (
    <View style={styles.pollPreview}>
      <Text style={styles.pollQuestion} numberOfLines={2}>{poll.question}</Text>
      {poll.options.map((opt) => {
        const pct = Math.round((opt.votes / total) * 100);
        return (
          <View key={opt.id} style={styles.pollOptionRow}>
            <View style={styles.pollBarBg}>
              <View style={[styles.pollBarFill, { width: `${pct}%` as any }]} />
              <Text style={styles.pollOptionText} numberOfLines={1}>{opt.text}</Text>
            </View>
            <Text style={styles.pollPct}>{pct}%</Text>
          </View>
        );
      })}
      <Text style={styles.pollVoteHint}>Tap to vote · {poll.total_votes} votes</Text>
    </View>
  );
}

// ── Shared post cards ─────────────────────────────────────────────────────────

interface SharedPostCardProps {
  post: SharedPost;
  isOwn: boolean;
  onPress?: () => void;
}

// Shared post cards are always white/neutral — they're content preview cards,
// not message bubbles. Text is always dark regardless of who sent the message.
function SharedPostCard({ post, onPress }: Omit<SharedPostCardProps, 'isOwn'> & { isOwn?: boolean }) {
  const isImmersive = post.item_type === 'workout' || post.item_type === 'checkin' || !!post.workout;

  if (isImmersive) {
    const subtitleParts: string[] = [];
    if (post.item_type === 'checkin') {
      if (post.workout_type) subtitleParts.push(post.workout_type);
      if (post.location_name) subtitleParts.push(post.location_name);
    } else if (post.workout) {
      const w = post.workout as any;
      if (w.name) subtitleParts.push(w.name);
      if (w.exercise_count) subtitleParts.push(`${w.exercise_count} exercises`);
      if (w.duration) subtitleParts.push(w.duration);
    }

    return (
      <Pressable onPress={onPress} style={styles.sharedImmersiveCard} disabled={!onPress}>
        {post.photo_url ? (
          <Image source={{ uri: post.photo_url }} style={styles.sharedImmersiveThumb} contentFit="cover" />
        ) : (
          <View style={[styles.sharedImmersiveThumb, styles.sharedImmersivePlaceholder]}>
            <Feather name={post.item_type === 'checkin' ? 'map-pin' : 'activity'} size={30} color={colors.textMuted} />
          </View>
        )}
        {onPress && (
          <View style={styles.sharedTapHint}>
            <Feather name="external-link" size={11} color="#fff" />
          </View>
        )}
        <View style={styles.sharedImmersiveBody}>
          <View style={styles.sharedAuthorRow}>
            <Avatar uri={post.author_avatar_url ?? null} name={post.author_display_name ?? post.author_username ?? '?'} size={20} />
            <Text style={styles.sharedImmersiveAuthor} numberOfLines={1}>
              {post.author_display_name ?? post.author_username ?? 'unknown'}
            </Text>
            <Text style={styles.sharedImmersiveHandle} numberOfLines={1}>
              @{post.author_username ?? 'unknown'}
            </Text>
          </View>
          {!!post.description && (
            <Text style={styles.sharedCaption} numberOfLines={2}>{post.description}</Text>
          )}
          {subtitleParts.length > 0 && (
            <Text style={styles.sharedImmersiveSubtitle} numberOfLines={1}>
              {subtitleParts.join(' · ')}
            </Text>
          )}
          <View style={styles.sharedMetaRow}>
            <Feather name="heart" size={11} color={colors.textMuted} />
            <Text style={styles.sharedMetaText}>{post.like_count}</Text>
            <Feather name="message-circle" size={11} color={colors.textMuted} style={{ marginLeft: 6 }} />
            <Text style={styles.sharedMetaText}>{post.comment_count}</Text>
          </View>
        </View>
      </Pressable>
    );
  }

  // Regular main-feed post — mini FeedCard style (photo on top, content below)
  return (
    <Pressable onPress={onPress} style={styles.sharedPostCard} disabled={!onPress}>
      {/* Photo — full width, only shown when present */}
      {post.photo_url ? (
        <Image source={{ uri: post.photo_url }} style={styles.sharedPostThumb} contentFit="cover" />
      ) : null}

      {/* Body */}
      <View style={styles.sharedPostBodyInner}>
        {/* Author row */}
        <View style={styles.sharedAuthorRow}>
          <Avatar uri={post.author_avatar_url ?? null} name={post.author_display_name ?? post.author_username ?? '?'} size={18} />
          <Text style={styles.sharedPostAuthor} numberOfLines={1}>
            {post.author_display_name ?? post.author_username ?? 'unknown'}
          </Text>
          <Text style={styles.sharedImmersiveHandle} numberOfLines={1}>
            @{post.author_username ?? 'unknown'}
          </Text>
        </View>

        {/* Caption */}
        {!!post.description && (
          <Text style={styles.sharedPostDesc} numberOfLines={3}>{post.description}</Text>
        )}

        {/* Poll preview — disabled, tap-to-vote hint */}
        {!!post.poll && <SharedPollPreview poll={post.poll} />}

        {/* Meta row */}
        <View style={styles.sharedMetaRow}>
          <Feather name="heart" size={10} color={colors.textMuted} />
          <Text style={styles.sharedMetaText}>{post.like_count}</Text>
          <Feather name="message-circle" size={10} color={colors.textMuted} style={{ marginLeft: 5 }} />
          <Text style={styles.sharedMetaText}>{post.comment_count}</Text>
        </View>
      </View>
    </Pressable>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function MessageRowInner({
  item,
  myId,
  isGroup,
  onNavigateToProfile,
  onRetry,
  onLongPress,
  onTapReaction,
  onLongPressReaction,
  onVideoPress,
  onImagePress,
  onMentionPress,
  onSharedPostPress,
}: MessageRowProps) {
  // Guard prevents the outer Pressable from double-firing after the inner media Pressable
  // already handled the long press (both have onLongPress; inner fires first with correct coords,
  // outer fires ~1ms later and would overwrite them with bad values).
  const longPressGuard = useRef(false);
  const rowRef = useRef<View>(null);
  const fireLongPress = () => {
    if (longPressGuard.current) return;
    longPressGuard.current = true;
    setTimeout(() => { longPressGuard.current = false; }, 800);
    rowRef.current?.measureInWindow((_x, y, _w, h) => {
      onLongPress(item as Message, y, h);
    });
  };

  if ('isDivider' in item) {
    return (
      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerLabel}>NEW</Text>
        <View style={styles.dividerLine} />
      </View>
    );
  }

  if (item.is_system) {
    return (
      <View style={styles.systemMsg}>
        <Text style={styles.systemMsgText}>{item.content}</Text>
      </View>
    );
  }

  const isOwn = String(item.sender) === myId;
  const isFailed = item.status === 'failed';
  const reactions = item.reactions ?? [];
  const mediaItems = item.media && item.media.length > 0 ? item.media : null;

  return (
    <View ref={rowRef} style={[styles.msgWrap, isOwn ? styles.msgWrapOwn : styles.msgWrapOther]}>
      {!isOwn && (
        <Pressable onPress={() => onNavigateToProfile(item.sender_username)}>
          <Avatar
            uri={item.sender_avatar_url}
            name={item.sender_username ?? '?'}
            size={28}
          />
        </Pressable>
      )}
      <View style={styles.msgBubbleCol}>
        <Pressable
          onPress={isFailed ? () => onRetry(item) : undefined}
          onLongPress={fireLongPress}
          delayLongPress={400}
        >
          <View style={styles.msgContent}>
            {isGroup && !isOwn && (
              <Text style={styles.senderName}>{item.sender_username ?? ''}</Text>
            )}
            {mediaItems && (
              <View style={[styles.msgMediaGrid, isFailed && { opacity: 0.7 }]}>
                {mediaItems.map((m, idx) =>
                  m.kind === 'video' ? (
                    isFailed ? (
                      <View key={idx} style={[styles.msgMediaThumb, styles.msgMediaVideo]}>
                        {m.thumbnail_url ? (
                          <Image
                            source={{ uri: m.thumbnail_url }}
                            style={StyleSheet.absoluteFill}
                            contentFit="cover"
                          />
                        ) : null}
                        <Feather name="play-circle" size={28} color="#fff" />
                      </View>
                    ) : (
                      <Pressable
                        key={idx}
                        onPress={() => onVideoPress(m.url)}
                        onLongPress={fireLongPress}
                        delayLongPress={400}
                      >
                        <VideoThumbnail
                          videoUrl={m.url}
                          thumbnailUrl={m.thumbnail_url}
                          style={styles.msgMediaThumb}
                        />
                      </Pressable>
                    )
                  ) : (
                    <Pressable
                      key={idx}
                      onPress={isFailed ? undefined : () => onImagePress(m.url)}
                      onLongPress={fireLongPress}
                      delayLongPress={400}
                    >
                      <View pointerEvents="none">
                        <Image
                          source={{ uri: m.thumbnail_url ?? m.url }}
                          style={styles.msgMediaThumb}
                          contentFit="cover"
                        />
                      </View>
                    </Pressable>
                  )
                )}
              </View>
            )}
            {item.shared_post && (
              <SharedPostCard
                post={item.shared_post}
                isOwn={isOwn}
                onPress={
                  onSharedPostPress
                    ? () => onSharedPostPress(
                        item.shared_post!.id,
                        item.shared_post!.item_type === 'checkin' ? 'checkin'
                          : item.shared_post!.workout ? 'workout' : 'post',
                      )
                    : undefined
                }
              />
            )}
            {!!item.content && (
              <View
                style={[
                  styles.bubble,
                  isOwn ? styles.bubbleOwn : styles.bubbleOther,
                  isFailed && styles.bubbleFailed,
                  item.shared_post ? styles.bubbleWithPost : null,
                ]}
              >
                <MentionText
                  content={item.content}
                  textStyle={[
                    styles.bubbleText,
                    isOwn ? styles.bubbleTextOwn : styles.bubbleTextOther,
                  ]}
                  mentionStyle={isOwn ? styles.mentionOwn : undefined}
                  onMentionPress={onMentionPress}
                />
              </View>
            )}
            {isOwn && item.status != null && (
              <View style={styles.msgStatus}>
                <MsgStatusIcon status={item.status} />
              </View>
            )}
          </View>
        </Pressable>
        {reactions.length > 0 && (
          <View style={[styles.reactionsRow, isOwn && styles.reactionsRowOwn]}>
            {reactions.map((r: MessageReaction) => (
              <Pressable
                key={r.emoji}
                style={[styles.reactionChip, r.user_reacted && styles.reactionChipActive]}
                onPress={() => onTapReaction(item, r.emoji)}
                onLongPress={() => onLongPressReaction(item)}
                delayLongPress={350}
              >
                <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                <Text style={[styles.reactionCount, r.user_reacted && styles.reactionCountActive]}>
                  {r.count}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

function areEqual(prev: MessageRowProps, next: MessageRowProps): boolean {
  return (
    prev.item === next.item &&
    prev.myId === next.myId &&
    prev.onMentionPress === next.onMentionPress &&
    prev.onSharedPostPress === next.onSharedPostPress
  );
}

const MessageRow = React.memo(MessageRowInner, areEqual);
export default MessageRow;

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.primary,
    opacity: 0.4,
  },
  dividerLabel: {
    fontSize: typography.size.xs,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1,
  },
  systemMsg: {
    alignSelf: 'center',
    backgroundColor: colors.background.elevated,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginVertical: spacing.xs,
    maxWidth: '85%',
  },
  systemMsgText: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'center',
  },
  msgWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  msgWrapOwn: { justifyContent: 'flex-end' },
  msgWrapOther: { justifyContent: 'flex-start' },
  msgBubbleCol: { maxWidth: '75%' },
  msgContent: { gap: 2 },
  senderName: {
    fontSize: typography.size.xs,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 16,
  },
  bubbleOwn: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.background.elevated, borderBottomLeftRadius: 4 },
  bubbleFailed: { opacity: 0.7 },
  bubbleText: { fontSize: typography.size.sm, lineHeight: 20 },
  bubbleTextOwn: { color: '#fff' },
  bubbleTextOther: { color: colors.textPrimary },
  mentionOwn: { color: '#fff', fontWeight: '700' as const, opacity: 0.9 },
  msgStatus: {
    alignSelf: 'flex-end',
    marginTop: 2,
    marginRight: 4,
  },
  msgMediaGrid: { marginBottom: 4 },
  msgMediaThumb: {
    width: 180,
    height: 180,
    borderRadius: 12,
  },
  msgMediaVideo: {
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  reactionsRowOwn: { alignSelf: 'flex-end' },
  reactionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.elevated,
    gap: 3,
  },
  reactionChipActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(79,195,224,0.12)',
  },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 11, color: colors.textMuted },
  reactionCountActive: { color: colors.primary, fontWeight: '600' },

  // ── Shared card common ─────────────────────────────────────────────────────
  sharedCardOwn: {
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  sharedCardOther: {
    borderColor: colors.border.default,
    backgroundColor: colors.background.elevated,
  },
  sharedMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  sharedMetaText: {
    fontSize: 10,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
    marginLeft: 3,
  },

  // ── Immersive card (workout + checkin — TikTok/friends feed) ───────────────
  sharedImmersiveCard: {
    width: Dimensions.get('window').width * 0.65,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.surface,
  },
  sharedImmersiveThumb: {
    width: '100%',
    height: 150,
  },
  sharedImmersivePlaceholder: {
    backgroundColor: colors.background.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharedImmersiveBody: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs + 1,
    paddingBottom: spacing.sm,
  },
  sharedAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
    gap: 5,
  },
  sharedImmersiveAuthor: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  sharedImmersiveHandle: {
    fontSize: 10,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
    flexShrink: 1,
  },
  sharedCaption: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textPrimary,
    lineHeight: 16,
    marginBottom: 2,
  },
  sharedImmersiveSubtitle: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
    marginTop: 1,
  },
  sharedTapHint: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.40)',
    borderRadius: 10,
    padding: 4,
  },

  // ── Poll preview (inside compact card) ────────────────────────────────────
  pollPreview: {
    marginTop: spacing.xs,
    marginBottom: 2,
    gap: 4,
  },
  pollQuestion: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  pollOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pollBarBg: {
    flex: 1,
    height: 22,
    borderRadius: 4,
    backgroundColor: colors.background.base,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  pollBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.primary + '28',
    borderRadius: 4,
  },
  pollOptionText: {
    fontSize: 10,
    fontFamily: typography.family.regular,
    color: colors.textPrimary,
    paddingHorizontal: 6,
  },
  pollPct: {
    fontSize: 10,
    fontFamily: typography.family.semibold,
    color: colors.textMuted,
    width: 28,
    textAlign: 'right',
  },
  pollVoteHint: {
    fontSize: 9,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
    marginTop: 1,
  },

  // ── Compact card (regular post — mini FeedCard style) ─────────────────────
  sharedPostCard: {
    width: Dimensions.get('window').width * 0.65,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border.default,
    backgroundColor: colors.surface,
  },
  sharedPostThumb: {
    width: '100%',
    height: 130,
  },
  sharedPostBodyInner: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs + 2,
    paddingBottom: spacing.sm,
    gap: 3,
  },
  sharedPostAuthor: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  sharedPostDesc: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textPrimary,
    lineHeight: 16,
  },

  bubbleWithPost: {
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
});
