import { apiClient } from './client';
import { ENDPOINTS } from './endpoints';

export interface ShareRecipient {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  type: 'user';
}

export interface ShareGroup {
  id: string;
  name: string;
  avatar_url: string | null;
  type: 'group';
}

export interface ShareOrg {
  id: string;
  name: string;
  avatar_url: string | null;
  type: 'org';
}

export interface ShareRecipientsResponse {
  friends: ShareRecipient[];
  groups: ShareGroup[];
  orgs: ShareOrg[];
}

export async function fetchShareRecipients(
  q?: string,
): Promise<ShareRecipientsResponse> {
  const params = q ? { q } : undefined;
  const response = await apiClient.get(ENDPOINTS.shareRecipients, { params });
  return {
    friends: response.data?.friends ?? [],
    groups: response.data?.groups ?? [],
    orgs: response.data?.orgs ?? [],
  };
}

export async function sendShareProfile(params: {
  username: string;
  recipientIds: string[];
  groupIds: string[];
  orgIds: string[];
  message?: string;
}): Promise<{ sent_count: number; errors: string[] }> {
  const response = await apiClient.post(ENDPOINTS.sendShareProfile, {
    username: params.username,
    recipient_ids: params.recipientIds,
    group_ids: params.groupIds,
    org_ids: params.orgIds,
    message: params.message ?? '',
  });
  return response.data;
}

export async function sendShare(params: {
  postId: string;
  itemType: 'post' | 'checkin';
  recipientIds: string[];
  groupIds: string[];
  orgIds: string[];
  message?: string;
}): Promise<{ sent_count: number; errors: string[] }> {
  const response = await apiClient.post(ENDPOINTS.sendShare, {
    post_id: params.postId,
    item_type: params.itemType,
    recipient_ids: params.recipientIds,
    group_ids: params.groupIds,
    org_ids: params.orgIds,
    message: params.message ?? '',
  });
  return response.data;
}
