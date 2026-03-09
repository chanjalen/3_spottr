import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Image,
  TextInput,
} from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { Feather } from '@expo/vector-icons';
import { pickMedia as pickMediaUtil } from '../../utils/pickMedia';
import { colors, spacing, typography } from '../../theme';
import { createPost } from '../../api/feed';
import { useAuth } from '../../store/AuthContext';
import Avatar from '../common/Avatar';

// ─── Constants ────────────────────────────────────────────────────────────────

type AttachmentMode = 'media' | 'link' | 'pr' | null;

const POLL_DURATIONS: Array<{ label: string; hours: number }> = [
  { label: '1h',  hours: 1 },
  { label: '6h',  hours: 6 },
  { label: '24h', hours: 24 },
  { label: '3d',  hours: 72 },
  { label: '7d',  hours: 168 },
];

const PR_UNITS = ['lbs', 'kg', 'km', 'miles', 'min', 'sec', 'reps'];

interface Media { uri: string; name: string; type: string }

interface Props {
  sheetRef: React.RefObject<BottomSheet>;
  onSuccess?: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CreatePostSheet({ sheetRef, onSuccess }: Props) {
  const { user } = useAuth();

  const [text, setText] = useState('');
  const [mode, setMode] = useState<AttachmentMode>(null);
  const [showPoll, setShowPoll] = useState(false);
  const [photo, setPhoto] = useState<Media | null>(null);
  const [video, setVideo] = useState<Media | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollDuration, setPollDuration] = useState(24);
  const [prExercise, setPrExercise] = useState('');
  const [prValue, setPrValue] = useState('');
  const [prUnit, setPrUnit] = useState('lbs');
  const [visibility, setVisibility] = useState<'main' | 'friends'>('main');
  const [replyRestriction, setReplyRestriction] = useState<'everyone' | 'friends' | 'mentions'>('everyone');
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setText('');
    setMode(null);
    setShowPoll(false);
    setPhoto(null);
    setVideo(null);
    setLinkUrl('');
    setPollQuestion('');
    setPollOptions(['', '']);
    setPollDuration(24);
    setPrExercise('');
    setPrValue('');
    setPrUnit('lbs');
    setVisibility('main');
    setReplyRestriction('everyone');
  }, []);

  const handleSheetChange = useCallback((index: number) => {
    if (index === 0) reset();
  }, [reset]);

  // ── Media picker ─────────────────────────────────────────────────────────────
  // Opens gallery for both photos and videos in one picker.
  // Video fix: on iOS, UIImagePickerPreferredAssetRepresentationMode.Compatible
  // exports H.264 MP4 regardless of original format, so we always use video/mp4.

  const pickMedia = async () => {
    const picked = await pickMediaUtil({ allowsMultiple: false });
    if (!picked) return;
    const asset = picked[0];
    if (asset.kind === 'video') {
      setVideo({ uri: asset.uri, name: asset.filename, type: asset.mimeType });
      setPhoto(null);
    } else {
      setPhoto({ uri: asset.uri, name: asset.filename, type: asset.mimeType });
      setVideo(null);
    }
    setMode('media');
  };

  // ── Submit ───────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    if (showPoll) {
      const opts = pollOptions.filter(o => o.trim());
      if (!pollQuestion.trim() || opts.length < 2) {
        Alert.alert('Incomplete poll', 'Please fill in the poll question and at least 2 options before posting.');
        return;
      }
    }
    setSubmitting(true);
    try {
      const validOptions = pollOptions.filter(o => o.trim());
      const hasPoll = showPoll && pollQuestion.trim().length > 0 && validOptions.length >= 2;
      const hasPr = prExercise.trim().length > 0 && prValue.trim().length > 0;

      await createPost({
        text: text.trim() || undefined,
        linkUrl: linkUrl.trim() || undefined,
        visibility,
        replyRestriction,
        photos: photo ? [photo] : undefined,
        video: video ?? undefined,
        poll: hasPoll
          ? { question: pollQuestion.trim(), options: validOptions, duration: pollDuration }
          : undefined,
        pr: hasPr
          ? { exerciseName: prExercise.trim(), value: prValue.trim(), unit: prUnit }
          : undefined,
      });
      sheetRef.current?.close();
      onSuccess?.();
    } catch (e: any) {
      const status = e?.response?.status;
      const msg = e?.response?.data?.error
        ?? (status ? `Server error (${status}). Please try again.` : 'Network error. Check your connection.');
      Alert.alert('Post Failed', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !submitting && (
    text.trim().length > 0 ||
    !!photo ||
    !!video ||
    (showPoll && pollQuestion.trim().length > 0 && pollOptions.filter(o => o.trim()).length >= 2) ||
    (prExercise.trim().length > 0 && prValue.trim().length > 0)
  );

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.4} />
    ),
    [],
  );

  // ── Poll helpers ──────────────────────────────────────────────────────────────

  const updatePollOption = (index: number, value: string) => {
    const next = [...pollOptions];
    next[index] = value;
    setPollOptions(next);
  };

  const removePollOption = (index: number) => {
    setPollOptions(pollOptions.filter((_, i) => i !== index));
  };

  const toggleMode = (next: AttachmentMode) => {
    setMode(prev => (prev === next ? null : next));
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={['92%']}
      enablePanDownToClose
      keyboardBehavior="interactive"
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.sheetBg}
      onChange={handleSheetChange}
    >
      <BottomSheetScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Top bar: Cancel + Audience ────────────────── */}
        <View style={styles.topBar}>
          <Pressable
            onPress={() => sheetRef.current?.close()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>

          {/* Audience toggle — compact pill */}
          <View style={styles.audienceRow}>
            <Pressable
              style={[styles.audienceChip, visibility === 'main' && styles.audienceChipActive]}
              onPress={() => setVisibility('main')}
            >
              <Feather name="globe" size={11} color={visibility === 'main' ? colors.primary : colors.textMuted} />
              <Text style={[styles.audienceChipText, visibility === 'main' && styles.audienceChipTextActive]}>
                Everyone
              </Text>
            </Pressable>
            <Pressable
              style={[styles.audienceChip, visibility === 'friends' && styles.audienceChipActive]}
              onPress={() => setVisibility('friends')}
            >
              <Feather name="users" size={11} color={visibility === 'friends' ? colors.primary : colors.textMuted} />
              <Text style={[styles.audienceChipText, visibility === 'friends' && styles.audienceChipTextActive]}>
                Friends
              </Text>
            </Pressable>
          </View>
        </View>

        {/* ── Compose area ─────────────────────────────────── */}
        <View style={styles.composeRow}>
          <Avatar
            uri={user?.avatar_url ?? null}
            name={user?.display_name ?? user?.username ?? ''}
            size={40}
          />

          <View style={styles.inputArea}>
            <TextInput
              style={styles.textInput}
              value={text}
              onChangeText={setText}
              placeholder="What's happening?"
              placeholderTextColor={colors.textMuted}
              multiline
              maxLength={500}
              textAlignVertical="top"
            />

            {/* ── Photo preview ─────────────────────────── */}
            {photo && (
              <View style={styles.mediaPreview}>
                <Image source={{ uri: photo.uri }} style={styles.mediaImage} resizeMode="cover" />
                <Pressable style={styles.mediaRemoveBtn} onPress={() => { setPhoto(null); setMode(null); }}>
                  <Feather name="x" size={14} color="#fff" />
                </Pressable>
                <Pressable style={styles.mediaChangeBtn} onPress={pickMedia}>
                  <Feather name="image" size={13} color="#fff" />
                  <Text style={styles.mediaChangeBtnText}>Change</Text>
                </Pressable>
              </View>
            )}

            {/* ── Video preview ─────────────────────────── */}
            {video && (
              <View style={styles.videoPreview}>
                <View style={styles.videoIconWrap}>
                  <Feather name="film" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.videoTitle}>Video ready</Text>
                  <Text style={styles.videoSub} numberOfLines={1}>{video.name}</Text>
                </View>
                <Pressable
                  onPress={() => { setVideo(null); setMode(null); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="x" size={17} color={colors.textMuted} />
                </Pressable>
              </View>
            )}

            {/* ── Mode: no media picked yet, show prompt ── */}
            {mode === 'media' && !photo && !video && (
              <Pressable style={styles.mediaPlaceholder} onPress={pickMedia}>
                <Feather name="image" size={26} color={colors.primary} />
                <Text style={styles.mediaPlaceholderText}>Tap to choose a photo or video</Text>
              </Pressable>
            )}

            {/* ── Poll builder ─────────────────────────── */}
            {showPoll && (
              <View style={styles.pollSection}>
                <TextInput
                  style={styles.pollQuestionInput}
                  value={pollQuestion}
                  onChangeText={setPollQuestion}
                  placeholder="Ask a question..."
                  placeholderTextColor={colors.textMuted}
                  maxLength={100}
                />
                {pollOptions.map((opt, i) => (
                  <View key={i} style={styles.pollOptionRow}>
                    <TextInput
                      style={styles.pollOptionInput}
                      value={opt}
                      onChangeText={v => updatePollOption(i, v)}
                      placeholder={`Choice ${i + 1}`}
                      placeholderTextColor={colors.textMuted}
                      maxLength={50}
                    />
                    {pollOptions.length > 2 && (
                      <Pressable
                        onPress={() => removePollOption(i)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ marginLeft: spacing.sm }}
                      >
                        <Feather name="x" size={16} color={colors.textMuted} />
                      </Pressable>
                    )}
                  </View>
                ))}
                {pollOptions.length < 6 && (
                  <Pressable
                    style={styles.addOptionBtn}
                    onPress={() => setPollOptions([...pollOptions, ''])}
                  >
                    <Feather name="plus-circle" size={14} color={colors.primary} />
                    <Text style={styles.addOptionText}>Add choice</Text>
                  </Pressable>
                )}
                <Text style={styles.sectionLabel}>Poll duration</Text>
                <View style={styles.chipRow}>
                  {POLL_DURATIONS.map(d => (
                    <Pressable
                      key={d.hours}
                      style={[styles.chip, pollDuration === d.hours && styles.chipActive]}
                      onPress={() => setPollDuration(d.hours)}
                    >
                      <Text style={[styles.chipText, pollDuration === d.hours && styles.chipTextActive]}>
                        {d.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* ── Link ─────────────────────────────────── */}
            {mode === 'link' && (
              <View style={styles.linkRow}>
                <Feather name="link" size={15} color={colors.primary} />
                <TextInput
                  style={styles.linkInput}
                  value={linkUrl}
                  onChangeText={setLinkUrl}
                  placeholder="Paste a URL..."
                  placeholderTextColor={colors.textMuted}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {linkUrl.length > 0 && (
                  <Pressable onPress={() => setLinkUrl('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Feather name="x" size={15} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>
            )}

            {/* ── PR ───────────────────────────────────── */}
            {mode === 'pr' && (
              <View style={styles.prSection}>
                <TextInput
                  style={styles.prInput}
                  value={prExercise}
                  onChangeText={setPrExercise}
                  placeholder="Exercise (e.g. Bench Press)"
                  placeholderTextColor={colors.textMuted}
                  maxLength={50}
                />
                <TextInput
                  style={[styles.prInput, { marginTop: spacing.sm }]}
                  value={prValue}
                  onChangeText={setPrValue}
                  placeholder="Value"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  maxLength={10}
                />
                <View style={styles.chipRow}>
                  {PR_UNITS.map(u => (
                    <Pressable
                      key={u}
                      style={[styles.chip, prUnit === u && styles.chipActive]}
                      onPress={() => setPrUnit(u)}
                    >
                      <Text style={[styles.chipText, prUnit === u && styles.chipTextActive]}>{u}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>
        </View>

        {/* ── Character count ───────────────────────────── */}
        {text.length > 0 && (
          <Text style={[styles.charCount, text.length > 450 && styles.charCountWarn]}>
            {text.length}/500
          </Text>
        )}

        {/* ── Divider ───────────────────────────────────── */}
        <View style={styles.divider} />

        {/* ── Bottom toolbar ────────────────────────────── */}
        <View style={styles.toolbar}>
          <View style={styles.toolbarIcons}>
            <ToolbarBtn
              icon="image"
              active={mode === 'media' || !!photo || !!video}
              onPress={photo || video ? pickMedia : () => toggleMode('media')}
            />
            <ToolbarBtn
              icon="bar-chart-2"
              active={showPoll}
              onPress={() => setShowPoll(p => !p)}
            />
            <ToolbarBtn
              icon="link"
              active={mode === 'link'}
              onPress={() => toggleMode('link')}
            />
            <ToolbarBtn
              icon="award"
              active={mode === 'pr'}
              onPress={() => toggleMode('pr')}
            />
          </View>

          <Pressable
            style={[styles.postBtn, !canSubmit && styles.postBtnDisabled]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            {submitting
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.postBtnText}>Post</Text>}
          </Pressable>
        </View>

        {/* ── Who can reply (compact) ───────────────────── */}
        <View style={styles.replyRow}>
          <Feather name="message-circle" size={13} color={colors.textMuted} />
          <Text style={styles.replyLabel}>Who can reply:</Text>
          {(['everyone', 'friends', 'mentions'] as const).map(r => (
            <Pressable
              key={r}
              style={[styles.replyChip, replyRestriction === r && styles.chipActive]}
              onPress={() => setReplyRestriction(r)}
            >
              <Text style={[styles.chipText, replyRestriction === r && styles.chipTextActive]}>
                {r === 'everyone' ? 'Everyone' : r === 'friends' ? 'Friends' : '@Mentions'}
              </Text>
            </Pressable>
          ))}
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

// ─── Toolbar button ────────────────────────────────────────────────────────────

function ToolbarBtn({
  icon, active, onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.toolbarBtn, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
    >
      <Feather name={icon} size={21} color={active ? colors.primary : colors.iconInactive} />
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  sheetBg: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 20 },
      android: { elevation: 10 },
    }),
  },
  handle: { backgroundColor: colors.borderColor, width: 36 },
  content: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
    paddingBottom: spacing['2xl'],
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.base,
    paddingHorizontal: spacing.xs,
  },
  cancelText: {
    fontSize: typography.size.base,
    fontFamily: typography.family.medium,
    color: colors.textSecondary,
  },
  audienceRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  audienceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: 9999,
    borderWidth: 1.5,
    borderColor: colors.borderColor,
    backgroundColor: colors.background.elevated,
  },
  audienceChipActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(79,195,224,0.08)',
  },
  audienceChipText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.medium,
    color: colors.textMuted,
  },
  audienceChipTextActive: {
    color: colors.primary,
  },

  // Compose row
  composeRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  inputArea: {
    flex: 1,
    paddingTop: 2,
  },
  textInput: {
    fontSize: typography.size.lg,
    fontFamily: typography.family.regular,
    color: colors.textPrimary,
    minHeight: 80,
    textAlignVertical: 'top',
    paddingTop: 0,
    paddingBottom: spacing.sm,
    lineHeight: 26,
  },

  // Media preview
  mediaPreview: {
    position: 'relative',
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  mediaImage: { width: '100%', height: '100%' },
  mediaRemoveBtn: {
    position: 'absolute', top: 10, right: 10,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  mediaChangeBtn: {
    position: 'absolute', bottom: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: 9999, backgroundColor: 'rgba(0,0,0,0.6)',
  },
  mediaChangeBtnText: {
    fontSize: typography.size.xs, fontWeight: '600', color: '#fff',
  },

  // Video preview card
  videoPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 14,
    backgroundColor: colors.background.elevated,
    borderWidth: 1.5,
    borderColor: colors.borderColor,
    marginBottom: spacing.sm,
  },
  videoIconWrap: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(79,195,224,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  videoTitle: {
    fontSize: typography.size.sm, fontFamily: typography.family.semibold, color: colors.textPrimary,
  },
  videoSub: {
    fontSize: typography.size.xs, fontFamily: typography.family.regular, color: colors.textMuted,
  },

  // Media placeholder
  mediaPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: 100,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: 'rgba(79,195,224,0.04)',
    marginBottom: spacing.sm,
  },
  mediaPlaceholderText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.medium,
    color: colors.primary,
  },

  // Poll
  pollSection: { marginBottom: spacing.sm },
  pollQuestionInput: {
    backgroundColor: colors.background.elevated,
    borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderColor,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: typography.size.sm, fontFamily: typography.family.regular,
    color: colors.textPrimary, marginBottom: spacing.sm,
  },
  pollOptionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  pollOptionInput: {
    flex: 1,
    backgroundColor: colors.background.elevated,
    borderRadius: 10, borderWidth: 1.5, borderColor: colors.borderColor,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: typography.size.sm, fontFamily: typography.family.regular,
    color: colors.textPrimary,
  },
  addOptionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: spacing.xs, marginBottom: spacing.sm,
  },
  addOptionText: {
    fontSize: typography.size.sm, fontFamily: typography.family.semibold, color: colors.primary,
  },
  sectionLabel: {
    fontSize: typography.size.xs, fontFamily: typography.family.semibold,
    color: colors.textMuted, textTransform: 'uppercase',
    letterSpacing: 0.8, marginBottom: spacing.sm, marginTop: spacing.xs,
  },
  chipRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
    borderRadius: 9999, borderWidth: 1.5, borderColor: colors.borderColor,
    backgroundColor: colors.background.elevated,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: 'rgba(79,195,224,0.1)' },
  chipText: { fontSize: typography.size.sm, fontFamily: typography.family.medium, color: colors.textSecondary },
  chipTextActive: { color: colors.primary, fontFamily: typography.family.semibold },

  // Link
  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.background.elevated,
    borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderColor,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  linkInput: {
    flex: 1, fontSize: typography.size.sm, fontFamily: typography.family.regular,
    color: colors.textPrimary, paddingVertical: 0,
  },

  // PR
  prSection: { marginBottom: spacing.sm },
  prInput: {
    backgroundColor: colors.background.elevated,
    borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderColor,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: typography.size.sm, fontFamily: typography.family.regular,
    color: colors.textPrimary, marginBottom: spacing.xs,
  },

  // Char count
  charCount: {
    fontSize: typography.size.xs, fontFamily: typography.family.regular,
    color: colors.textMuted, textAlign: 'right',
    marginTop: spacing.xs, paddingRight: spacing.xs,
  },
  charCountWarn: { color: colors.warning },

  // Divider
  divider: { height: 1, backgroundColor: colors.borderColor, marginVertical: spacing.md },

  // Toolbar
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xs,
  },
  toolbarIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xl,
  },
  toolbarBtn: {
    padding: spacing.xs,
  },
  postBtn: {
    backgroundColor: colors.primary,
    borderRadius: 9999,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    minWidth: 72,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: 'rgba(79,195,224,0.4)', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 10 },
      android: { elevation: 4 },
    }),
  },
  postBtnDisabled: {
    backgroundColor: colors.borderColor,
    ...Platform.select({ ios: { shadowOpacity: 0 }, android: { elevation: 0 } }),
  },
  postBtnText: {
    fontSize: typography.size.base, fontFamily: typography.family.semibold, color: '#fff',
  },

  // Reply restriction (compact, below toolbar)
  replyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  replyLabel: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
    marginRight: 2,
  },
  replyChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 9999,
    borderWidth: 1.5,
    borderColor: colors.borderColor,
    backgroundColor: colors.background.elevated,
  },
});
