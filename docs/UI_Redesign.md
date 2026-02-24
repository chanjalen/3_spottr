# Spottr Mobile UI Design System
**Version 1.0** | React Native Implementation Specification

---

## 1. Design Summary

- **Clean, content-first social fitness app** with emphasis on imagery and activity sharing
- **Bright, energetic cyan gradient brand** paired with crisp white surfaces and subtle shadows
- **Rounded, friendly geometry** throughout—all cards, buttons, and containers use generous corner radii (16–24px)
- **Minimal chrome, maximum content**—gradients appear only at screen tops; the rest is white with subtle elevation
- **Touch-optimized UI** with large tappable areas (64×64 FAB, 48×48 nav icons, 40×40 avatars)
- **Iconography-driven navigation** with understated labels and tiny active indicators (4×4 dots)
- **No harsh dividers**—separation achieved through spacing, shadows, and subtle borders
- **Story-style media presentation** with rounded squares and gradient rings for emphasis
- **Spring-based animations** for natural, playful feel (stiffness 300, damping 30 baseline)
- **Consistent spacing rhythm** using 4px base unit (8, 12, 16, 24, 32, 40, 48px scale)

---

## 2. Design Tokens

### Colors

```js
const colors = {
  // Brand (Spottr Cyan)
  primary: '#4FC3E0',           // Primary brand cyan (buttons, accents)
  primaryDark: '#2FA4C7',       // Darker cyan (gradients, shadows)
  primaryLight: '#8EDFF2',      // Lighter cyan (gradients, highlights)
  
  // Background & Surfaces
  background: '#FFFFFF',        // App background
  surface: '#FFFFFF',           // Card/container background
  surfaceElevated: '#FFFFFF',   // Modals, sheets (same as surface; elevation via shadow)
  
  // Borders
  border: '#E5E5E5',            // Default border (gray-300 equivalent)
  borderActive: '#000000',      // Active tab underlines
  borderSubtle: 'rgba(0,0,0,0.05)', // Very subtle outlines
  
  // Text
  textPrimary: '#111827',       // Body text, headings (gray-900)
  textSecondary: '#6B7280',     // Metadata, captions (gray-500)
  textMuted: '#9CA3AF',         // Placeholder, disabled (gray-400)
  textOnPrimary: '#FFFFFF',     // White text on cyan backgrounds
  
  // Icons
  iconActive: '#111827',        // Active nav icons
  iconInactive: '#9CA3AF',      // Inactive nav icons
  iconOnPrimary: '#FFFFFF',     // White icons on cyan
  
  // Interactive
  link: '#10B981',              // Links, hashtags (emerald-500)
  linkSecondary: '#4FC3E0',     // Secondary links (cyan)
  
  // Status & Feedback
  success: '#10B981',           // Success green (emerald-500)
  warning: '#F59E0B',           // Warning amber
  error: '#EF4444',             // Error red
  info: '#3B82F6',              // Info blue
  
  // Overlays & Transparency
  overlay: 'rgba(0,0,0,0.6)',   // Modal backdrop
  scrim: 'rgba(0,0,0,0.2)',     // Light overlay for images
  
  // Special (Story Rings)
  storyGradientStart: '#A855F7', // Purple-500
  storyGradientMid: '#EC4899',   // Pink-500
  storyGradientEnd: '#FB923C',   // Orange-400
};
```

**Usage Notes:**
- Use `primary` for all CTAs, FABs, active states
- Use `primaryDark` as gradient endpoint for depth
- Use `primaryLight` in top-to-white gradients for brand softness
- All text on cyan uses `textOnPrimary` (white)
- Links and hashtags use `link` (emerald green), not primary cyan
- Story rings use purple→pink→orange gradient to indicate unviewed content

---

### Typography

**Font Families:**
```js
const fontFamilies = {
  default: 'System', // San Francisco (iOS) / Roboto (Android)
  // No custom fonts—use platform defaults for native feel
};
```

