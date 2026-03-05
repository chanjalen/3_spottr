import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ActivityIndicator,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import FeedCard from '../../components/feed/FeedCard';
import ImmersivePostCard from '../../components/feed/ImmersivePostCard';
import CommentsSheet from '../../components/comments/CommentsSheet';
import ShareSheet from '../../components/feed/ShareSheet';
import { useIsFocused } from '@react-navigation/native';
import { fetchPostById, toggleLike } from '../../api/feed';
import { usePollVote } from '../../hooks/usePollVote';
import { FeedItem } from '../../types/feed';
import { RootStackParamList } from '../../navigation/types';
import { colors, spacing, typography } from '../../theme';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'PostDetail'>;
  route: RouteProp<RootStackParamList, 'PostDetail'>;
};

export default function PostDetailScreen({ navigation, route }: Props) {
  const { postId, itemType, commentId } = route.params;
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const isFocused = useIsFocused();
  const [item, setItem] = useState<FeedItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentItem, setCommentItem] = useState<FeedItem | null>(null);
  const [shareItem, setShareItem] = useState<FeedItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchPostById(postId, itemType)
      .then((data) => { if (!cancelled) setItem(data); })
      .catch(() => { if (!cancelled) setError('Could not load post.'); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [postId, itemType]);

  const updateItem = useCallback((id: string, updates: Partial<FeedItem>) => {
    setItem((prev) => (prev && prev.id === id ? { ...prev, ...updates } : prev));
  }, []);

  // Auto-open comments sheet when arriving from a comment notification
  useEffect(() => {
    if (item && commentId) {
      setCommentItem(item);
    }
  }, [item, commentId]);

  const handlePollVote = usePollVote(updateItem);

  const handleLike = useCallback(async () => {
    if (!item) return;
    const newLiked = !item.user_liked;
    updateItem(item.id, {
      user_liked: newLiked,
      like_count: item.like_count + (newLiked ? 1 : -1),
    });
    try {
      await toggleLike(item.id, item.type);
    } catch {
      updateItem(item.id, { user_liked: item.user_liked, like_count: item.like_count });
    }
  }, [item, updateItem]);

  const isImmersive = itemType === 'checkin' || (item?.type === 'checkin');

  // ── Immersive (check-in) layout ──────────────────────────────────────────────
  if (!isLoading && !error && item && isImmersive) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <ImmersivePostCard
          item={item}
          itemHeight={windowHeight}
          topInset={insets.top + 44}
          bottomInset={insets.bottom}
          isActive={isFocused}
          onLike={handleLike}
          onComment={() => setCommentItem(item)}
          onShare={() => setShareItem(item)}
          onPollVote={(optionId) => item && handlePollVote(item, optionId)}
        />

        {/* Floating back button overlaid on top of the immersive card */}
        <Pressable
          onPress={() => navigation.goBack()}
          style={[styles.immersiveBack, { top: insets.top + 8 }]}
          hitSlop={12}
        >
          <Feather name="arrow-left" size={22} color="#fff" />
        </Pressable>

        <CommentsSheet
          item={commentItem}
          onClose={() => setCommentItem(null)}
          onCommentCountChange={(delta) => {
            if (item) updateItem(item.id, { comment_count: item.comment_count + delta });
          }}
          bottomOffset={insets.bottom}
          highlightCommentId={commentId}
        />
        <ShareSheet item={shareItem} onClose={() => setShareItem(null)} bottomOffset={insets.bottom} />
      </View>
    );
  }

  // ── Standard (post/workout) layout ───────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      <LinearGradient
        colors={['#4FC3E0', '#6DCFE8', '#A8E2F4', '#D6F2FB', '#FFFFFF']}
        locations={[0, 0.2, 0.5, 0.75, 1]}
        style={{ paddingBottom: spacing.sm }}
      >
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={12}>
            <Feather name="arrow-left" size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>Post</Text>
          <View style={styles.backBtn} />
        </View>
      </LinearGradient>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error || !item ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error ?? 'Post not found.'}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}>
          <FeedCard
            item={item}
            index={0}
            onLike={handleLike}
            onComment={() => setCommentItem(item)}
            onShare={() => setShareItem(item)}
            onPollVote={(optionId) => item && handlePollVote(item, optionId)}
            onPressUser={() => navigation.navigate('Profile', { username: item.user.username })}
          />
        </ScrollView>
      )}

      <CommentsSheet
        item={commentItem}
        onClose={() => setCommentItem(null)}
        onCommentCountChange={(delta) => {
          if (item) updateItem(item.id, { comment_count: item.comment_count + delta });
        }}
        bottomOffset={insets.bottom}
      />
      <ShareSheet item={shareItem} onClose={() => setShareItem(null)} bottomOffset={insets.bottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    width: 36,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: typography.size.md,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
  },
  immersiveBack: {
    position: 'absolute',
    left: spacing.base,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
});
