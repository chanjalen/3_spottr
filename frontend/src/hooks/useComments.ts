import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { Comment, FeedItem } from '../types/feed';
import {
  fetchComments,
  addComment,
  deleteComment as apiDeleteComment,
  fetchReplies,
  addReply,
  toggleCommentLike,
} from '../api/comments';

export function useComments(onCommentCountChange?: (delta: number) => void) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadComments = useCallback(async (item: FeedItem) => {
    setIsLoading(true);
    try {
      const data = await fetchComments(item.id, item.type);
      setComments(data);
    } catch (err: any) {
      console.error('[useComments] loadComments failed:', err?.response?.status, err?.response?.data ?? err?.message);
      setComments([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const postComment = useCallback(
    async (
      item: FeedItem,
      text: string,
      photo?: { uri: string; name: string; type: string },
    ) => {
      try {
        const comment = await addComment(item.id, item.type, text, photo);
        setComments((prev) => [...prev, comment]);
        onCommentCountChange?.(1);
      } catch (err: any) {
        console.error('[useComments] postComment failed:', err?.response?.status, err?.response?.data ?? err?.message);
        Alert.alert('Error', err?.response?.data?.error ?? 'Failed to post comment. Please try again.');
      }
    },
    [onCommentCountChange],
  );

  const removeComment = useCallback(async (commentId: string) => {
    await apiDeleteComment(commentId);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    onCommentCountChange?.(-1);
  }, [onCommentCountChange]);

  const likeComment = useCallback(async (commentId: string) => {
    // Optimistic update
    setComments((prev) =>
      prev.map((c) => {
        if (c.id === commentId) {
          const newLiked = !c.user_liked;
          return { ...c, user_liked: newLiked, like_count: c.like_count + (newLiked ? 1 : -1) };
        }
        if (c.replies) {
          return {
            ...c,
            replies: c.replies.map((r) => {
              if (r.id === commentId) {
                const newLiked = !r.user_liked;
                return { ...r, user_liked: newLiked, like_count: r.like_count + (newLiked ? 1 : -1) };
              }
              return r;
            }),
          };
        }
        return c;
      }),
    );

    try {
      await toggleCommentLike(commentId);
    } catch {
      // Revert would go here
    }
  }, []);

  const loadReplies = useCallback(async (commentId: string) => {
    try {
      const replies = await fetchReplies(commentId);
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, replies } : c)),
      );
    } catch {
      // ignore
    }
  }, []);

  const postReply = useCallback(
    async (
      commentId: string,
      text: string,
      photo?: { uri: string; name: string; type: string },
    ) => {
      const reply = await addReply(commentId, text, photo);
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, reply_count: c.reply_count + 1, replies: [...(c.replies || []), reply] }
            : c,
        ),
      );
    },
    [],
  );

  return {
    comments,
    isLoading,
    loadComments,
    postComment,
    removeComment,
    likeComment,
    loadReplies,
    postReply,
  };
}