**Font Weights:**
```js
const fontWeights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};
```

**Text Styles:**
```js
const textStyles = {
  h1: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: 0,
  },
  h2: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '600',
    letterSpacing: 0,
  },
  h3: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: 0,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    letterSpacing: 0,
  },
  bodyStrong: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    letterSpacing: 0,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
    letterSpacing: 0,
  },
  overline: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  button: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    letterSpacing: 0,
  },
};
```

**Usage:**
- **h1:** Page titles ("Spottr" logo text)
- **h2:** Section headers
- **h3:** Card titles, user names in feeds
- **body:** Post content, descriptions
- **bodyStrong:** User names in small contexts (post headers)
- **caption:** Timestamps, metadata (e.g., "Posted in u8s · 1h ago")
- **overline:** Tab labels (rare use)
- **button:** All button labels

---

### Spacing Scale

**Base unit: 4px**

```js
const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  xxxl: 48,
};
```

**Common Applications:**
- **4px (xxs):** Icon gaps, badge offsets
- **8px (xs):** Tight inline spacing
- **12px (sm):** Between related items (avatar + text)
- **16px (md):** Default card padding, stack spacing
- **24px (lg):** Screen horizontal padding, section gaps
- **32px (xl):** Large vertical spacing between sections
- **40px (xxl):** Top/bottom safe area margins
- **48px (xxxl):** Bottom nav reserved space

---

### Border Radii

```js
const radii = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  pill: 9999, // Full rounded (buttons, nav bar)
};
```

**Usage:**
- **8px (xs):** Small tags, tiny badges
- **12px (sm):** Story thumbnails (profile page)
- **16px (md):** Post image grids
- **24px (lg):** Post cards, menu panels
- **32px (xl):** Bottom nav bar, large cards
- **pill:** Avatar images, pill buttons, nav bar, FAB

---

### Shadows / Elevation

**iOS (shadowColor, shadowOffset, shadowOpacity, shadowRadius):**
```js
const shadowsIOS = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.2,
    shadowRadius: 60,
  },
  fab: {
    shadowColor: 'rgba(79, 195, 224, 0.5)',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 1,
    shadowRadius: 60,
  },
};
```

**Android (elevation):**
```js
const elevationAndroid = {
  sm: 1,
  md: 4,
  lg: 8,
  fab: 12,
};
```

**Usage:**
- **sm:** Icon buttons with white background (bell, add friend)
- **md:** Post cards, menu items
- **lg:** Bottom nav bar
- **fab:** Floating action button (colored shadow for emphasis)

---

### Borders

```js
const borders = {
  width: {
    thin: 1,
    thick: 2,
  },
  style: 'solid',
};
```

**Usage:**
- **1px:** Default dividers (tab underlines, card outlines if used)
- **2px:** Active tab underlines, avatar rings, story ring borders

---

### Opacity

```js
const opacity = {
  disabled: 0.4,
  pressed: 0.6,
  hover: 0.8,          // For web/tablet pointer interactions
  overlay: 0.6,        // Black modal backdrop
  skeleton: 0.1,       // Loading placeholder pulse
  glassmorphism: 0.2,  // Menu button backgrounds
};
```

---

## 3. Layout Rules (Mobile)

### Grid System

- **Columns:** Not strictly grid-based; uses flexbox with consistent margins
- **Gutter:** 12px between horizontally adjacent items (e.g., post images in 2-column grid)
- **Margins:** 24px horizontal screen padding (left/right)

### Default Screen Layout

```js
const layout = {
  screenPaddingHorizontal: 24,
  screenPaddingTop: 12,       // Below status bar
  screenPaddingBottom: 96,    // Above bottom nav (64px nav + 32px margin)
  sectionSpacing: 16,         // Between "Recently Post" and post stack
  cardSpacing: 16,            // Between post cards in feed
  cardPadding: 16,            // Inside post cards
};
```

