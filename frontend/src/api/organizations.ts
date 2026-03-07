import { apiClient, getToken, API_BASE_URL } from './client';
import { SharedPost } from '../types/messaging';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrgRole = 'creator' | 'admin' | 'member';
export type OrgPrivacy = 'public' | 'private';

export interface LatestAnnouncement {
  author_display_name: string;
  content: string;
  has_media: boolean;
  has_poll: boolean;
  created_at: string;
}

export interface OrgListItem {
  id: string;
  name: string;
  description: string;
  privacy: OrgPrivacy;
  avatar_url: string | null;
  member_count: number;
  user_role: OrgRole | null;
  unread_count: number;
  latest_announcement: LatestAnnouncement | null;
  pending_request: boolean;
  created_at: string;
}

export interface OrgDetail extends OrgListItem {
  created_by_username: string;
  invite_code: string | null;
  pending_request: boolean;
}

export interface OrgMember {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role: OrgRole;
  joined_at: string;
}

export interface OrgInviteCode {
  id: string;
  code: string;
  is_active: boolean;
  created_at: string;
}

export interface OrgJoinRequest {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  message: string;
  status: 'pending' | 'accepted' | 'denied';
  created_at: string;
}

export interface AnnouncementMedia {
  url: string;
  kind: 'image' | 'video';
  thumbnail_url: string | null;
  width: number | null;
  height: number | null;
}

export interface AnnouncementReaction {
  emoji: string;
  count: number;
  user_reacted: boolean;
}

export interface AnnouncementPollOption {
  id: string;
  text: string;
  votes: number;
  order: number;
  user_voted: boolean;
}

export interface AnnouncementPoll {
  id: string;
  question: string;
  is_active: boolean;
  ends_at: string | null;
  total_votes: number;
  user_voted_option_id: string | null;
  options: AnnouncementPollOption[];
}

export interface Announcement {
  id: string;
  org: string;
  author_id: string;
  author_username: string;
  author_display_name: string;
  author_avatar_url: string | null;
  content: string;
  media: AnnouncementMedia[];
  poll: AnnouncementPoll | null;
  reactions: AnnouncementReaction[];
  created_at: string;
  is_read: boolean;
  shared_post?: SharedPost | null;
}

export interface AnnouncementPage {
  results: Announcement[];
  has_more: boolean;
  oldest_id: string | null;
  newest_id: string | null;
}

export interface CreateAnnouncementPayload {
  content?: string;
  media_ids?: string[];
  poll?: {
    question: string;
    duration_hours: number;
    options: string[];
  };
}

