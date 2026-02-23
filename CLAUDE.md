# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Repository Layout

```
Spottr/
├── backend/    # Django 6 + DRF REST API
└── frontend/   # React Native + Expo 54 mobile app
```

---

## Backend (Django)

### Running

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver          # http://127.0.0.1:8000
```

Settings are split: `config/settings/base.py`, `dev.py`, `prod.py`. Dev is the default. Copy `.env.example` → `.env` and fill in values before running.

### Django Apps

| App | Responsibility |
|-----|---------------|
| `accounts` | Custom User model, token auth, profiles, follow system |
| `social` | Feed posts, check-ins, likes, comments, polls |
| `workouts` | Workout sessions, ExerciseCatalog, PersonalRecord, streaks |
| `gyms` | Gym listings, enrollment, busy-level tracking |
| `groups` | Group membership, group activity streaks |
| `messaging` | 1:1 and group chat |
| `notifications` | Activity notifications feed |
| `common` | `TokenAuthMiddleware` (shared middleware/utilities) |

### API Authentication

All mobile API views use DRF `@api_view` + `@permission_classes([IsAuthenticated])`. This supports both **token auth** (mobile) and **session auth** (web). Do **not** use Django's `@login_required` on any endpoint that the mobile app calls — it only works with session cookies.

### URL Structure

```
/accounts/          # Web auth + profile HTML views
/api/accounts/      # Mobile: login, signup, profile, follow, PRs
/workouts/          # Workout HTML views + /workouts/api/* mobile endpoints
/social/            # Feed HTML views
/api/social/        # Feed, posts, comments, likes
/api/gyms/
/api/groups/
/api/messaging/
/api/notifications/
```

---

## Frontend (React Native / Expo)

### Running

```bash
cd frontend
npm install
npm start           # Expo dev server — scan QR with Expo Go, or press i/a for simulator
```

### API Base URL

Configured in `src/api/client.ts`:
- **Native dev**: `http://192.168.5.105:8000` — update this IP to your machine's LAN IP when backend and device are on the same network.
- **Web dev**: `http://localhost:8000`
- **Production**: `https://api.spottr.app`

The Axios client automatically attaches `Authorization: Token <token>` on every request. Token is stored via `expo-secure-store` (native) or `localStorage` (web).

### Navigation Architecture

Two-level stack structure:

```
RootStack (no tab bar — used for modals/full-screen overlays)
└── MainTabs (bottom tab bar always visible)
    ├── FeedStack     → FeedHome, Profile, UserList
    ├── GymsStack     → GymList, GymDetail, CreateInvite, Profile, UserList
    ├── SocialStack   → SocialHome, Profile, UserList
    └── RanksStack    → RanksHome, Profile, UserList
```

`Profile` and `UserList` are registered in **both** each tab stack (tab bar stays visible) and the RootStack (for navigation from outside a tab). When adding screens that should keep the tab bar, register them in every tab stack in `MainTabs.tsx` and add the params to all four stack param lists in `navigation/types.ts`.

Screens that need to live in RootStack (full-screen, modal, or accessed from notifications): `EditProfile`, `Chat`, `GroupChat`, `GroupProfile`, `WorkoutLog`, `ActiveWorkout`, `StreakDetails`, `Notifications`.

### State Management

- **`AuthContext`** (`src/store/AuthContext.tsx`): auth token + current user. All screens access the logged-in user via `useAuth()`.
- **`UnreadCountContext`** (`src/store/UnreadCountContext.tsx`): notification/message badge counts.
- No Redux or Zustand — Context only.

### API Layer

All API calls go through `src/api/client.ts` (Axios instance). Endpoint paths are centralised in `src/api/endpoints.ts`. Feature-specific helpers live in `src/api/{feature}.ts` (e.g. `accounts.ts`, `feed.ts`, `workouts.ts`).

### Theme

Design tokens are in `src/theme/` and exported from `src/theme/index.ts`. Always import from `../../theme` rather than hardcoding colours, spacing, or font sizes. Primary brand colour: `#4FC3E0` (light cyan).

### Key Patterns

- Navigation prop type is `any` on `ProfileScreen` and `UserListScreen` so they can live in any tab stack while still navigating to root-stack screens at runtime.
- Expo AV (`expo-av`) has been replaced with `expo-video`. Use `VideoView` + `useVideoPlayer` from `expo-video` for any video playback. `useVideoPlayer` must be called in a component (hook rules), so extract video players into sub-components.
- Profile post grid loads 9 posts initially; subsequent pages load automatically when the user scrolls near the bottom of the main `ScrollView` (`onScroll` + `scrollEventThrottle`).

---

## Git Workflow

Branch from `dev`, submit PRs back to `dev`. `main` is the stable/production branch.
