# Social Feature — React Native Spec

> Reverse-engineered from Django backend + HTML templates.
> Source of truth: `backend/social/views.py`, `backend/workouts/views.py`, `frontend/social/feed.html`

---

## Step 0 — File Inventory

| File | Role |
|---|---|
| `backend/social/views.py` | All feed, like, comment, share, poll, post/checkin CRUD logic |
| `backend/social/urls.py` | URL routing for `/social/` namespace |
| `backend/social/models/` | `QuickWorkout`, `Post`, `Poll`, `PollOption`, `PollVote`, `Comment`, `Reaction`, `Follow` |
| `backend/workouts/views.py` | `start_workout`, `add_exercise`, `add_set`, `update_set`, `finish_workout` |
| `backend/workouts/urls.py` | URL routing for `/workouts/` namespace |
| `backend/accounts/views.py` | `search_users_view`, `follow_toggle_view` |
| `backend/accounts/urls.py` | URL routing for `/accounts/api/` |
| `backend/config/urls.py` | Root URL config — all app namespaces |
| `templates/social/feed.html` | Web template — all JS fetch calls are the source of truth for API behavior |

---

## Step 1 — Backend Map

### Auth
Every mobile request must include `Authorization: Token <token>` header.
The `feed_view` detects this header (or a `cursor` param) and returns JSON instead of HTML.

---

### Feed

| Method | URL | View | Returns |
|---|---|---|---|
| GET | `/social/feed/?tab=main&cursor=` | `feed_view` | `{items: FeedItem[], next_cursor: str}` |
| GET | `/social/feed/?tab=friends&cursor=` | `feed_view` | same |
| GET | `/social/search/?q=<hashtag>` | `search_feed_view` | `{posts: FeedItem[], users: []}` |

**FeedItem shape** (from `_serialize_feed_items_for_json`):
```json
{
  "type": "checkin" | "post" | "workout",
  "id": "uuid",
  "user": { "id": "uuid", "username": "...", "display_name": "...", "avatar_url": "..." },
  "location_name": "...",
  "workout_type": "Strength Training",
  "description": "...",
  "created_at": "ISO-8601",
  "time_ago": "3h ago",
  "photo_url": "https://...",
  "video_url": null,
  "link_url": null,
  "like_count": 5,
  "comment_count": 2,
  "user_liked": true,
  "poll": null | PollShape,
  "workout": null | WorkoutSummaryShape,
  "personal_record": null | PRShape
}
```

**type mapping**: `"workout"` means `Post` with `workout_id != null`. Frontend normalizes both `"post"` and `"workout"` → `'post'`.

**Pagination**: cursor-based — opaque base64 string. Pass as `?cursor=<value>`.
Page size: `FEED_PAGE_SIZE = 5`.

---

### Check-In (QuickWorkout)

| Method | URL | Body | Returns |
|---|---|---|---|
| POST | `/social/checkin/create/` | multipart | `{success, checkin_id}` |
| POST | `/social/checkin/<id>/delete/` | — | `{success, total_workouts}` |
| POST | `/social/checkin/<id>/like/` | — | `{success, liked, like_count}` |
| GET | `/social/checkin/<id>/likers/` | — | `{success, likers: [{id, username, display_name, avatar_url}]}` |
| GET | `/social/checkin/<id>/comments/` | — | `{success, comments: Comment[]}` |
| POST | `/social/checkin/<id>/comments/add/` | JSON `{text}` | `{success, comment: Comment}` |

**Create check-in fields** (multipart form):
- `gym` (optional gym ID)
- `activity` — e.g. `"strength"`, `"cardio"`, `"yoga"`, `"general"` (default `"general"`)
- `description` (optional, defaults to `"{Activity} workout"`)
- `photo` (optional file)

**Side effects**: increments `user.total_workouts`, calls `update_streak(user, activity_type='checkin')`, calls `update_group_streaks_for_user(user)`.

---

### Posts

| Method | URL | Body | Returns |
|---|---|---|---|
| POST | `/social/post/create/` | multipart OR JSON | `{success, post_id}` |
| POST | `/social/post/<id>/delete/` | — | `{success, total_workouts}` |
| POST | `/social/post/<id>/like/` | — | `{success, liked, like_count}` |
| GET | `/social/post/<id>/likers/` | — | `{success, likers: [{id, username, display_name, avatar_url}]}` |
| GET | `/social/post/<id>/comments/` | — | `{success, comments: Comment[]}` |
| POST | `/social/post/<id>/comments/add/` | JSON `{text}` | `{success, comment: Comment}` |

