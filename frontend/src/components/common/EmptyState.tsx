import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';
import { FeedTab } from './FeedTabs';

interface EmptyStateProps {
  tab: FeedTab;
  onAddFriends?: () => void;
}

export default function EmptyState({ tab, onAddFriends }: EmptyStateProps) {
  const noFriends = tab === 'friends' && onAddFriends;

  const message = noFriends
    ? "Add friends to see their check-ins here."
    : tab === 'gym'
    ? "No gym check-ins yet. Share yours first!"
    : tab === 'org'
    ? "No organization check-ins yet."
    : tab === 'friends'
    ? "Your friends haven't checked in yet. Be the first!"
    : 'No posts to show yet. Start by sharing a workout!';

  const title = noFriends ? "You have no friends yet" : "Nothing here yet";

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Feather name={noFriends ? 'users' : 'inbox'} size={48} color={colors.textMuted} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {noFriends && (
        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
          onPress={onAddFriends}
        >
          <Feather name="user-plus" size={16} color="#fff" />
          <Text style={styles.addBtnText}>Add Friends</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.background.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.size.lg,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  message: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: 24,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    marginTop: spacing.lg,
  },
  addBtnPressed: {
    opacity: 0.8,
  },
  addBtnText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: '#fff',
  },
});