export interface UploadedAsset {
  asset_id: string;
  url: string;
  kind: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Media upload
// ---------------------------------------------------------------------------

export async function uploadMedia(uri: string, kind: 'image' | 'video', mimeType?: string): Promise<UploadedAsset> {
  const form = new FormData();
  const filename = uri.split('/').pop() ?? (kind === 'video' ? 'upload.mov' : 'upload.jpg');
  const ext = filename.split('.').pop()?.toLowerCase() ?? (kind === 'video' ? 'mov' : 'jpg');
  // Prefer the mimeType provided by expo-image-picker (accurate) over extension-guessing.
  const mime = mimeType ?? (kind === 'video'
    ? (ext === 'mov' ? 'video/quicktime' : 'video/mp4')
    : (ext === 'png' ? 'image/png' : 'image/jpeg'));
  form.append('file', { uri, type: mime, name: filename } as any);
  form.append('kind', kind);

  // Use fetch directly so React Native sets Content-Type + multipart boundary automatically.
  // axios 1.7 coerces `undefined` header values to the string "undefined", which breaks
  // the boundary on large files (videos especially).
  const token = await getToken();
  const timeoutMs = kind === 'video' ? 120_000 : 30_000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE_URL}/api/media/upload/`, {
      method: 'POST',
      headers: token ? { Authorization: `Token ${token}` } : {},
      body: form as any,
      signal: controller.signal,
    });
    if (response.status === 413) {
      throw new Error('File too large. Images must be under 10 MB and videos under 50 MB.');
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error ?? `Upload failed (${response.status})`);
    }
    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Org list / discover / create
// ---------------------------------------------------------------------------

export async function listMyOrgs(): Promise<OrgListItem[]> {
  const { data } = await apiClient.get('/api/organizations/');
  return data;
}

export async function fetchUserOrgs(username: string): Promise<OrgListItem[]> {
  const { data } = await apiClient.get(`/api/organizations/user/${username}/orgs/`);
  return data;
}

export async function discoverOrgs(query?: string): Promise<OrgListItem[]> {
  const params: Record<string, string> = {};
  if (query) params.q = query;
  const { data } = await apiClient.get('/api/organizations/discover/', { params });
  return data;
}

export async function createOrg(payload: {
  name: string;
  description?: string;
  privacy?: OrgPrivacy;
}): Promise<OrgDetail> {
  const { data } = await apiClient.post('/api/organizations/', payload);
  return data;
}

// ---------------------------------------------------------------------------
// Org detail / update / delete
// ---------------------------------------------------------------------------

export async function fetchOrgDetail(orgId: string): Promise<OrgDetail> {
  const { data } = await apiClient.get(`/api/organizations/${orgId}/`);
  return data;
}

export async function updateOrg(
  orgId: string,
  payload: { name?: string; description?: string; privacy?: OrgPrivacy },
): Promise<OrgDetail> {
  const { data } = await apiClient.patch(`/api/organizations/${orgId}/`, payload);
  return data;
}

export async function deleteOrg(orgId: string): Promise<void> {
  await apiClient.delete(`/api/organizations/${orgId}/`);
}

export async function updateOrgAvatar(orgId: string, uri: string): Promise<OrgDetail> {
  const form = new FormData();
  const filename = uri.split('/').pop() ?? 'avatar.jpg';
  const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
  const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
  form.append('avatar', { uri, type: mime, name: filename } as any);
  const { data } = await apiClient.post(`/api/organizations/${orgId}/avatar/`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

export async function listOrgMembers(orgId: string): Promise<OrgMember[]> {
  const { data } = await apiClient.get(`/api/organizations/${orgId}/members/`);
  return data;
}

export async function joinOrg(orgId: string): Promise<void> {
  await apiClient.post(`/api/organizations/${orgId}/join/`);
}

export async function leaveOrg(orgId: string): Promise<void> {
  await apiClient.delete(`/api/organizations/${orgId}/leave/`);
}

export async function promoteMember(orgId: string, userId: string): Promise<void> {
  await apiClient.post(`/api/organizations/${orgId}/members/${userId}/promote/`);
}

export async function demoteMember(orgId: string, userId: string): Promise<void> {
  await apiClient.post(`/api/organizations/${orgId}/members/${userId}/demote/`);
}

export async function kickMember(orgId: string, userId: string): Promise<void> {
  await apiClient.delete(`/api/organizations/${orgId}/members/${userId}/kick/`);
}

// ---------------------------------------------------------------------------
// Invite codes
// ---------------------------------------------------------------------------

export async function listInviteCodes(orgId: string): Promise<OrgInviteCode[]> {
  const { data } = await apiClient.get(`/api/organizations/${orgId}/invite-codes/`);
  return data;
}

export async function generateInviteCode(orgId: string): Promise<OrgInviteCode> {
  const { data } = await apiClient.post(`/api/organizations/${orgId}/invite-codes/`);
  return data;
}

export async function deactivateInviteCode(orgId: string, codeId: string): Promise<void> {
  await apiClient.post(`/api/organizations/${orgId}/invite-codes/${codeId}/deactivate/`);
}

export async function joinOrgViaCode(code: string): Promise<void> {
  await apiClient.post('/api/organizations/join-via-code/', { code });
}

// ---------------------------------------------------------------------------
// Join requests
// ---------------------------------------------------------------------------

export async function requestJoinOrg(orgId: string, message?: string): Promise<void> {
  await apiClient.post(`/api/organizations/${orgId}/request/`, { message: message ?? '' });
}

export async function listJoinRequests(orgId: string): Promise<OrgJoinRequest[]> {
  const { data } = await apiClient.get(`/api/organizations/${orgId}/requests/`);
  return data;
}

export async function acceptJoinRequest(requestId: string): Promise<void> {
  await apiClient.post(`/api/organizations/requests/${requestId}/accept/`);
}

export async function denyJoinRequest(requestId: string): Promise<void> {
  await apiClient.post(`/api/organizations/requests/${requestId}/deny/`);
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export async function fetchAnnouncements(
  orgId: string,
  params?: { before_id?: string; limit?: number },
): Promise<AnnouncementPage> {
  const { data } = await apiClient.get(`/api/organizations/${orgId}/announcements/`, { params });
  return data;
}

export async function createAnnouncement(
  orgId: string,
  payload: CreateAnnouncementPayload,
): Promise<Announcement> {
  const { data } = await apiClient.post(`/api/organizations/${orgId}/announcements/`, payload);
  return data;
}

export async function deleteAnnouncement(orgId: string, announcementId: string): Promise<void> {
  await apiClient.delete(`/api/organizations/${orgId}/announcements/${announcementId}/`);
}

export async function reactToAnnouncement(
  orgId: string,
  announcementId: string,
  emoji: string,
): Promise<{ reactions: AnnouncementReaction[] }> {
  const { data } = await apiClient.post(
    `/api/organizations/${orgId}/announcements/${announcementId}/react/`,
    { emoji },
  );
  return data;
}

export interface ReactionDetail {
  emoji: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export async function fetchAnnouncementReactionDetails(
  orgId: string,
  announcementId: string,
): Promise<ReactionDetail[]> {
  const { data } = await apiClient.get(
    `/api/organizations/${orgId}/announcements/${announcementId}/reactions/`,
  );
  return data;
}

export async function voteOnPoll(
  orgId: string,
  announcementId: string,
  optionId: string,
): Promise<{ poll: AnnouncementPoll }> {
  const { data } = await apiClient.post(
    `/api/organizations/${orgId}/announcements/${announcementId}/vote/`,
    { option_id: optionId },
  );
  return data;
}

export async function markAnnouncementsRead(orgId: string): Promise<void> {
  await apiClient.post(`/api/organizations/${orgId}/announcements/read/`);
}

// ---------------------------------------------------------------------------
// Member Activity (admin only)
// ---------------------------------------------------------------------------

export interface MemberActivityItem {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  current_streak: number;
  workout_count: number;
}

export async function fetchOrgMemberActivity(
  orgId: string,
  startDate: string | null,
  endDate: string | null,
): Promise<MemberActivityItem[]> {
  const { data } = await apiClient.get(`/api/organizations/${orgId}/member-activity/`, {
    params: {
      ...(startDate && { start_date: startDate }),
      ...(endDate   && { end_date:   endDate   }),
    },
  });
  return data;
}

// ── Org member logs ──────────────────────────────────────────────────────────

export type OrgLogType = 'all' | 'checkin' | 'workout' | 'post';

export type OrgLogItem =
  | {
      id: string;
      type: 'checkin';
      created_at: string;
      user_id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
      description: string;
      location_name: string;
      workout_type: string;
      photo_url: string | null;
    }
  | {
      id: string;
      type: 'workout';
      created_at: string;
      user_id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
      workout_name: string;
      duration_minutes: number | null;
    }
  | {
      id: string;
      type: 'post';
      created_at: string;
      user_id: string;
      username: string;
      display_name: string;
      avatar_url: string | null;
      description: string;
      photo_url: string | null;
    };

export async function fetchOrgMemberLogs(
  orgId: string,
  before?: string,
  startDate?: string,
  endDate?: string,
  type?: string,
): Promise<{ items: OrgLogItem[]; next_cursor: string | null }> {
  const { data } = await apiClient.get(`/api/organizations/${orgId}/member-logs/`, {
    params: {
      limit: 20,
      ...(before && { before }),
      ...(startDate && { start_date: startDate }),
      ...(endDate && { end_date: endDate }),
      ...(type && type !== 'all' && { type }),
    },
  });
  return data;
}

// ── Org member status (today) ─────────────────────────────────────────────────

export interface TodayCheckin {
  id: string;
  description: string;
  location_name: string;
  workout_type: string;
  photo_url: string | null;
  created_at: string;
}

export interface TodayWorkout {
  id: string;
  name: string;
  duration_minutes: number | null;
  created_at: string;
}

export interface MemberStatusItem {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  checked_in_today: boolean;
  logged_workout_today: boolean;
  checkin_today: TodayCheckin | null;
  workout_today: TodayWorkout | null;
}

export async function fetchOrgMemberStatus(orgId: string): Promise<MemberStatusItem[]> {
  const { data } = await apiClient.get(`/api/organizations/${orgId}/member-status/`);
  return data;
}