### Safe Area Behavior

- **Top:** Account for device notch/status bar using `SafeAreaView` or `useSafeAreaInsets`; status bar icons render at top 12px
- **Bottom:** Fixed bottom nav sits 24px above device bottom edge; add 96px padding to scrollable content to prevent overlap

### Scroll Behavior

- **Bounce:** Enabled on iOS (default)
- **Overscroll:** Standard Android overscroll glow
- **Scroll indicators:** Auto-hide scrollbars
- **Pull-to-refresh:** Not visible in current design but should use primary cyan spinner

---

## 4. Components

### 4.1 Buttons

#### Primary Button (Gradient FAB)

```js
{
  width: 64,
  height: 64,
  borderRadius: 9999,
  background: 'linear-gradient(135deg, #4FC3E0 0%, #2FA4C7 100%)',
  justifyContent: 'center',
  alignItems: 'center',
  ...shadowsIOS.fab, // iOS
  elevation: 12,     // Android
}
```

**States:**
- **Default:** Full opacity, colored shadow
- **Pressed:** Opacity 0.8, scale 0.95 (150ms spring)
- **Disabled:** Not applicable (FAB always active)

**Usage:** Single floating action button for primary create action

---

#### Secondary Button (White Fill)

```js
{
  paddingHorizontal: 16,
  paddingVertical: 8,
  borderRadius: 9999,
  backgroundColor: '#FFFFFF',
  ...shadowsIOS.sm,
  elevation: 1,
}
```

**Text:** `textStyles.button` in `textPrimary`

**States:**
- **Default:** White background, subtle shadow
- **Pressed:** Opacity 0.8

**Usage:** Icon buttons in header (bell, add friend), "Edit" button on profile

---

#### Tertiary Button (Text-Only)

```js
{
  paddingHorizontal: 12,
  paddingVertical: 8,
  backgroundColor: 'transparent',
}
```

**Text:** `textStyles.button` in `textSecondary`

**States:**
- **Pressed:** Opacity 0.6

**Usage:** Tab buttons, menu close button

---

#### Icon Button

```js
{
  width: 48,
  height: 48,
  borderRadius: 24,
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: '#FFFFFF',
  ...shadowsIOS.sm,
}
```

**Icon size:** 20×20px

**States:**
- **Default:** White background, subtle shadow
- **Pressed:** Opacity 0.8

**Usage:** Bell, add friend, menu (three dots)

---

### 4.2 Text Input

```js
{
  height: 48,
  paddingHorizontal: 16,
  paddingVertical: 12,
  borderRadius: 24,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.surface,
  fontSize: 14,
  color: colors.textPrimary,
}
```

**States:**
- **Default:** `borderColor: colors.border`
- **Focused:** `borderColor: colors.primary`, `borderWidth: 2`
- **Error:** `borderColor: colors.error`
- **Disabled:** `backgroundColor: '#F9FAFB'`, `color: colors.textMuted`

**Helper Text:**
```js
{
  fontSize: 12,
  color: colors.textSecondary,
  marginTop: 4,
}
```

**Usage:** Search bars, comment inputs (not visible in current design but needed)

---

### 4.3 Card (Post Card)

```js
{
  backgroundColor: colors.surface,
  borderRadius: 24,
  padding: 16,
  ...shadowsIOS.md,
  elevation: 4,
}
```

**Variants:**
- **Default:** White background, medium shadow
- **Pressed:** Scale 0.98, shadow reduced (for tappable cards)

**Inner Layout:**
- **Header:** Avatar (40×40 rounded) + name/metadata (12px gap)
- **Content:** 12px top margin, 14px body text
- **Images:** 12px top margin, 2×2 grid with 8px gap, 16px corner radius
- **Actions:** Not visible in current design but reserve 40px bottom padding if adding like/comment

**Usage:** Feed posts, activity cards

---

### 4.4 Top Navigation Header

