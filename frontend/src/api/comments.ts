import { apiClient } from './client';
import { ENDPOINTS } from './endpoints';
import { Comment } from '../types/feed';

export async function fetchComments(
  itemId: number,
  itemType: 'post' | 'checkin',
): Promise<Comment[]> {
  const endpoint =
    itemType === 'post'
      ? ENDPOINTS.postComments(itemId)
      : ENDPOINTS.checkinComments(itemId);
  const response = await apiClient.get(endpoint);
  return response.data;
}

export async function addComment(
  itemId: number,
  itemType: 'post' | 'checkin',
  description: string,
): Promise<Comment> {
  const endpoint =
    itemType === 'post'
      ? ENDPOINTS.addPostComment(itemId)
      : ENDPOINTS.addCheckinComment(itemId);
  const response = await apiClient.post(endpoint, { description });
  return response.data;
}

export async function deleteComment(commentId: number): Promise<void> {
  await apiClient.post(ENDPOINTS.deleteComment(commentId));
}

export async function fetchReplies(commentId: number): Promise<Comment[]> {
  const response = await apiClient.get(ENDPOINTS.commentReplies(commentId));
  return response.data;
}

export async function addReply(
  commentId: number,
  description: string,
): Promise<Comment> {
  const response = await apiClient.post(ENDPOINTS.addCommentReply(commentId), {
    description,
  });
  return response.data;
}

export async function toggleCommentLike(
  commentId: number,
): Promise<{ liked: boolean; like_count: number }> {
  const response = await apiClient.post(ENDPOINTS.likeComment(commentId));
  return response.data;
}
