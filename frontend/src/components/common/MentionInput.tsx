import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TextInputProps,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import Avatar from './Avatar';
import { colors, spacing, typography } from '../../theme';
import { fetchMentionSuggestions, MentionUser } from '../../api/feed';

interface Props extends Omit<TextInputProps, 'onChangeText' | 'value'> {
  value: string;
  onChangeText: (text: string) => void;
}

/**
 * Detect an active @mention query at the cursor position.
 * Returns the query string and the index of the '@' character if found.
 * A mention is "active" when the cursor is positioned right after @word
 * with no spaces between @ and cursor.
 */
function detectActiveMention(
  text: string,
  cursorPos: number,
): { query: string; atIndex: number } | null {
  const before = text.slice(0, cursorPos);
  // Match: (start OR whitespace/newline) followed by @ and word chars at end of string
  const match = before.match(/(^|[\s\n])@([\w.\-]*)$/);
  if (!match) return null;
  const atIndex = before.length - match[0].length + match[1].length;
  return { query: match[2], atIndex };
}

/**
 * MentionInput — a TextInput that shows a user autocomplete list when the
 * user types @. The suggestion list uses priority ordering from the backend:
 * mutual friends → following → followers → closest match.
 */
export default function MentionInput({ value, onChangeText, style, ...rest }: Props) {
  const [cursorPos, setCursorPos] = useState(0);
  const [suggestions, setSuggestions] = useState<MentionUser[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeMention = useMemo(
    () => detectActiveMention(value, cursorPos),
    [value, cursorPos],
  );

  // Fetch suggestions when the active mention query changes
  useEffect(() => {
    if (activeMention === null) {
      setSuggestions([]);
      setLoading(false);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    setLoading(true);

    debounceRef.current = setTimeout(async () => {
      try {
        const results = await fetchMentionSuggestions(activeMention.query);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMention?.query, activeMention?.atIndex]);

  const handleSelectionChange = useCallback((e: any) => {
    setCursorPos(e.nativeEvent.selection.start);
  }, []);

  const handleSelectUser = useCallback(
    (user: MentionUser) => {
      if (!activeMention) return;
      const before = value.slice(0, activeMention.atIndex);
      const after = value.slice(activeMention.atIndex + 1 + activeMention.query.length);
      const newText = `${before}@${user.username} ${after}`;
      onChangeText(newText);
      setSuggestions([]);
      setCursorPos(before.length + user.username.length + 2); // after "@username "
    },
    [activeMention, value, onChangeText],
  );

  const showList = activeMention !== null && (loading || suggestions.length > 0);

  return (
    <View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSelectionChange={handleSelectionChange}
        style={style}
        {...rest}
      />
      {showList && (
        <View style={styles.list}>
          {loading && suggestions.length === 0 ? (
            <ActivityIndicator
              size="small"
              color={colors.primary}
              style={styles.loader}
            />
          ) : (
            suggestions.slice(0, 6).map((user) => (
              <Pressable
                key={user.id}
                style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
                onPress={() => handleSelectUser(user)}
              >
                <Avatar
                  uri={user.avatar_url}
                  name={user.display_name || user.username}
                  size={32}
                />
                <View style={styles.itemText}>
                  <Text style={styles.displayName} numberOfLines={1}>
                    {user.display_name || user.username}
                  </Text>
                  <Text style={styles.username}>@{user.username}</Text>
                </View>
              </Pressable>
            ))
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderColor,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  loader: {
    paddingVertical: spacing.md,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  itemPressed: {
    backgroundColor: colors.background.elevated,
  },
  itemText: {
    flex: 1,
  },
  displayName: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
  username: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
  },
});
