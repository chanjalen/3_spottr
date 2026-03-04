import React from 'react';
import { View, Text, Pressable, Image, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Avatar from '../common/Avatar';
import MentionText from '../common/MentionText';
import { Comment } from '../../types/feed';
import { RootStackParamList } from '../../navigation/types';
import { timeAgo } from '../../utils/timeAgo';
import { colors, spacing, typography } from '../../theme';

interface ReplyItemProps {
  reply: Comment;
  currentUserId?: string;
  onLike: (id: string) => void;
  onDelete: (id: string) => void;
  onStartReply: (username: string) => void;
}

export default function ReplyItem({
  reply,
  currentUserId,
  onLike,
  onDelete,
  onStartReply,
}: ReplyItemProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  if (!reply?.user) return null;

  const isOwn = currentUserId === reply.user.id;
  const goToProfile = () => navigation.navigate('Profile', { username: reply.user.username });

  return (
    <View style={styles.container}>
      <Avatar uri={reply.user.avatar_url} name={reply.user.display_name} size={28} onPress={goToProfile} />
      <View style={styles.content}>
        <Text style={styles.name} onPress={goToProfile}>{reply.user.display_name}</Text>
        {!!reply.description && (
          <MentionText content={reply.description} textStyle={styles.text} />
        )}
        {!!reply.photo_url && (
          <Image
            source={{ uri: reply.photo_url }}
            style={styles.photo}
            resizeMode="cover"
          />
        )}
        <View style={styles.actions}>
          <Text style={styles.time}>{timeAgo(reply.created_at)}</Text>
          <Pressable
            onPress={() => onStartReply(reply.user.username)}
            hitSlop={8}
          >
            <Text style={styles.replyText}>Reply</Text>
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
          <Pressable
            style={styles.likeBtn}
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
  name: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
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
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginLeft: 'auto',
  },
  time: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
  },
  replyText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.textMuted,
  },
  actionText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.medium,
    color: colors.textMuted,
  },
});
