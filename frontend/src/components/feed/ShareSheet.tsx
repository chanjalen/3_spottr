import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  SectionList,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
  Keyboard,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import Avatar from '../common/Avatar';
import { fetchShareRecipients, sendShare, ShareRecipient, ShareGroup, ShareOrg } from '../../api/share';
import { FeedItem } from '../../types/feed';
import { useAuth } from '../../store/AuthContext';
import { colors, spacing, typography } from '../../theme';

const { height: SCREEN_H } = Dimensions.get('window');
const SNAP_OPEN = SCREEN_H * 0.25;
const DISMISS_Y = SCREEN_H * 0.52;

interface ShareSheetProps {
  item: FeedItem | null;
  onClose: () => void;
}

type SelectionKey = string; // `type:id`

interface SelectionEntry {
  key: SelectionKey;
  id: string;
  type: 'user' | 'group' | 'org';
  label: string;
}

export default function ShareSheet({ item, onClose }: ShareSheetProps) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const bottomNavHeight = 52 + Math.max(insets.bottom, 16);
  const isOwner = !!item && !!user && String(item.user.id) === String(user.id);
  const hasMedia = !!item && !!(item.photo_url || item.video_url);

  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [friends, setFriends] = useState<ShareRecipient[]>([]);
  const [groups, setGroups] = useState<ShareGroup[]>([]);
  const [orgs, setOrgs] = useState<ShareOrg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<SelectionKey>>(new Set());
  const [selectedList, setSelectedList] = useState<SelectionEntry[]>([]);
  const [message, setMessage] = useState('');

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemRef = useRef<FeedItem | null>(null);
  useEffect(() => { itemRef.current = item; }, [item]);

  const sheetY = useSharedValue(SCREEN_H);
  const dragStartY = useSharedValue(SNAP_OPEN);
  const backdropOpacity = useSharedValue(0);
  const keyboardHeight = useSharedValue(0);

  // ── Keyboard listeners ────────────────────────────────────────────────────
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => {
      keyboardHeight.value = withTiming(e.endCoordinates.height, {
        duration: Platform.OS === 'ios' ? e.duration : 200,
      });
    });
    const hide = Keyboard.addListener(hideEvent, (e) => {
      keyboardHeight.value = withTiming(0, {
        duration: Platform.OS === 'ios' ? e.duration : 200,
      });
    });
    return () => { show.remove(); hide.remove(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load recipients ───────────────────────────────────────────────────────
  const loadRecipients = useCallback(async (q?: string) => {
    setIsLoading(true);
    try {
      const data = await fetchShareRecipients(q);
      setFriends(data.friends);
      setGroups(data.groups);
      setOrgs(data.orgs);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── Animate close ─────────────────────────────────────────────────────────
  const animateClose = useCallback(() => {
    runOnJS(Keyboard.dismiss)();
    backdropOpacity.value = withTiming(0, { duration: 240 });
    sheetY.value = withTiming(SCREEN_H, { duration: 280 }, (done) => {
      if (done) {
        runOnJS(setVisible)(false);
        runOnJS(onClose)();
      }
    });
  }, [onClose, sheetY, backdropOpacity]);

  // ── Open / close on item change ───────────────────────────────────────────
  useEffect(() => {
    if (item) {
      setQuery('');
      setSelectedIds(new Set());
      setSelectedList([]);
      setMessage('');
      setVisible(true);
      sheetY.value = SCREEN_H;
      backdropOpacity.value = 0;
      sheetY.value = withTiming(SNAP_OPEN, { duration: 320, easing: Easing.out(Easing.cubic) });
      backdropOpacity.value = withTiming(1, { duration: 280 });
      loadRecipients();
    } else {
      animateClose();
    }
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Search debounce ───────────────────────────────────────────────────────
  const handleQueryChange = (text: string) => {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => loadRecipients(text || undefined), 300);
  };

  // ── Pan gesture ───────────────────────────────────────────────────────────
  const panGesture = Gesture.Pan()
    .onStart(() => { dragStartY.value = sheetY.value; })
    .onUpdate((e) => {
      const next = dragStartY.value + e.translationY;
      sheetY.value = Math.max(SNAP_OPEN, next);
      const progress = Math.max(0, Math.min(1, 1 - (sheetY.value - SNAP_OPEN) / (DISMISS_Y - SNAP_OPEN)));
      backdropOpacity.value = progress;
    })
    .onEnd((e) => {
      if (sheetY.value > DISMISS_Y || e.velocityY > 700) {
        runOnJS(animateClose)();
      } else {
        sheetY.value = withSpring(SNAP_OPEN, { damping: 22, stiffness: 180 });
        backdropOpacity.value = withTiming(1, { duration: 200 });
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value * 0.5 }));
  const sheetStyle = useAnimatedStyle(() => ({
    top: sheetY.value,
    bottom: Math.max(bottomNavHeight, keyboardHeight.value),
  }));

  // ── Toggle selection ──────────────────────────────────────────────────────
  const toggleSelect = (key: SelectionKey, entry: SelectionEntry) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        setSelectedList((l) => l.filter((e) => e.key !== key));
      } else {
        next.add(key);
        setSelectedList((l) => [...l, entry]);
      }
      return next;
    });
  };

  // ── Download media ────────────────────────────────────────────────────────
  const handleDownload = async () => {
    const current = itemRef.current;
    if (!current) return;
    const urls = [current.photo_url, current.video_url].filter(Boolean) as string[];
    if (urls.length === 0) {
      Alert.alert('No media', 'This post has no photos or videos to save.');
      return;
    }
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera roll access to save media.');
      return;
    }
    let saved = 0;
    for (const url of urls) {
      try {
        const ext = url.includes('.mp4') || url.includes('video') ? '.mp4' : '.jpg';
        const localUri = `${FileSystem.cacheDirectory}spottr_share_${Date.now()}${ext}`;
        const result = await FileSystem.downloadAsync(url, localUri);
        await MediaLibrary.saveToLibraryAsync(result.uri);
        saved++;
      } catch {
        // ignore individual failures
      }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Saved', saved === 1 ? '1 file saved to camera roll.' : `${saved} files saved to camera roll.`);
  };

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const current = itemRef.current;
    if (!current || isSending) return;
    setIsSending(true);
    try {
      const friendIds = selectedList.filter((e) => e.type === 'user').map((e) => e.id);
      const groupIds = selectedList.filter((e) => e.type === 'group').map((e) => e.id);
      const orgIds = selectedList.filter((e) => e.type === 'org').map((e) => e.id);
      await sendShare({
        postId: current.id,
        itemType: current.type,
        recipientIds: friendIds,
        groupIds,
        orgIds,
        message,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      animateClose();
    } catch {
      Alert.alert('Error', 'Failed to send. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  // ── SectionList data ──────────────────────────────────────────────────────
  type AnyRecipient = ShareRecipient | ShareGroup | ShareOrg;
  type ShareSection = { title: string; data: AnyRecipient[]; itemType: 'friend' | 'group' | 'org' };
  const sections: ShareSection[] = [
    ...(friends.length > 0 ? [{ title: 'Friends', data: friends as AnyRecipient[], itemType: 'friend' as const }] : []),
    ...(groups.length > 0 ? [{ title: 'Group Chats', data: groups as AnyRecipient[], itemType: 'group' as const }] : []),
    ...(orgs.length > 0 ? [{ title: 'Organizations', data: orgs as AnyRecipient[], itemType: 'org' as const }] : []),
  ];

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View pointerEvents="auto" style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={animateClose} />
      </Animated.View>

      {/* Sheet */}
      <Animated.View pointerEvents="auto" style={[styles.sheet, sheetStyle]}>
        {/* Drag handle + header */}
        <GestureDetector gesture={panGesture}>
          <View style={styles.handleArea}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Send to</Text>
              <Pressable onPress={animateClose} hitSlop={12}>
                <Feather name="x" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            {/* Search bar */}
            <View style={styles.searchRow}>
              <Feather name="search" size={15} color={colors.textMuted} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search all friends, groups, organizations..."
                placeholderTextColor={colors.textMuted}
                value={query}
                onChangeText={handleQueryChange}
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>
          </View>
        </GestureDetector>

        {/* Content */}
        <View style={{ flex: 1 }}>
          {isLoading ? (
            <View style={styles.loader}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <SectionList<AnyRecipient, ShareSection>
              sections={sections}
              keyExtractor={(r) => `${r.type}-${r.id}`}
              renderSectionHeader={({ section }) => (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                </View>
              )}
              renderItem={({ item: recipient, section }) => {
                const isFriend = section.itemType === 'friend';
                const key: SelectionKey = `${recipient.type}:${recipient.id}`;
                const isSelected = selectedIds.has(key);
                const label = isFriend
                  ? (recipient as ShareRecipient).display_name
                  : (recipient as ShareGroup | ShareOrg).name;
                const avatarName = label;
                const avatarUri = (recipient as AnyRecipient & { avatar_url?: string | null }).avatar_url ?? null;
                const sub = isFriend ? `@${(recipient as ShareRecipient).username}` : null;

                return (
                  <Pressable
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    onPress={() => toggleSelect(key, { key, id: recipient.id, type: recipient.type as 'user' | 'group' | 'org', label })}
                  >
                    <Avatar uri={avatarUri} name={avatarName} size={38} />
                    <View style={styles.rowText}>
                      <Text style={styles.rowName} numberOfLines={1}>{label}</Text>
                      {sub && <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text>}
                    </View>
                    <View style={[styles.check, isSelected && styles.checkSelected]}>
                      {isSelected && <Feather name="check" size={13} color="#fff" />}
                    </View>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                !isLoading ? (
                  <View style={styles.empty}>
                    <Text style={styles.emptyText}>No results</Text>
                  </View>
                ) : null
              }
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              stickySectionHeadersEnabled={false}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </View>

        {/* Bottom fixed area — only renders when there's something to show */}
        {(selectedIds.size > 0 || (isOwner && hasMedia)) && (
        <View style={styles.bottomBar}>
          {selectedIds.size > 0 ? (
            // Send bar
            <>
              <TextInput
                style={styles.messageInput}
                placeholder="Add a message..."
                placeholderTextColor={colors.textMuted}
                value={message}
                onChangeText={setMessage}
                returnKeyType="done"
              />
              <Pressable
                style={({ pressed }) => [styles.sendBtn, pressed && { opacity: 0.8 }, isSending && { opacity: 0.6 }]}
                onPress={handleSend}
                disabled={isSending}
              >
                {isSending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.sendBtnText}>Send ({selectedIds.size})</Text>
                )}
              </Pressable>
            </>
          ) : isOwner && hasMedia ? (
            // Download button — centered cyan pill
            <Pressable
              style={({ pressed }) => [styles.downloadBtn, pressed && { opacity: 0.8 }]}
              onPress={handleDownload}
            >
              <Feather name="download-cloud" size={16} color="#fff" />
              <Text style={styles.downloadBtnText}>Save photos &amp; videos</Text>
            </Pressable>
          ) : null}
        </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: '#000',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: { elevation: 10 },
    }),
  },
  handleArea: {
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border.default,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
  },
  sheetTitle: {
    fontSize: typography.size.md,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.base,
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
    height: 38,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textPrimary,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
  },
  listContent: {
    paddingBottom: spacing.base,
  },
  sectionHeader: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    backgroundColor: colors.surface,
  },
  sectionTitle: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.medium,
    color: colors.textPrimary,
  },
  rowSub: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
    marginTop: 1,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.border.default,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.subtle,
    backgroundColor: colors.surface,
    gap: spacing.sm,
    minHeight: 64,
  },
  downloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: 22,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
  },
  downloadBtnText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: '#fff',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
  },
  sendBar: {
    // kept for reference — layout now handled by bottomBar
  },
  messageInput: {
    flex: 1,
    height: 38,
    backgroundColor: colors.background.base,
    borderRadius: 19,
    paddingHorizontal: spacing.md,
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textPrimary,
  },
  sendBtn: {
    backgroundColor: colors.primary,
    borderRadius: 19,
    paddingHorizontal: spacing.md,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 80,
  },
  sendBtnText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: '#fff',
  },
});
