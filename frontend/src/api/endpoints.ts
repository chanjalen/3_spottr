const BASE = '/social';

type ID = string | number;

export const ENDPOINTS = {
  feed: `${BASE}/feed/`,
  searchFeed: `${BASE}/search/`,

  // Likes — use DRF token-auth endpoints under /api/social/
  likePost: (id: ID) => `/api/social/post/${id}/like/`,
  likeCheckin: (id: ID) => `/api/social/checkin/${id}/like/`,
  likeComment: (id: ID) => `${BASE}/comment/${id}/like/`,

  postComments: (id: ID) => `${BASE}/post/${id}/comments/`,
  addPostComment: (id: ID) => `${BASE}/post/${id}/comments/add/`,
  checkinComments: (id: ID) => `${BASE}/checkin/${id}/comments/`,
  addCheckinComment: (id: ID) => `${BASE}/checkin/${id}/comments/add/`,

  deleteComment: (id: ID) => `${BASE}/comment/${id}/delete/`,
  commentReplies: (id: ID) => `${BASE}/comment/${id}/replies/`,
  addCommentReply: (id: ID) => `${BASE}/comment/${id}/replies/add/`,

  deletePost: (id: ID) => `${BASE}/post/${id}/delete/`,
  deleteCheckin: (id: ID) => `${BASE}/checkin/${id}/delete/`,

  createPost: '/api/social/post/create/',
  createCheckin: '/api/social/checkin/create/',

  votePoll: (id: ID) => `/api/social/poll/${id}/vote/`,
  pollVoters: (id: ID) => `/api/social/poll/${id}/voters/`,

  userPostThumbnails: (username: string) => `/accounts/api/user/${username}/post-thumbnails/`,
  userPosts: (username: string) => `/accounts/api/user/${username}/posts/`,
  userCheckins: (username: string) => `/accounts/api/user/${username}/checkins/`,

  postLikers: (id: ID) => `/api/social/post/${id}/likers/`,
  checkinLikers: (id: ID) => `/api/social/checkin/${id}/likers/`,

  shareRecipients: '/api/social/share/recipients/',
  sendShare: '/api/social/share/send/',
  sendShareProfile: '/api/social/share/send-profile/',

  postDetail: (id: ID, type?: string) =>
    `/api/social/posts/${id}/${type ? `?type=${type}` : ''}`,
} as const;
