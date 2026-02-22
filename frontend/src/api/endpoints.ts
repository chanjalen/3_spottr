const BASE = '/social';

type ID = string | number;

export const ENDPOINTS = {
  feed: `${BASE}/feed/`,
  searchFeed: `${BASE}/search/`,

  likePost: (id: ID) => `${BASE}/post/${id}/like/`,
  likeCheckin: (id: ID) => `${BASE}/checkin/${id}/like/`,
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

  createPost: `${BASE}/post/create/`,
  createCheckin: `${BASE}/checkin/create/`,

  votePoll: (id: ID) => `${BASE}/poll/${id}/vote/`,

  userPosts: (username: string) => `/accounts/api/user/${username}/posts/`,
} as const;
