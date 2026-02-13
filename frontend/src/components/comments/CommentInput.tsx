import React, { useState } from 'react';
import { View, TextInput, Pressable, Text, StyleSheet } from 'react-native';
import { colors, spacing, typography } from '../../theme';

interface CommentInputProps {
  placeholder?: string;
  onSubmit: (text: string) => void;
}

export default function CommentInput({
  placeholder = 'Add a comment...',
  onSubmit,
}: CommentInputProps) {
  const [text, setText] = useState('');

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setText('');
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={colors.text.muted}
        multiline
        maxLength={500}
      />
      <Pressable
        style={[styles.button, !text.trim() && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={!text.trim()}
      >
        <Text
          style={[
            styles.buttonText,
            !text.trim() && styles.buttonTextDisabled,
          ]}
        >
          Post
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    backgroundColor: colors.background.surface,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background.elevated,
    borderRadius: 20,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.text.primary,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  button: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: colors.brand.primary,
  },
  buttonTextDisabled: {
    color: colors.text.muted,
  },
});
