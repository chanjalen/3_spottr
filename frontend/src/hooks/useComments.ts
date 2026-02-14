import { useState, useCallback } from 'react';
import { Comment, FeedItem } from '../types/feed';
import {
  fetchComments,
  addComment,
  deleteComment as apiDeleteComment,
  fetchReplies,
  addReply,
  toggleCommentLike,
} from '../api/comments';
import { SAMPLE_COMMENTS } from '../utils/sampleData';

const USE_SAMPLE_DATA = __DEV__;

export function useComments() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadComments = useCallback(async (item: FeedItem) => {
    if (USE_SAMPLE_DATA) {
      setComments(SAMPLE_COMMENTS);
      return;
    }

    setIsLoading(true);
    try {
      const data = await fetchComments(item.id, item.type);
      setComments(data);
    } catch {
      setComments([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const postComment = useCallback(
    async (item: FeedItem, text: string) => {
      if (USE_SAMPLE_DATA) {
        const newComment: Comment = {
          id: Date.now(),
          user: {
            id: 99,
            username: 'you',
            display_name: 'You',
            avatar_url: null,
          },
          description: text,
          created_at: new Date().toISOString(),
          like_count: 0,
          user_liked: false,
          reply_count: 0,
        };
        setComments((prev) => [newComment, ...prev]);
        return;
      }

      const comment = await addComment(item.id, item.type, text);
      setComments((prev) => [comment, ...prev]);
    },
    [],
  );

  const removeComment = useCallback(async (commentId: number) => {
    if (!USE_SAMPLE_DATA) {
      await apiDeleteComment(commentId);
    }
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  }, []);

  const likeComment = useCallback(async (commentId: number) => {
    // Optimistic update
    setComments((prev) =>
      prev.map((c) => {
        if (c.id === commentId) {
          const newLiked = !c.user_liked;
          return {
            ...c,
            user_liked: newLiked,
            like_count: c.like_count + (newLiked ? 1 : -1),
          };
        }
        // Also check replies
        if (c.replies) {
          return {
            ...c,
            replies: c.replies.map((r) => {
              if (r.id === commentId) {
                const newLiked = !r.user_liked;
                return {
                  ...r,
                  user_liked: newLiked,
                  like_count: r.like_count + (newLiked ? 1 : -1),
                };
              }
              return r;
            }),
          };
        }
        return c;
      }),
    );

    if (!USE_SAMPLE_DATA) {
      try {
        await toggleCommentLike(commentId);
      } catch {
        // Revert would go here
      }
    }
  }, []);

  const loadReplies = useCallback(async (commentId: number) => {
    if (USE_SAMPLE_DATA) {
      // Sample data already has replies inline
      return;
    }

    try {
      const replies = await fetchReplies(commentId);
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId ? { ...c, replies } : c,
        ),
      );
    } catch {
      // ignore
    }
  }, []);

  const postReply = useCallback(
    async (commentId: number, text: string) => {
      if (USE_SAMPLE_DATA) {
        const newReply: Comment = {
          id: Date.now(),
          user: {
            id: 99,
            username: 'you',
            display_name: 'You',
            avatar_url: null,
          },
          description: text,
          created_at: new Date().toISOString(),
          like_count: 0,
          user_liked: false,
          reply_count: 0,
        };
        setComments((prev) =>
          prev.map((c) =>
            c.id === commentId
              ? {
                  ...c,
                  reply_count: c.reply_count + 1,
                  replies: [...(c.replies || []), newReply],
                }
              : c,
          ),
        );
        return;
      }

      const reply = await addReply(commentId, text);
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? {
                ...c,
                reply_count: c.reply_count + 1,
                replies: [...(c.replies || []), reply],
              }
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
