# Spottr UI Redesign Notes

## Overview

This document records the decisions, file locations, and invariants for the v1 UI redesign.
The redesign converts the app from a **dark blue** theme to the **light cyan** Spottr brand shown in `docs/design.png`.

---

## Theme / Token Locations

| Token file | Path | Exports |
|---|---|---|
| Colors | `src/theme/colors.ts` | `colors` |
| Spacing | `src/theme/spacing.ts` | `spacing` |
| Typography | `src/theme/typography.ts` | `typography` |
| Border Radii | `src/theme/radii.ts` | `radii` |
| Shadows | `src/theme/shadows.ts` | `shadow()`, `shadowsIOS`, `elevationAndroid` |
| Barrel export | `src/theme/index.ts` | all of the above |

### Colour Mapping (old dark → new light)

| Token | Old value | New value |
|---|---|---|
| `colors.brand.primary` / `colors.primary` | `#3B82F6` | `#4FC3E0` (Spottr Cyan) |
| `colors.brand.primaryDark` | `#2563EB` | `#2FA4C7` |
| `colors.background.base` | `#08080F` | `#FFFFFF` |
| `colors.background.card` | `#16161F` | `#FFFFFF` |
| `colors.background.elevated` | `#1E1E28` | `#F9FAFB` |
| `colors.text.primary` | `#F0F0F5` | `#111827` |
| `colors.text.secondary` | `#9898A8` | `#6B7280` |
| `colors.text.muted` | `#5A5A6E` | `#9CA3AF` |
| `colors.border.subtle` | `rgba(255,255,255,0.06)` | `rgba(0,0,0,0.05)` |
| `colors.border.default` | `rgba(255,255,255,0.08)` | `#E5E5E5` |
| `colors.tab.indicator` | `#3B82F6` | `#4FC3E0` |

The `colors` object retains **both** the nested structure (for backward compat) and flat tokens matching the spec:
```ts
colors.primary          // flat — preferred in new components
colors.brand.primary    // nested — still works everywhere
```

---

## Component Inventory

### New Components

| Component | Path | Purpose |
|---|---|---|
| `AppHeader` | `src/components/navigation/AppHeader.tsx` | Gradient header shell: bell/addFriend icon buttons, Spottr logo, story-ring avatar |
| `CustomTabBar` | `src/components/navigation/CustomTabBar.tsx` | Floating pill bottom nav with 4 tab icons + active dot + cyan FAB |

### Updated Components

| Component | Key visual changes |
|---|---|
| `FeedCard` | White bg, 24px radius, medium shadow (no dark border) |
| `FeedCardHeader` | 40px avatar, bold name, "Posted in X · time" subtitle, three-dot overflow |
| `FeedCardBody` | `#111827` body text, light line-height |
| `FeedCardActions` | `#9CA3AF` icon color, subtle top border |
| `FeedCardImage` | Removed dark border, kept 16px radius |
| `FeedTabs` | Light-cyan gradient bg, white active/inactive tab labels, white indicator, streak badge |
| `Avatar` | Cyan fallback bg, white initials, no dark border on image |
| `EmptyState` | `#F9FAFB` icon bg, dark text |
| `WorkoutSummaryCard` | `#F9FAFB` bg, `#E5E5E5` borders, cyan accent |
| `PersonalRecordCard` | Emerald gradient, updated green token |
| `LinkPreview` | `#F9FAFB` bg, `#E5E5E5` border |
| `PollOption` | Cyan fill bar/selected state, `#E5E5E5` border |
| `PollCard` | Dark primary text |
| `CommentsSheet` | White bg, 24px top radius, gray handle |
| `CommentItem` | Dark text, flat tokens |
| `CommentInput` | `#F9FAFB` input bg, `#E5E5E5` border |
| `ReplyItem` | Dark text, flat tokens |
| `InactiveStreakSheet` | White bg, 24px top radius, gray handle |

### Navigation Changes

- `MainTabs.tsx` — passes `tabBar={props => <CustomTabBar {...props} />}` to `Tab.Navigator`; native tab bar hidden
- `FeedScreen.tsx` — removed `insets.top` padding hack; `AppHeader` now owns the top safe area via `useSafeAreaInsets` internally
- `App.tsx` — `dark: false` nav theme, `StatusBar style="dark"`, loading spinner uses `colors.primary`

---

## Spec Ambiguities & Decisions

| Ambiguity | Decision |
|---|---|
| Gradient extent for header | Used `['#4FC3E0','#7DD6ED','#B3EAF6','#E8F8FD','#FFFFFF']` to fade from cyan to white naturally over the header + tabs area |
| Tab labels | Changed "Main/Friends" → "Discover/Following" to match screenshot; **keys unchanged** (`main`/`friends`) |
| FAB functionality | FAB renders correctly; create flow is not yet implemented — pressing FAB is a no-op until a create screen is built |
| Video icon on Notifications tab | Screenshot shows video-camera icon for 3rd tab; Notifications tab now uses `video` Feather icon to match screenshot while keeping route name `Notifications` |
| `notificationCount` prop | Hardcoded to `3` in `FeedScreen` as sample data; should be wired to a real notification count hook when that feature is built |
| Streak badge in FeedTabs | `streakCount` prop defaults to `undefined` (hidden); wire to `user.streak` from `AuthContext` when ready |
| Custom fonts | Kept `Inter` (already loaded); spec says "system default" but Inter is sufficiently neutral |
| Blur for create menu buttons | Not implemented (no create menu yet); `rgba(255,255,255,0.2)` fallback ready in spec |

---

## Functional Invariants Checklist

The following were **not changed** in this redesign:

- [x] Navigation structure — routes `Feed`, `Explore`, `Notifications`, `Profile` unchanged; param shapes unchanged
- [x] Tab keys — `main` / `friends` unchanged in `useFeed`, hook state, and API calls
- [x] API calls — all endpoints, request/response handling, error paths untouched
- [x] Business logic — `useFeed`, `useToggleLike`, `usePollVote`, `useComments` hooks unmodified
- [x] Auth flow — `AuthContext`, `expo-secure-store`, Axios interceptors unmodified
- [x] Validation rules — `CommentInput` max-length 500, empty check; `handleSubmit` guard unchanged
- [x] Optimistic updates — like/poll vote optimistic UI logic unchanged
- [x] Haptic feedback — `expo-haptics` calls in `FeedCardActions` unchanged
- [x] Clipboard share — `expo-clipboard` call in `FeedCardActions` unchanged
- [x] Comment threading — load-replies, post-reply, show/hide replies logic unchanged
- [x] `CommentsSheet` snap points — `['50%', '85%']` unchanged
- [x] Pull-to-refresh — `RefreshControl` wiring unchanged
- [x] `FeedCard` animation — `FadeInDown.delay(index * 80).duration(400)` unchanged
- [x] Like scale animation — `withSequence(withTiming, withSpring)` unchanged
- [x] Poll bar animation — `withTiming(percentage, { duration: 600, easing: Easing.out(Easing.cubic) })` unchanged
- [x] GroupProfileScreen — data fetching, streak logic, member filtering unchanged
- [x] `InactiveStreakSheet` — flagging logic (`has_activity_today`, `current_streak === 0`) unchanged