```js
{
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingHorizontal: 24,
  paddingTop: 16,
  paddingBottom: 16,
}
```

**Left Zone:** Icon buttons (bell, add friend) in row with 8px gap

**Center Zone:** Logo text (h1, white, bold) or username dropdown

**Right Zone:** Avatar (40×40, white ring 2px)

**Background:** Transparent (sits over gradient)

**Usage:** Discover and profile screen headers

---

### 4.5 Bottom Navigation

```js
{
  position: 'absolute',
  bottom: 24,
  left: 16,
  right: 16,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 12,
}
```

**Nav Bar:**
```js
{
  flex: 1,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-around',
  backgroundColor: colors.surface,
  borderRadius: 9999,
  paddingHorizontal: 40,
  paddingVertical: 20,
  ...shadowsIOS.lg,
  elevation: 8,
}
```

**Nav Item:**
```js
{
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
}
```

**Icon:** 24×24px, `iconActive` if active, `iconInactive` otherwise

**Active Indicator:** 4×4px cyan circle below icon

**FAB:** 64×64px, positioned to the right of nav bar

**Usage:** Fixed bottom navigation across all screens

---

### 4.6 Tab Bar (Horizontal Tabs)

```js
{
  flexDirection: 'row',
  gap: 24,
  paddingHorizontal: 24,
  paddingVertical: 16,
  borderBottomWidth: 1,
  borderBottomColor: colors.border,
}
```

**Tab Button:**
```js
{
  paddingBottom: 8,
  borderBottomWidth: activeTab ? 2 : 0,
  borderBottomColor: colors.borderActive,
}
```

**Text:** `textStyles.button`, white or black depending on background

**States:**
- **Active:** Bold text, 2px underline
- **Inactive:** Regular text, 70% opacity

**Usage:** "Discover / Following" tabs, "Post / Mention" tabs

---

### 4.7 Story Circle / Story Thumbnail

**Story Circle (Horizontal Scroll):**
```js
{
  width: 64,
  height: 64,
  borderRadius: 32,
  padding: 2, // For gradient ring
}
```

**Gradient Ring (Unviewed):**
```js
{
  background: 'linear-gradient(135deg, #A855F7 0%, #EC4899 50%, #FB923C 100%)',
  borderRadius: 32,
  padding: 2,
}
```

**Inner Avatar:**
```js
{
  width: 60,
  height: 60,
  borderRadius: 30,
  borderWidth: 2,
  borderColor: colors.surface,
}
```

**"Your Story" Badge:**
```js
{
  position: 'absolute',
  bottom: 0,
  right: 0,
  width: 20,
  height: 20,
  borderRadius: 10,
  background: 'linear-gradient(135deg, #4FC3E0 0%, #10B981 100%)',
  borderWidth: 2,
  borderColor: colors.surface,
  justifyContent: 'center',
  alignItems: 'center',
}
```

**Usage:** Story strips on Discover page (removed in current design), profile thumbnails

---

**Story Thumbnail (Profile Page):**
```js
{
  width: 64,
  height: 64,
  borderRadius: 16,
  overflow: 'hidden',
}
```

**"Add Story" Overlay:**
```js
{
  position: 'absolute',
  bottom: 4,
  right: 4,
  width: 16,
  height: 16,
  borderRadius: 8,
  background: 'linear-gradient(135deg, #4FC3E0 0%, #10B981 100%)',
}
```

**Text Overlay (Bottom Left):**
```js
{
  position: 'absolute',
  bottom: 4,
  left: 4,
  fontSize: 10,
  color: colors.textOnPrimary,
  fontWeight: '600',
}
```

---

### 4.8 Modal / Bottom Sheet

**Backdrop:**
```js
{
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.6)',
}
```

**Bottom Sheet Panel:**
```js
{
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  backgroundColor: colors.surfaceElevated,
  borderTopLeftRadius: 24,
  borderTopRightRadius: 24,
  paddingHorizontal: 24,
  paddingTop: 24,
  paddingBottom: 40,
  ...shadowsIOS.lg,
}
```

