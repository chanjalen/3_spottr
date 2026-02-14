import React from 'react';
import { Pressable, Text, StyleSheet, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';

interface LinkPreviewProps {
  url: string;
}

export default function LinkPreview({ url }: LinkPreviewProps) {
  const displayUrl = url.replace(/^https?:\/\//, '').replace(/\/$/, '');

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={() => Linking.openURL(url)}
    >
      <Feather name="external-link" size={14} color={colors.brand.primary} />
      <Text style={styles.url} numberOfLines={1}>
        {displayUrl}
      </Text>
      <Feather name="chevron-right" size={14} color={colors.text.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background.elevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  url: {
    flex: 1,
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.brand.primary,
  },
});
