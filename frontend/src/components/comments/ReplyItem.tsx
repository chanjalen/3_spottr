import React from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Avatar from '../common/Avatar';
import { Comment } from '../../types/feed';
import { timeAgo } from '../../utils/timeAgo';
import { colors, spacing, typography } from '../../theme';

interface ReplyItemProps {
  reply: Comment;
  currentUserId?: string;
  onLike: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function ReplyItem({
  reply,
  currentUserId,
  onLike,
  onDelete,
}: ReplyItemProps) {
  if (!reply?.user) return null;

  const isOwn = currentUserId === reply.user.id;

  return (
    <View style={styles.container}>
      <Avatar uri={reply.user.avatar_url} name={reply.user.display_name} size={28} />
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.name}>{reply.user.display_name}</Text>
          <Text style={styles.time}>{timeAgo(reply.created_at)}</Text>
        </View>
        {!!reply.description && (
          <Text style={styles.text}>{reply.description}</Text>
        )}
        {!!reply.photo_url && (
          <Image
            source={{ uri: reply.photo_url }}
            style={styles.photo}
            resizeMode="cover"
          />
        )}
        <View style={styles.actions}>
          <Pressable
            style={styles.actionBtn}
            onPress={() => onLike(reply.id)}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Feather
              name="heart"
              size={12}
              color={reply.user_liked ? colors.semantic.like : colors.textMuted}
            />
            {reply.like_count > 0 && (
              <Text
                style={[
                  styles.actionText,
                  reply.user_liked && { color: colors.semantic.like },
                ]}
              >
                {reply.like_count}
              </Text>
            )}
          </Pressable>
          {isOwn && (
            <Pressable
              style={styles.actionBtn}
              onPress={() => onDelete(reply.id)}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Feather name="trash-2" size={12} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingLeft: spacing['2xl'] + spacing.sm,
    marginTop: spacing.sm,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 2,
  },
  name: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
  time: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
  },
  text: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  photo: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    marginTop: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.base,
    marginTop: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
  },
  actionText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.medium,
    color: colors.textMuted,
  },
});