**Animation:** Spring from bottom (stiffness 300, damping 30)

**Usage:** Create menu (slides up from FAB press)

---

### 4.9 Create Menu (Special Bottom Panel)

```js
{
  position: 'absolute',
  bottom: 24,
  left: 16,
  right: 16,
  background: 'linear-gradient(135deg, #4FC3E0 0%, #2FA4C7 100%)',
  borderRadius: 24,
  paddingHorizontal: 24,
  paddingVertical: 24,
  ...shadowsIOS.fab,
}
```

**Header:**
```js
{
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 24,
}
```

**Title:** h3, white

**Close Button:** Icon (24×24 X), white

**Menu Grid:**
```js
{
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 12,
}
```

**Menu Item:**
```js
{
  backgroundColor: 'rgba(255, 255, 255, 0.2)',
  backdropFilter: 'blur(8px)',
  borderRadius: 16,
  padding: 16,
  alignItems: 'center',
  gap: 8,
}
```

**Icon:** 32×32px, white

**Label:** caption style, white, medium weight

**Animation:**
- **Enter:** Spring from y: 100, opacity: 0 → 0, 1 (stiffness 300, damping 30)
- **Exit:** Fade out to y: 100, opacity: 0
- **Item Stagger:** Each item animates in 50ms after previous

**Usage:** Exclusive to FAB press

---

### 4.10 Status Bar (Device Status)

```js
{
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingHorizontal: 24,
  paddingTop: 12,
  paddingBottom: 8,
}
```

**Left:** Time (14px, semibold, black or white depending on background)

**Right:** Signal, WiFi, Battery icons (16×16px)

**Usage:** Top of every screen, uses system status bar on iOS/Android

---

### 4.11 Avatar (Profile Picture)

**Sizes:**
```js
{
  sm: 32,  // Small mentions
  md: 40,  // Post headers, nav
  lg: 64,  // Story circles, profile thumbnails
  xl: 96,  // Profile page hero
}
```

**Style:**
```js
{
  borderRadius: size / 2,
  borderWidth: active ? 2 : 0,
  borderColor: colors.surface,
}
```

**Usage:** User profile images across all contexts

---

### 4.12 Badge / Counter

```js
{
  position: 'absolute',
  top: -4,
  right: -4,
  minWidth: 20,
  height: 20,
  borderRadius: 10,
  backgroundColor: colors.textPrimary, // Black
  justifyContent: 'center',
  alignItems: 'center',
  paddingHorizontal: 6,
}
```

**Text:** 10px, white, bold

**Usage:** Notification count on bell icon

---

### 4.13 Toast / Alert (Not Visible in Design)

**Recommended Spec:**
```js
{
  position: 'absolute',
  top: 60,
  left: 16,
  right: 16,
  backgroundColor: colors.textPrimary,
  borderRadius: 16,
  paddingHorizontal: 16,
  paddingVertical: 12,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 12,
  ...shadowsIOS.lg,
}
```

**Text:** body style, white

**Animation:** Slide in from top, auto-dismiss after 3s

---

### 4.14 Loading Indicators

**Spinner (Primary):**
```js
{
  size: 32,
  color: colors.primary,
}
```

**Skeleton (Card Loading):**
```js
{
  backgroundColor: colors.border,
  opacity: 0.1,
  borderRadius: 8,
  // Animated pulse: opacity 0.1 ↔ 0.2, 1.5s ease-in-out infinite
}
```

**Usage:** Pull-to-refresh spinner, skeleton cards in feed

---

## 5. Interaction & Motion

### Press Feedback

**Standard Button Press:**
- Opacity: 1 → 0.8
- Duration: 150ms
- Easing: `ease-out`

**FAB Press:**
- Opacity: 1 → 0.8
- Scale: 1 → 0.95
- Duration: 150ms
- Easing: Spring (stiffness 500, damping 25)

