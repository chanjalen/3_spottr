const BASE = '/social';

export const ENDPOINTS = {
  feed: `${BASE}/feed/`,

  likePost: (id: number) => `${BASE}/post/${id}/like/`,
  likeCheckin: (id: number) => `${BASE}/checkin/${id}/like/`,
  likeComment: (id: number) => `${BASE}/comment/${id}/like/`,

  postComments: (id: number) => `${BASE}/post/${id}/comments/`,
  addPostComment: (id: number) => `${BASE}/post/${id}/comments/add/`,
  checkinComments: (id: number) => `${BASE}/checkin/${id}/comments/`,
  addCheckinComment: (id: number) => `${BASE}/checkin/${id}/comments/add/`,

  deleteComment: (id: number) => `${BASE}/comment/${id}/delete/`,
  commentReplies: (id: number) => `${BASE}/comment/${id}/replies/`,
  addCommentReply: (id: number) => `${BASE}/comment/${id}/replies/add/`,

  deletePost: (id: number) => `${BASE}/post/${id}/delete/`,
  deleteCheckin: (id: number) => `${BASE}/checkin/${id}/delete/`,

  createPost: `${BASE}/post/create/`,
  createCheckin: `${BASE}/checkin/create/`,

  votePoll: (id: number) => `${BASE}/poll/${id}/vote/`,
} as const;
