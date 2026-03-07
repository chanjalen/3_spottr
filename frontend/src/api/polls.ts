import { apiClient } from './client';
import { ENDPOINTS } from './endpoints';
import { Poll } from '../types/feed';

export async function votePoll(
  pollId: number | string,
  optionId: number | string,
): Promise<Poll> {
  const response = await apiClient.post(ENDPOINTS.votePoll(pollId), {
    option_id: optionId,
  });
  const data = response.data;
  // Backend returns a full poll-shaped object; adapt it to the Poll type.
  return {
    id: data.id,
    question: data.question,
    options: data.options ?? [],
    total_votes: data.total_votes ?? 0,
    user_vote_id: data.user_vote_id ?? null,
    is_active: data.is_active ?? false,
    ends_at: data.ends_at ?? '',
  };
}

export interface PollVotersResponse {
  options: Array<{
    id: string;
    text: string;
    voters: Array<{ username: string; display_name: string; avatar_url: string | null }>;
  }>;
}

export async function fetchPollVoters(
  pollId: number | string,
): Promise<PollVotersResponse> {
  const response = await apiClient.get(ENDPOINTS.pollVoters(pollId));
  return response.data;
}