**Create post fields** (multipart form preferred for media):
- `text` — post body (max 500 chars)
- `link_url` (optional)
- `visibility` — `"main"` | `"friends"` (default `"main"`)
- `reply_restriction` — `"everyone"` | `"friends"` | `"mentions"` (default `"everyone"`)
- `photo` (optional file)
- `video` (optional file)
- `poll_question`, `poll_options[]`, `poll_duration` (hours, default 24)
- `pr_exercise_name`, `pr_value`, `pr_unit` (optional PR attachment)

**Validation**: Must have at least one of: `text`, `photo`, `video`, `poll_question`, or a PR.

---

### Comments

| Method | URL | Body | Returns |
|---|---|---|---|
| GET | `/social/comment/<id>/replies/` | — | `{success, replies: Comment[]}` |
| POST | `/social/comment/<id>/replies/add/` | JSON `{text}` | `{success, reply: Comment}` |
| POST | `/social/comment/<id>/delete/` | — | `{success}` |
| POST | `/social/comment/<id>/like/` | — | `{success, liked, like_count}` |

**Comment shape**:
```json
{
  "id": "uuid",
  "user": { "id": "...", "display_name": "...", "username": "...", "avatar_url": "..." },
  "text": "...",
  "created_at": "ISO-8601",
  "time_ago": "5m ago",
  "like_count": 0,
  "user_liked": false,
  "is_owner": true,
  "reply_count": 2
}
```

Limits: 15 comments max per user per post, 15 replies max per user per parent comment.

---

### Polls

| Method | URL | Body | Returns |
|---|---|---|---|
| POST | `/social/poll/<id>/vote/` | JSON `{option_id}` | Full PollShape |
| GET | `/social/poll/<id>/voters/` | — | `{options: [{id, text, voters: [...]}]}` |

**PollShape** (from vote response and feed serialization):
```json
{
  "id": "uuid",
  "question": "...",
  "options": [
    { "id": "uuid", "text": "...", "votes": 3, "order": 0, "percentage": 60 }
  ],
  "total_votes": 5,
  "is_active": true,
  "user_voted": "option-uuid" | null,
  "ends_at": "ISO-8601"
}
```

> **Note on field name**: Feed response uses `user_voted` (string option UUID or null). The `vote` endpoint also returns `user_voted`. Frontend maps this to `user_vote_id`.

**Vote change**: users can change their vote — same endpoint, new `option_id`. Inactive polls (expired) reject votes with `{success: false, error: "This poll has ended"}`.

**Voters** (`/voters/`): only accessible to post owner (403 otherwise).

---

### Share

| Method | URL | Params | Returns |
|---|---|---|---|
| GET | `/social/share/recipients/?q=` | optional search | `{success, friends: [{id, display_name, username, avatar_url}], groups: [{id, name}]}` |
| POST | `/social/share/send/` | JSON body | `{success, sent_count, errors: []}` |

**Share body**:
```json
{
  "post_id": "uuid",
  "item_type": "post" | "checkin",
  "recipient_ids": ["user-uuid-1"],
  "group_ids": ["group-uuid-1"],
  "message": "optional message"
}
```

Share creates a DM or group message with the shared post attached. Uses `send_dm` / `send_group_message` services.

---

### User Search

| Method | URL | Returns |
|---|---|---|
| GET | `/accounts/api/search-users/?q=` | `{results: UserSearchResult[]}` |

**UserSearchResult shape**:
```json
{
  "id": "uuid",
  "username": "...",
  "display_name": "...",
  "bio": "...",
  "avatar_url": "...",
  "total_workouts": 42,
  "current_streak": 7,
  "is_following": true,
  "followers_count": 100
}
```

---

### Workout Logging (for Post-to-Feed)

| Method | URL | Body | Returns |
|---|---|---|---|
| POST | `/workouts/start/` | JSON `{template_id?}` | `{success, workout_id}` |
| POST | `/workouts/<id>/add-exercise/` | JSON `{catalog_id}` | `{success, exercise: {...}}` |
| POST | `/workouts/exercise/<id>/add-set/` | — | `{success, set: {id, set_number, reps, weight, completed}}` |
| POST | `/workouts/set/<id>/update/` | JSON `{reps?, weight?, completed?}` | `{success, set: {...}, is_new_pr?: bool}` |
| POST | `/workouts/<id>/finish/` | multipart | `{success, post_id?, message}` |
| GET | `/workouts/api/catalog/?q=&category=` | — | DRF paginated exercise list |

**Finish workout fields** (multipart):
- `post_to_feed` — `"true"` | `"false"` (default `"false"`)
- `visibility` — `"main"` | `"friends"` (default `"friends"`)
- `description` (optional)
- `photo` (optional file)