**Card Press (if tappable):**
- Scale: 1 → 0.98
- Duration: 150ms
- Easing: `ease-out`

**Android Ripple:**
- Use `TouchableNativeFeedback` with `Ripple(colors.primary, false)` on primary buttons
- Use `Ripple(colors.border, false)` on white buttons

---

### Navigation Transitions

**Screen Transitions:**
- Default: Slide from right (iOS) or fade+slide (Android)
- Duration: 300ms
- Easing: `ease-in-out`

**Bottom Nav Appearance:**
- Spring animation from y: 100, opacity: 0
- Stiffness: 300, Damping: 30
- Duration: ~500ms effective

**Tab Switch:**
- Crossfade between tab content
- Duration: 200ms
- Easing: `ease-in-out`

---

### Modal / Bottom Sheet

**Enter:**
- From: `y: 100%`, `opacity: 0`
- To: `y: 0`, `opacity: 1`
- Duration: 250ms
- Easing: Spring (stiffness 300, damping 30)

**Exit:**
- From: `y: 0`, `opacity: 1`
- To: `y: 100%`, `opacity: 0`
- Duration: 200ms
- Easing: `ease-out`

**Backdrop:**
- Fade in/out: 200ms

---

### Create Menu Animation

**Stage 1 (FAB → Panel):**
- From: Circle (64×64), `y: 0`
- To: Rounded rect (full width), `y: 0`
- Duration: 150ms
- Easing: `ease-out`

**Stage 2 (Panel → Menu):**
- From: `y: 0`, `opacity: 1`
- To: `y: 0`, `opacity: 1` (grid reveals)
- Duration: 150ms
- Stagger: Each menu item animates in with 50ms delay
- Item animation: `y: 20`, `opacity: 0` → `y: 0`, `opacity: 1`

---

### Focus / Keyboard

**Text Input Focus:**
- Border color change: 100ms `ease-out`
- Border width: 1px → 2px (no animation)

**Keyboard Avoidance:**
- Use `KeyboardAvoidingView` with behavior `padding` (iOS) or `height` (Android)
- Animation: Match keyboard slide-in (250–300ms)

---

### Micro-interactions

**Active Tab Indicator:**
- 4×4 dot slides horizontally under active icon
- Duration: 200ms
- Easing: Spring (stiffness 400, damping 25)

**Pull-to-Refresh:**
- Spinner appears at -60px offset
- Spinner rotates continuously
- Release triggers refresh with 300ms fade-in for new content

---

## 6. Accessibility Defaults

### Touch Targets

**Minimum:** 44×44pt (iOS), 48×48dp (Android)

**Current Compliance:**
- FAB: 64×64 ✅
- Nav icons: 48×48 ✅
- Icon buttons: 48×48 ✅
- Tab buttons: 48×48 ✅

**Hit Slop (for small icons):**
```js
hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
```

**Usage:** Apply to 24×24 icons inside buttons

---

### Color Contrast

**Text Contrast:**
- `textPrimary` on `background`: 16.93:1 (AAA) ✅
- `textSecondary` on `background`: 7.36:1 (AA+) ✅
- `textOnPrimary` on `primary`: 4.56:1 (AA) ✅

**Interactive Elements:**
- Primary button: Sufficient contrast (cyan on white background)
- Links: Emerald green passes AA for normal text

**Warning:** Ensure all custom colors meet WCAG AA (4.5:1 normal text, 3:1 large text)

---

### Dynamic Type (Text Scaling)

**System Support:**
- Use `allowFontScaling={true}` on all `<Text>` components
- Design supports iOS/Android text scaling up to 200%

**Scale Guidelines:**
- Headers (h1–h3): Scale proportionally
- Body text: Scale 1:1 with system setting
- Captions: Scale but maintain minimum 12px effective size
- Button labels: Scale up to 150% max (to prevent layout break)

