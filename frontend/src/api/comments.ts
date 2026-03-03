import { apiClient } from './client';
import { ENDPOINTS } from './endpoints';
import { Comment } from '../types/feed';

export async function fetchComments(
  itemId: string | number,
  itemType: 'post' | 'checkin',
): Promise<Comment[]> {
  const endpoint =
    itemType === 'post'
      ? ENDPOINTS.postComments(itemId)
      : ENDPOINTS.checkinComments(itemId);
  const response = await apiClient.get(endpoint);
  return response.data.comments;
}

export async function addComment(
  itemId: string | number,
  itemType: 'post' | 'checkin',
  text: string,
  photo?: { uri: string; name: string; type: string },
): Promise<Comment> {
  const endpoint =
    itemType === 'post'
      ? ENDPOINTS.addPostComment(itemId)
      : ENDPOINTS.addCheckinComment(itemId);

  if (photo) {
    const formData = new FormData();
    if (text) formData.append('text', text);
    formData.append('photo', photo as any);
    const response = await apiClient.post(endpoint, formData, {
      headers: { 'Content-Type': undefined },
    });
    return response.data.comment;
  }

  const response = await apiClient.post(endpoint, { text });
  return response.data.comment;
}

export async function deleteComment(commentId: string): Promise<void> {
  await apiClient.post(ENDPOINTS.deleteComment(commentId));
}

export async function fetchReplies(commentId: string): Promise<Comment[]> {
  const response = await apiClient.get(ENDPOINTS.commentReplies(commentId));
  return response.data.replies;
}

export async function addReply(
  commentId: string,
  text: string,
  photo?: { uri: string; name: string; type: string },
): Promise<Comment> {
  if (photo) {
    const formData = new FormData();
    if (text) formData.append('text', text);
    formData.append('photo', photo as any);
    const response = await apiClient.post(ENDPOINTS.addCommentReply(commentId), formData, {
      headers: { 'Content-Type': undefined },
    });
    return response.data.reply;
  }

  const response = await apiClient.post(ENDPOINTS.addCommentReply(commentId), { text });
  return response.data.reply;
}

export async function toggleCommentLike(
  commentId: string,
): Promise<{ liked: boolean; like_count: number }> {
  const response = await apiClient.post(ENDPOINTS.likeComment(commentId));
  return response.data;
}