**Side effects**: creates `Post` if `post_to_feed=True`, calls `update_streak`, calls `update_group_streaks_for_user`.

---

## Step 2 — Template Reverse Engineering (Key Behaviors)

### Feed Infinite Scroll
Web: JS calls `GET /?tab=${tab}&cursor=${cursor}` with `X-Requested-With: XMLHttpRequest`.
RN: same URL but detected via `Authorization: Token` header — already works.

### Like Toggle
- Optimistic UI: immediately flip `user_liked` + adjust `like_count` by ±1
- Then call `POST /social/{post|checkin}/<id>/like/`
- Server response `{liked, like_count}` reconciles the count

### Comment Submission
- Body is JSON `{"text": "..."}` — NOT form data

### Poll Voting
- Server allows vote change
- Closed polls still show results but reject new votes
- Frontend shows results immediately when `!isActive` OR `hasVoted`

### Search
- Web: debounced 300ms, searches `#hashtag` in posts AND users by username/display_name simultaneously
- RN: `useFeed.handleSearchChange` runs both in parallel (already implemented)

---

## Step 3 — End-to-End Flows

### 3A — Quick Check-In

```
User taps FAB → CheckInSheet (already built)
  ↓ user selects gym, activity, description, optional photo
  ↓ POST /social/checkin/create/ (multipart)
  ↓ Backend: creates QuickWorkout, updates streak + total_workouts
  ↓ {success: true, checkin_id: "uuid"}
  ↓ Sheet closes → feed.refresh()
```

**Key constraints**:
- `location_name` defaults to `"General"` if no gym selected
- `activity` defaults to `"general"` if not provided
- `visibility` is always `"friends"` (hardcoded in backend)

---

### 3B — Create Post

```
User taps Create → CreatePostSheet (already built)
  ↓ user fills text / picks photo / records video / adds link / creates poll / logs PR
  ↓ POST /social/post/create/ (multipart form)
  ↓ Backend: creates Post, creates Poll + PollOptions if needed, creates PR if needed
  ↓ {success: true, post_id: "uuid"}
  ↓ Sheet closes → feed.refresh()
```

**Visibility**: `"main"` (default) appears in global feed. `"friends"` only in Friends tab.

---

### 3C — Log Workout → Post to Feed

```
User opens WorkoutLogger
  ↓ POST /workouts/start/ → {workout_id}
  ↓ User adds exercises: POST /workouts/<id>/add-exercise/ → {exercise}
  ↓ User adds sets: POST /workouts/exercise/<id>/add-set/ → {set}
  ↓ User marks sets done: POST /workouts/set/<id>/update/ → {set, is_new_pr?}
  ↓ User taps "Finish"
  ↓ POST /workouts/<id>/finish/ (multipart)
     - post_to_feed=true, visibility, description, optional photo
  ↓ Backend: sets workout.duration, creates Post(workout=workout), updates streak
  ↓ {success: true, post_id: "uuid"}
  ↓ Navigate to Feed or show post
```

---

### 3D — Comment on Post

```
User taps comment icon → CommentsSheet (already built)
  ↓ GET /social/{post|checkin}/<id>/comments/ → comments array
  ↓ User types, taps Send
  ↓ POST /social/{post|checkin}/<id>/comments/add/ JSON {text}
  ↓ {success: true, comment: {...}} → prepend to list

Replies:
  ↓ User taps "Reply" on a comment
  ↓ GET /social/comment/<id>/replies/ → replies array
  ↓ User types, taps Send
  ↓ POST /social/comment/<id>/replies/add/ JSON {text}
  ↓ {success: true, reply: {...}}
```

---

### 3E — Share Post

```
User taps share icon on FeedCard → ShareSheet (NOT YET BUILT)
  ↓ GET /social/share/recipients/?q= → {friends, groups}
  ↓ User searches, selects recipients/groups, optional message
  ↓ POST /social/share/send/ JSON {post_id, item_type, recipient_ids, group_ids, message}
  ↓ {success: true, sent_count: 2} → toast "Shared!"
```

---

## Step 4 — React Native Screen Architecture

### Already Built
| Component | Status |
|---|---|
| `FeedScreen` | ✅ Done |
| `FeedCard` + `FeedCardHeader/Body/Actions` | ✅ Done |
| `CommentsSheet` | ✅ Done |
| `CreatePostSheet` | ✅ Done |
| `CheckInSheet` | ✅ Done |
| `PollCard` + `PollOption` | ✅ Done |
| `WorkoutSummaryCard` | ✅ Done |
| `PersonalRecordCard` | ✅ Done |

