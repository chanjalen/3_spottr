import { useCallback } from 'react';
import { FeedItem, Poll } from '../types/feed';
import { votePoll } from '../api/polls';

export function usePollVote(
  updateItem: (id: string, updates: Partial<FeedItem>) => void,
) {
  const handleVote = useCallback(
    async (item: FeedItem, optionId: number) => {
      if (!item.poll) return;

      const poll = item.poll;
      const previousVoteId = poll.user_vote_id;

      // Optimistic update
      const updatedOptions = poll.options.map((opt) => {
        let votes = opt.votes;
        if (opt.id === optionId) votes += 1;
        if (opt.id === previousVoteId) votes -= 1;
        return { ...opt, votes: Math.max(0, votes) };
      });

      const updatedPoll: Poll = {
        ...poll,
        user_vote_id: optionId,
        total_votes: poll.total_votes + (previousVoteId === null ? 1 : 0),
        options: updatedOptions,
      };

      updateItem(item.id, { poll: updatedPoll });

      try {
        const serverPoll = await votePoll(poll.id, optionId);
        updateItem(item.id, { poll: serverPoll });
      } catch {
        // Revert on failure
        updateItem(item.id, { poll });
      }
    },
    [updateItem],
  );

  return handleVote;
}
