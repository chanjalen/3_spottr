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
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, typography } from '../../theme';
import { createPost } from '../../api/feed';

// ─── Constants ────────────────────────────────────────────────────────────────

type AttachmentTab = 'photo' | 'video' | 'link' | 'poll' | 'pr' | null;

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
  const [text, setText] = useState('');
  const [activeTab, setActiveTab] = useState<AttachmentTab>(null);
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
    setActiveTab(null);
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

  // ── Camera helpers ──────────────────────────────────────────────────────────

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: false,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      setPhoto({ uri: result.assets[0].uri, name: 'photo.jpg', type: 'image/jpeg' });
      setVideo(null);
    }
  };

  const pickVideo = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow access to your photo library.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'videos',
      allowsEditing: false,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop() ?? 'mp4';
      setVideo({ uri: asset.uri, name: `video.${ext}`, type: asset.mimeType ?? 'video/mp4' });
      setPhoto(null);
    }
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const validOptions = pollOptions.filter(o => o.trim());
      const hasPoll = pollQuestion.trim().length > 0 && validOptions.length >= 2;
      const hasPr = prExercise.trim().length > 0 && prValue.trim().length > 0;

      await createPost({
        text: text.trim() || undefined,
        linkUrl: linkUrl.trim() || undefined,
        visibility,
        replyRestriction,
        photo: photo ?? undefined,
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
    (pollQuestion.trim().length > 0 && pollOptions.filter(o => o.trim()).length >= 2) ||
    (prExercise.trim().length > 0 && prValue.trim().length > 0)
  );

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.4} />
    ),
    [],
  );

  // ── Poll helpers ─────────────────────────────────────────────────────────────

  const updatePollOption = (index: number, value: string) => {
    const next = [...pollOptions];
    next[index] = value;
    setPollOptions(next);
  };

  const removePollOption = (index: number) => {
    setPollOptions(pollOptions.filter((_, i) => i !== index));
  };

  // ── Render ──────────────────────────────────────────────────────────────────

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
        {/* ── Header ──────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.title}>New Post</Text>
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

        {/* ── Text input ──────────────────────────────── */}
        <TextInput
          style={styles.textInput}
          value={text}
          onChangeText={setText}
          placeholder="What's on your mind?"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={500}
          textAlignVertical="top"
        />
        <Text style={[styles.charCount, text.length > 450 && styles.charCountWarn]}>
          {text.length}/500
        </Text>

        {/* ── Attachment sections ──────────────────────── */}

        {/* Photo preview — always visible when a photo is selected */}
        {photo && (
          <View style={styles.mediaPreview}>
            <Image source={{ uri: photo.uri }} style={styles.mediaImage} resizeMode="cover" />
            <Pressable style={styles.mediaRemoveBtn} onPress={() => setPhoto(null)}>
              <Feather name="x" size={14} color="#fff" />
            </Pressable>
            <Pressable style={styles.mediaRetakeBtn} onPress={pickPhoto}>
              <Feather name="image" size={13} color="#fff" />
              <Text style={styles.mediaRetakeText}>Change</Text>
            </Pressable>
          </View>
        )}

        {/* Photo picker — only when photo tab is open and no photo yet */}
        {activeTab === 'photo' && !photo && (
          <Pressable style={styles.mediaPlaceholder} onPress={pickPhoto}>
            <Feather name="image" size={28} color={colors.primary} />
            <Text style={styles.mediaPlaceholderTitle}>Choose a Photo</Text>
            <Text style={styles.mediaPlaceholderSub}>Opens your gallery</Text>
          </Pressable>
        )}

        {/* Video card — always visible when a video is selected */}
        {video && (
          <View style={styles.videoCard}>
            <View style={styles.videoCardIcon}>
              <Feather name="video" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.videoCardTitle}>Video selected</Text>
              <Text style={styles.videoCardSub}>Ready to post</Text>
            </View>
            <Pressable onPress={() => setVideo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        )}

        {/* Video picker — only when video tab is open and no video yet */}
        {activeTab === 'video' && !video && (
          <Pressable style={styles.mediaPlaceholder} onPress={pickVideo}>
            <Feather name="video" size={28} color={colors.primary} />
            <Text style={styles.mediaPlaceholderTitle}>Choose a Video</Text>
            <Text style={styles.mediaPlaceholderSub}>Opens your gallery</Text>
          </Pressable>
        )}

        {/* Link */}
        {activeTab === 'link' && (
          <View style={styles.linkRow}>
            <Feather name="link" size={16} color={colors.primary} />
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
                <Feather name="x" size={16} color={colors.textMuted} />
              </Pressable>
            )}
          </View>
        )}

        {/* Poll */}
        {activeTab === 'poll' && (
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
                  placeholder={`Option ${i + 1}`}
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
            {pollOptions.length < 4 && (
              <Pressable
                style={styles.addOptionBtn}
                onPress={() => setPollOptions([...pollOptions, ''])}
              >
                <Feather name="plus-circle" size={14} color={colors.primary} />
                <Text style={styles.addOptionText}>Add option</Text>
              </Pressable>
            )}
            <Text style={styles.pollDurationLabel}>Poll Duration</Text>
            <View style={styles.durationRow}>
              {POLL_DURATIONS.map(d => (
                <Pressable
                  key={d.hours}
                  style={[styles.durationChip, pollDuration === d.hours && styles.chipSelected]}
                  onPress={() => setPollDuration(d.hours)}
                >
                  <Text style={[styles.durationChipText, pollDuration === d.hours && styles.chipTextSelected]}>
                    {d.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* PR */}
        {activeTab === 'pr' && (
          <View style={styles.prSection}>
            <TextInput
              style={styles.prExerciseInput}
              value={prExercise}
              onChangeText={setPrExercise}
              placeholder="Exercise (e.g. Bench Press)"
              placeholderTextColor={colors.textMuted}
              maxLength={50}
            />
            <View style={styles.prValueRow}>
              <TextInput
                style={styles.prValueInput}
                value={prValue}
                onChangeText={setPrValue}
                placeholder="Value"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                maxLength={10}
              />
            </View>
            <View style={styles.prUnitsRow}>
              {PR_UNITS.map(u => (
                <Pressable
                  key={u}
                  style={[styles.unitChip, prUnit === u && styles.chipSelected]}
                  onPress={() => setPrUnit(u)}
                >
                  <Text style={[styles.unitChipText, prUnit === u && styles.chipTextSelected]}>{u}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* ── Toolbar ──────────────────────────────────── */}
        <View style={styles.toolbar}>
          <ToolbarBtn
            icon="camera"
            label="Photo"
            active={activeTab === 'photo' || !!photo}
            onPress={() => setActiveTab(activeTab === 'photo' ? null : 'photo')}
          />
          <ToolbarBtn
            icon="video"
            label="Video"
            active={activeTab === 'video' || !!video}
            onPress={() => setActiveTab(activeTab === 'video' ? null : 'video')}
          />
          <ToolbarBtn
            icon="link"
            label="Link"
            active={activeTab === 'link'}
            onPress={() => setActiveTab(activeTab === 'link' ? null : 'link')}
          />
          <ToolbarBtn
            icon="bar-chart-2"
            label="Poll"
            active={activeTab === 'poll'}
            onPress={() => setActiveTab(activeTab === 'poll' ? null : 'poll')}
          />
          <ToolbarBtn
            icon="award"
            label="PR"
            active={activeTab === 'pr'}
            onPress={() => setActiveTab(activeTab === 'pr' ? null : 'pr')}
          />
        </View>

        <View style={styles.divider} />

        {/* ── Audience ──────────────────────────────────── */}
        <Text style={styles.settingLabel}>Audience</Text>
        <View style={styles.toggleRow}>
          <Pressable
            style={[styles.toggleChip, visibility === 'main' && styles.chipSelected]}
            onPress={() => setVisibility('main')}
          >
            <Feather name="globe" size={14} color={visibility === 'main' ? colors.primary : colors.textMuted} />
            <Text style={[styles.toggleChipText, visibility === 'main' && styles.chipTextSelected]}>Main Feed</Text>
          </Pressable>
          <Pressable
            style={[styles.toggleChip, visibility === 'friends' && styles.chipSelected]}
            onPress={() => setVisibility('friends')}
          >
            <Feather name="users" size={14} color={visibility === 'friends' ? colors.primary : colors.textMuted} />
            <Text style={[styles.toggleChipText, visibility === 'friends' && styles.chipTextSelected]}>Friends Only</Text>
          </Pressable>
        </View>

        {/* ── Who can reply ────────────────────────────── */}
        <Text style={[styles.settingLabel, { marginTop: spacing.base }]}>Who can reply</Text>
        <View style={styles.toggleRow}>
          {(['everyone', 'friends', 'mentions'] as const).map(r => (
            <Pressable
              key={r}
              style={[styles.toggleChip, replyRestriction === r && styles.chipSelected]}
              onPress={() => setReplyRestriction(r)}
            >
              <Text style={[styles.toggleChipText, replyRestriction === r && styles.chipTextSelected]}>
                {r === 'everyone' ? 'Everyone' : r === 'friends' ? 'Friends' : 'Mentions'}
              </Text>
            </Pressable>
          ))}
        </View>

      </BottomSheetScrollView>
    </BottomSheet>
  );
}

// ─── Toolbar button ───────────────────────────────────────────────────────────

function ToolbarBtn({
  icon, label, active, onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.toolbarBtn} onPress={onPress}>
      <Feather name={icon} size={22} color={active ? colors.primary : colors.iconInactive} />
      <Text style={[styles.toolbarBtnLabel, active && styles.toolbarBtnLabelActive]}>{label}</Text>
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
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing['2xl'],
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.base,
  },
  title: {
    fontSize: typography.size.lg,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  postBtn: {
    backgroundColor: colors.primary,
    borderRadius: 9999,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    minWidth: 70,
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
  postBtnText: { fontSize: typography.size.base, fontWeight: '700', color: '#fff' },

  // Text input
  textInput: {
    fontSize: typography.size.base,
    color: colors.textPrimary,
    minHeight: 100,
    textAlignVertical: 'top',
    paddingTop: 0,
  },
  charCount: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    textAlign: 'right',
    marginBottom: spacing.base,
  },
  charCountWarn: { color: colors.warning },

  // Media attachment
  mediaPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    height: 140,
    borderRadius: 16,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    backgroundColor: 'rgba(79,195,224,0.05)',
    marginBottom: spacing.base,
  },
  mediaPlaceholderTitle: { fontSize: typography.size.base, fontWeight: '700', color: colors.primary },
  mediaPlaceholderSub: { fontSize: typography.size.xs, color: colors.textMuted },
  mediaPreview: {
    position: 'relative',
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: spacing.base,
  },
  mediaImage: { width: '100%', height: '100%' },
  mediaRemoveBtn: {
    position: 'absolute', top: 10, right: 10,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  mediaRetakeBtn: {
    position: 'absolute', bottom: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: 6,
    borderRadius: 9999, backgroundColor: 'rgba(0,0,0,0.55)',
  },
  mediaRetakeText: { fontSize: typography.size.xs, fontWeight: '600', color: '#fff' },

  // Video card
  videoCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.base, borderRadius: 14,
    backgroundColor: colors.background.elevated,
    borderWidth: 1.5, borderColor: colors.borderColor,
    marginBottom: spacing.base,
  },
  videoCardIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(79,195,224,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  videoCardTitle: { fontSize: typography.size.sm, fontWeight: '600', color: colors.textPrimary },
  videoCardSub: { fontSize: typography.size.xs, color: colors.textMuted },

  // Link
  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.background.elevated,
    borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderColor,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    marginBottom: spacing.base,
  },
  linkInput: {
    flex: 1, fontSize: typography.size.sm, color: colors.textPrimary,
    paddingVertical: 0,
  },

  // Poll
  pollSection: { marginBottom: spacing.base },
  pollQuestionInput: {
    backgroundColor: colors.background.elevated,
    borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderColor,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: typography.size.sm, color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  pollOptionRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm,
  },
  pollOptionInput: {
    flex: 1,
    backgroundColor: colors.background.elevated,
    borderRadius: 10, borderWidth: 1.5, borderColor: colors.borderColor,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: typography.size.sm, color: colors.textPrimary,
  },
  addOptionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: spacing.sm, marginBottom: spacing.base,
  },
  addOptionText: { fontSize: typography.size.sm, fontWeight: '600', color: colors.primary },
  pollDurationLabel: {
    fontSize: typography.size.xs, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.sm,
  },
  durationRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  durationChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: 9999, borderWidth: 1.5, borderColor: colors.borderColor,
    backgroundColor: colors.background.elevated,
  },
  durationChipText: { fontSize: typography.size.sm, fontWeight: '500', color: colors.textSecondary },

  // PR
  prSection: { marginBottom: spacing.base },
  prExerciseInput: {
    backgroundColor: colors.background.elevated,
    borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderColor,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: typography.size.sm, color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  prValueRow: { marginBottom: spacing.sm },
  prValueInput: {
    backgroundColor: colors.background.elevated,
    borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderColor,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontSize: typography.size.sm, color: colors.textPrimary,
  },
  prUnitsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  unitChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: 9999, borderWidth: 1.5, borderColor: colors.borderColor,
    backgroundColor: colors.background.elevated,
  },
  unitChipText: { fontSize: typography.size.sm, fontWeight: '500', color: colors.textSecondary },

  // Shared chip selected state
  chipSelected: { borderColor: colors.primary, backgroundColor: 'rgba(79,195,224,0.1)' },
  chipTextSelected: { color: colors.primary, fontWeight: '600' },

  // Toolbar
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: colors.borderColor,
    paddingTop: spacing.base,
    marginTop: spacing.sm,
  },
  toolbarBtn: { alignItems: 'center', gap: 4, flex: 1 },
  toolbarBtnLabel: { fontSize: typography.size.xs, color: colors.iconInactive },
  toolbarBtnLabelActive: { color: colors.primary },

  // Settings
  divider: { height: 1, backgroundColor: colors.borderColor, marginVertical: spacing.base },
  settingLabel: {
    fontSize: typography.size.xs, fontWeight: '600', color: colors.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.sm,
  },
  toggleRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  toggleChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: 9999, borderWidth: 1.5, borderColor: colors.borderColor,
    backgroundColor: colors.background.elevated,
  },
  toggleChipText: { fontSize: typography.size.sm, fontWeight: '500', color: colors.textSecondary },
});
