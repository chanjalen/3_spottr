import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  Animated,
  ActivityIndicator,
} from 'react-native';
import Avatar from '../common/Avatar';
import { colors, spacing, typography } from '../../theme';
import { ReactionDetail } from '../../api/messaging';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ReactionDetailModalProps {
  visible: boolean;
  onClose: () => void;
  fetchDetails: () => Promise<ReactionDetail[]>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReactionDetailModal({
  visible,
  onClose,
  fetchDetails,
}: ReactionDetailModalProps) {
  const [reactions, setReactions] = useState<ReactionDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeEmoji, setActiveEmoji] = useState<string | null>(null);

  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    if (visible) {
      setReactions([]);
      setActiveEmoji(null);
      setLoading(true);
      fetchDetails()
        .then((data) => {
          setReactions(data);
        })
        .catch(() => {})
        .finally(() => setLoading(false));

      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();
    } else {
      slideAnim.setValue(300);
    }
  }, [visible]);

  // Unique emojis for the tab bar
  const emojis = [...new Set(reactions.map((r) => r.emoji))];

  const filtered = activeEmoji
    ? reactions.filter((r) => r.emoji === activeEmoji)
    : reactions;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
        >
          {/* Drag handle */}
          <View style={styles.handle} />

          {/* Title row */}
          <View style={styles.titleRow}>
            <Text style={styles.title}>Reactions</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.closeBtn}>✕</Text>
            </Pressable>
          </View>

          {/* Emoji filter tabs */}
          {emojis.length > 1 && (
            <View style={styles.tabs}>
              <Pressable
                style={[styles.tab, activeEmoji === null && styles.tabActive]}
                onPress={() => setActiveEmoji(null)}
              >
                <Text style={[styles.tabLabel, activeEmoji === null && styles.tabLabelActive]}>
                  All {reactions.length}
                </Text>
              </Pressable>
              {emojis.map((emoji) => {
                const count = reactions.filter((r) => r.emoji === emoji).length;
                const isActive = activeEmoji === emoji;
                return (
                  <Pressable
                    key={emoji}
                    style={[styles.tab, isActive && styles.tabActive]}
                    onPress={() => setActiveEmoji(isActive ? null : emoji)}
                  >
                    <Text style={styles.tabEmoji}>{emoji}</Text>
                    <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                      {count}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* List */}
          {loading ? (
            <ActivityIndicator
              color={colors.primary}
              style={styles.loader}
            />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(_, i) => String(i)}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <View style={styles.row}>
                  <Avatar
                    uri={item.avatar_url}
                    name={item.display_name || item.username}
                    size={36}
                  />
                  <View style={styles.nameCol}>
                    <Text style={styles.displayName}>{item.display_name}</Text>
                    <Text style={styles.username}>@{item.username}</Text>
                  </View>
                  <Text style={styles.rowEmoji}>{item.emoji}</Text>
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.empty}>No reactions yet.</Text>
              }
            />
          )}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    paddingBottom: spacing.xl,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.subtle,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  title: {
    fontSize: typography.size.md,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  closeBtn: {
    fontSize: 16,
    color: colors.textMuted,
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.elevated,
  },
  tabActive: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(79,195,224,0.12)',
  },
  tabEmoji: { fontSize: 14 },
  tabLabel: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
    fontWeight: '600',
  },
  tabLabelActive: { color: colors.primary },
  loader: { marginTop: spacing.xl },
  listContent: { paddingHorizontal: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border.subtle,
  },
  nameCol: { flex: 1 },
  displayName: {
    fontSize: typography.size.sm,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  username: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
  rowEmoji: { fontSize: 20 },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing.xl,
    fontSize: typography.size.sm,
  },
});