### Still Needed (for full parity)
| Component | Priority | Notes |
|---|---|---|
| `ShareSheet` | High | Select friends/groups, optional message, share post |
| `LikersSheet` | Medium | Show avatar list of who liked |
| `WorkoutLoggerScreen` | High | Start/add exercises/sets/finish flow |
| `ExerciseCatalogSheet` | High | Search exercises, `GET /workouts/api/catalog/` |

---

## Step 5 — API Layer Spec

### Already Implemented

| File | Functions |
|---|---|
| `api/feed.ts` | `fetchFeed`, `fetchUserPosts`, `searchFeed`, `toggleLike`, `deletePost`, `deleteCheckin`, `createPost`, `createCheckin` |
| `api/comments.ts` | `fetchComments`, `addComment`, `deleteComment`, `fetchReplies`, `addReply`, `toggleCommentLike` |
| `api/polls.ts` | `votePoll`, `fetchPollVoters` |
| `api/accounts.ts` | `apiLogin`, `apiSignup`, `fetchMe`, `fetchProfile`, `searchUsers`, `toggleFollow`, `fetchFollowers`, `fetchFollowing`, `savePR`, `deletePR` |

### Missing — Need to Add

**1. `fetchLikers`** — in `api/feed.ts`:
```typescript
export async function fetchLikers(
  itemId: string,
  itemType: 'post' | 'checkin',
): Promise<Array<{id: string; username: string; display_name: string; avatar_url: string | null}>> {
  const endpoint = itemType === 'post'
    ? ENDPOINTS.postLikers(itemId)
    : ENDPOINTS.checkinLikers(itemId);
  const response = await apiClient.get(endpoint);
  return response.data?.likers ?? [];
}
```

**2. `fetchShareRecipients` + `sendShare`** — new `api/share.ts`:
```typescript
export async function fetchShareRecipients(q?: string) { ... }
export async function sendShare(params: {
  postId: string;
  itemType: 'post' | 'checkin';
  recipientIds: string[];
  groupIds: string[];
  message?: string;
}) { ... }
```

**3. Missing `ENDPOINTS` entries**:
```typescript
postLikers: (id: ID) => `${BASE}/post/${id}/likers/`,
checkinLikers: (id: ID) => `${BASE}/checkin/${id}/likers/`,
shareRecipients: `${BASE}/share/recipients/`,
sendShare: `${BASE}/share/send/`,
```

---

## Step 6 — Minimal Backend Changes

**Nothing is needed** for the features above. The backend is already fully API-ready:

- `feed_view`: detects `Authorization: Token` header → returns JSON
- `create_checkin_view`: handles multipart form
- `create_post_view`: handles both multipart (media) and JSON (text-only)
- `vote_poll_view`: returns full poll shape (already updated in previous session)
- All comment, like, delete, reply endpoints: return JSON
- `search_feed_view` + `/accounts/api/search-users/`: already return JSON

**The only additions already made** (from previous session):
- `poll_voters_view` endpoint
- `poll/<id>/voters/` URL

### No new backend endpoints are required for any priority feature.

---

## Appendix — Important Backend Behavior Notes

1. **Feed `type` field**: Backend emits `"post"` for text posts, `"checkin"` for check-ins, and `"workout"` for workout-linked posts. Frontend normalizes `"workout"` → `"post"` in `adaptFeedItem`.

2. **Poll `user_voted` vs `user_vote_id`**: Backend sends `user_voted` (string UUID or null). Frontend type uses `user_vote_id`. The adapter in `feed.ts` maps `raw.poll.user_voted` → `user_vote_id`.

3. **Check-in visibility**: Always `"friends"` — check-ins only appear in the Friends tab. This is hardcoded in `create_checkin_view`.

4. **Post visibility**: `"main"` or `"friends"` — user-selectable in `CreatePostSheet`.

5. **`total_workouts` decrement**: Both `delete_post_view` and `delete_checkin_view` decrement `user.total_workouts` (floor 0). The delete endpoints return `{success, total_workouts}` — update the profile store after deleting.

6. **Comment `text` vs `description`**: The `Comment` model field is named `description`, but the API response serializes it as `text`. The RN type should use `text`.

7. **Share uses messaging**: `sendShare` creates DM/group messages with a post attachment — it doesn't create a new feed post.

8. **Auth detection in feed_view**:
   ```python
   is_ajax = (
       request.headers.get('X-Requested-With') == 'XMLHttpRequest'
       or cursor  # any cursor param
       or request.headers.get('Authorization', '').startswith('Token ')
   )
   ```
   Mobile clients always get JSON because they send `Authorization: Token`.