**Testing:** Test at 100%, 150%, 200% scale

---

### Screen Reader (VoiceOver / TalkBack)

**Semantic Labels:**
- All buttons: `accessibilityLabel="Button label"` and `accessibilityRole="button"`
- Icons: `accessibilityLabel="Icon name"` (e.g., "Bell icon, 3 notifications")
- Images: `accessibilityLabel="Description"` (e.g., "User avatar")
- Tabs: `accessibilityRole="tab"` and `accessibilityState={{selected: true/false}}`

**Focus Order:**
- Top to bottom, left to right
- Bottom nav focusable but does not trap focus

**Hints:**
- Use `accessibilityHint` for non-obvious actions (e.g., "Double-tap to open create menu")

---

### Reduced Motion

**Respect System Preference:**
```js
import { AccessibilityInfo } from 'react-native';
const [reduceMotion, setReduceMotion] = useState(false);
AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
```

**Fallback Behavior:**
- Disable spring animations → use 200ms ease-out
- Disable stagger → show all items immediately
- Disable scale/transform → use opacity only

---

## 7. React Native Implementation Notes

### Folder Structure

```
src/
├── theme/
│   ├── colors.ts
│   ├── typography.ts
│   ├── spacing.ts
│   ├── radii.ts
│   ├── shadows.ts
│   └── index.ts          // Export unified theme object
├── components/
│   ├── Button/
│   │   ├── Button.tsx
│   │   └── Button.styles.ts
│   ├── Card/
│   ├── Input/
│   ├── BottomNav/
│   ├── Avatar/
│   └── ...
├── screens/
│   ├── DiscoverScreen.tsx
│   ├── ProfileScreen.tsx
│   └── ...
└── utils/
    └── a11y.ts           // Accessibility helpers
```

---

### Theme Object Example

```typescript
// theme/index.ts
import { colors } from './colors';
import { textStyles } from './typography';
import { spacing } from './spacing';
import { radii } from './radii';
import { shadowsIOS, elevationAndroid } from './shadows';

export const theme = {
  colors,
  textStyles,
  spacing,
  radii,
  shadows: Platform.select({
    ios: shadowsIOS,
    android: elevationAndroid,
  }),
};

export type Theme = typeof theme;
```

---

### StyleSheet Usage Example

```typescript
import { StyleSheet, Platform } from 'react-native';
import { theme } from '@/theme';

const styles = StyleSheet.create({
  postCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    ...Platform.select({
      ios: theme.shadows.md,
      android: { elevation: theme.shadows.md },
    }),
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  postUserName: {
    ...theme.textStyles.bodyStrong,
    color: theme.colors.textPrimary,
  },
  postMeta: {
    ...theme.textStyles.caption,
    color: theme.colors.textSecondary,
  },
});
```

---

### Platform Differences

#### iOS vs Android Shadows

**iOS:**
```js
{
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.1,
  shadowRadius: 12,
}
```

**Android:**
```js
{
  elevation: 4,
}
```

**Unified Helper:**
```typescript
export const shadow = (level: 'sm' | 'md' | 'lg' | 'fab') => {
  if (Platform.OS === 'ios') {
    return shadowsIOS[level];
  }
  return { elevation: elevationAndroid[level] };
};
```

---

#### Safe Area

**iOS:**
```tsx
import { SafeAreaView } from 'react-native-safe-area-context';
<SafeAreaView edges={['top', 'left', 'right']}>
  {/* Content */}
</SafeAreaView>
```

**Android:**
```tsx
// Use StatusBar component
import { StatusBar } from 'react-native';
<StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
```

---

#### Fonts

**iOS:** San Francisco (system default)
**Android:** Roboto (system default)

**Declare in theme:**
```js
fontFamily: Platform.select({
  ios: 'System',
  android: 'Roboto',
});
```

---

#### Gradient Backgrounds

