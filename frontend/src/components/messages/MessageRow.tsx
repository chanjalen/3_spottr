import React, { useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import Avatar from '../common/Avatar';
import VideoThumbnail from '../common/VideoThumbnail';
import MentionText from '../common/MentionText';
import { Message, MessageReaction } from '../../types/messaging';
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
            {!!item.content && (
              <View
                style={[
                  styles.bubble,
                  isOwn ? styles.bubbleOwn : styles.bubbleOther,
                  isFailed && styles.bubbleFailed,
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
  return prev.item === next.item && prev.myId === next.myId && prev.onMentionPress === next.onMentionPress;
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
});
