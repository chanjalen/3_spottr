import React from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import Avatar from '../common/Avatar';
import { colors, spacing, typography } from '../../theme';

export interface MentionableUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface Props {
  query: string;
  users: MentionableUser[];
  onSelect: (user: MentionableUser) => void;
}

export default function MentionAutocomplete({ query, users, onSelect }: Props) {
  const q = query.toLowerCase();
  const filtered = users.filter(
    u =>
      u.username.toLowerCase().startsWith(q) ||
      u.display_name.toLowerCase().startsWith(q),
  );

  if (filtered.length === 0) return null;

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        keyboardShouldPersistTaps="always"
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => onSelect(item)}>
            <Avatar uri={item.avatar_url} name={item.display_name} size={32} />
            <View style={styles.names}>
              <Text style={styles.displayName} numberOfLines={1}>{item.display_name}</Text>
              <Text style={styles.username} numberOfLines={1}>@{item.username}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    maxHeight: 200,
    backgroundColor: colors.background.elevated,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  names: {
    flex: 1,
  },
  displayName: {
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  username: {
    fontSize: typography.size.xs,
    color: colors.textMuted,
  },
});
