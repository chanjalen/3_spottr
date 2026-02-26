import { useCallback } from 'react';
import { FeedItem } from '../types/feed';
import { toggleLike } from '../api/feed';

export function useToggleLike(
  updateItem: (id: string, updates: Partial<FeedItem>) => void,
) {
  const handleLike = useCallback(
    async (item: FeedItem) => {
      // Optimistic update
      const newLiked = !item.user_liked;
      updateItem(item.id, {
        user_liked: newLiked,
        like_count: item.like_count + (newLiked ? 1 : -1),
      });

      try {
        await toggleLike(item.id, item.type);
      } catch {
        // Revert on failure
        updateItem(item.id, {
          user_liked: item.user_liked,
          like_count: item.like_count,
        });
      }
    },
    [updateItem],
  );

  return handleLike;
}
