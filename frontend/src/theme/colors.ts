export const colors = {
  // Brand (Spottr Cyan) — nested aliases kept for backward compat
  brand: {
    primary: '#4FC3E0',
    primaryLight: '#8EDFF2',
    primaryDark: '#2FA4C7',
    secondary: '#4FC3E0',
  },

  // Background & Surfaces
  background: {
    base: '#FFFFFF',
    surface: '#FFFFFF',
    card: '#FFFFFF',
    elevated: '#F9FAFB',
  },

  // Text
  text: {
    primary: '#111827',
    secondary: '#6B7280',
    muted: '#9CA3AF',
  },

  // Borders
  border: {
    subtle: 'rgba(0,0,0,0.05)',
    default: '#E5E5E5',
    strong: 'rgba(0,0,0,0.12)',
  },

  // Semantic colors
  semantic: {
    like: '#EF4444',
    likeBg: 'rgba(239,68,68,0.08)',
    share: '#10B981',
    shareBg: 'rgba(16,185,129,0.08)',
    comment: '#4FC3E0',
    commentBg: 'rgba(79,195,224,0.08)',
    prGreen: '#10B981',
    prGreenDark: '#059669',
    warning: '#F59E0B',
    error: '#EF4444',
  },

  // Tab states
  tab: {
    active: '#111827',
    inactive: '#9CA3AF',
    indicator: '#4FC3E0',
  },

  // Flat tokens (spec-aligned names)
  primary: '#4FC3E0',
  primaryDark: '#2FA4C7',
  primaryLight: '#8EDFF2',

  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',

  borderColor: '#E5E5E5',
  borderActive: '#000000',
  borderSubtle: 'rgba(0,0,0,0.05)',

  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  textOnPrimary: '#FFFFFF',

  iconActive: '#111827',
  iconInactive: '#9CA3AF',
  iconOnPrimary: '#FFFFFF',

  link: '#10B981',
  linkSecondary: '#4FC3E0',

  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  overlay: 'rgba(0,0,0,0.6)',
  scrim: 'rgba(0,0,0,0.2)',

  storyGradientStart: '#A855F7',
  storyGradientMid: '#EC4899',
  storyGradientEnd: '#FB923C',
} as const;