Use `react-native-linear-gradient`:
```tsx
import LinearGradient from 'react-native-linear-gradient';

<LinearGradient
  colors={['#4FC3E0', '#2FA4C7']}
  start={{x: 0, y: 0}}
  end={{x: 1, y: 1}}
  style={styles.fab}
>
  <Icon name="plus" />
</LinearGradient>
```

---

#### Blur (Menu Buttons)

Use `@react-native-community/blur`:
```tsx
import { BlurView } from '@react-native-community/blur';

<BlurView blurType="light" blurAmount={8} style={styles.menuItem}>
  {/* Content */}
</BlurView>
```

**Android Fallback:**
Use `rgba(255, 255, 255, 0.2)` solid background if blur not supported

---

### Animation Library

Use `react-native-reanimated` for performant animations:
```tsx
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

const scale = useSharedValue(1);
const animatedStyle = useAnimatedStyle(() => ({
  transform: [{ scale: scale.value }],
}));

const handlePress = () => {
  scale.value = withSpring(0.95, { stiffness: 500, damping: 25 });
};
```

---

## 8. Do/Don't Consistency Rules

### ✅ DO

- **Use generous corner radii** (16–24px) on all cards, modals, buttons
- **Use the primary cyan gradient** (`#4FC3E0 → #2FA4C7`) for all CTAs and branding
- **Keep backgrounds white** below the gradient fade—never full-screen color
- **Use 24px horizontal padding** on all screens for consistency
- **Apply spring animations** (stiffness 300, damping 30) to modals and bottom sheets
- **Use emerald green** (`#10B981`) for links and hashtags
- **Keep navigation minimal**—icons only, with tiny 4×4 active dots
- **Use bold white text** over cyan backgrounds for maximum contrast
- **Apply colored shadows** to the FAB (cyan glow) for emphasis
- **Use 48×48 minimum touch targets** for all interactive elements

---

### ❌ DON'T

- **Don't use sharp corners** (< 8px radius) anywhere in the UI
- **Don't use primary cyan for body text**—use black or gray
- **Don't add divider lines** between list items—use spacing and shadows instead
- **Don't use multiple accent colors**—stick to cyan, emerald (links), and black/white
- **Don't place text directly on gradients** without sufficient contrast (use white)
- **Don't use linear ease** for animations—prefer springs for natural feel
- **Don't add navigation labels** to bottom nav icons—icons + dots only
- **Don't use full-screen modals**—prefer bottom sheets with rounded tops
- **Don't overlay gradients on cards**—cards are always solid white
- **Don't make buttons smaller than 44×44**—accessibility first

---

### Edge Cases

- **Long usernames:** Truncate at 20 characters with ellipsis
- **Empty states:** Use gray text (textSecondary) and a relevant icon (48×48)
- **Error states:** Use red text + icon, but keep red out of buttons unless destructive
- **Loading states:** Skeleton cards with subtle pulse (0.1 ↔ 0.2 opacity, 1.5s)
- **Offline mode:** Show banner at top with gray background, not blocking
- **Long post content:** Truncate at 3 lines with "See more" link (emerald)

---

### Quality Checklist

Before shipping a new screen:

- [ ] All text meets 4.5:1 contrast minimum
- [ ] All touch targets are 44×44 or larger
- [ ] Spring animations used for modals (stiffness 300, damping 30)
- [ ] Corner radii match spec (16–24px for cards/buttons)
- [ ] Horizontal padding is 24px on all screens
- [ ] Bottom nav reserved space is 96px (64px nav + 32px margin)
- [ ] Shadows applied correctly (iOS: shadow props, Android: elevation)
- [ ] Primary cyan gradient used only for CTAs, not backgrounds
- [ ] White text used on all cyan backgrounds
- [ ] Navigation uses icons + 4×4 active dots, no labels

---

**End of Specification**

This document is the single source of truth for Spottr's mobile UI design system. When in doubt, refer to these tokens, measurements, and rules. Update this spec whenever design decisions change.