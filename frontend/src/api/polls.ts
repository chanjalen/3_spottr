import { apiClient } from './client';
import { ENDPOINTS } from './endpoints';
import { Poll } from '../types/feed';

export async function votePoll(
  pollId: number,
  optionId: number,
): Promise<Poll> {
  const response = await apiClient.post(ENDPOINTS.votePoll(pollId), {
    option_id: optionId,
  });
  return response.data;
}
