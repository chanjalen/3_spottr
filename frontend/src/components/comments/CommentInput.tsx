import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Pressable, Text, Image, TextInput, StyleSheet, Platform, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, typography } from '../../theme';
import MentionAutocomplete, { MentionableUser } from '../messages/MentionAutocomplete';

interface CommentInputProps {
  placeholder?: string;
  prefill?: string;
  onSubmit: (text: string, photo?: { uri: string; name: string; type: string }) => void;
  mentionableUsers?: MentionableUser[];
  onMentionQueryChange?: (query: string | null) => void;
}

export default function CommentInput({
  placeholder = 'Add a comment...',
  prefill,
  onSubmit,
  mentionableUsers,
  onMentionQueryChange,
}: CommentInputProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<TextInput>(null);

  // When prefill changes (reply target set/cleared), seed the input and focus
  useEffect(() => {
    if (prefill === undefined) return;
    setText(prefill);
    if (prefill) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [prefill]);
  const [photo, setPhoto] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const canSubmit = text.trim().length > 0 || !!photo;

  const detectMention = useCallback((value: string) => {
    const match = value.match(/@(\w*)$/);
    const query = match ? match[1] : null;
    setMentionQuery(query);
    onMentionQueryChange?.(query);
  }, [onMentionQueryChange]);

  const handleMentionSelect = useCallback((user: MentionableUser) => {
    const newText = text.replace(/@(\w*)$/, `@${user.username} `);
    setText(newText);
    setMentionQuery(null);
    onMentionQueryChange?.(null);
  }, [text, onMentionQueryChange]);

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(text.trim(), photo ?? undefined);
    setText('');
    setPhoto(null);
    setMentionQuery(null);
    onMentionQueryChange?.(null);
  };

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const mimeType = asset.mimeType ?? 'image/jpeg';
      const ext = mimeType === 'image/png' ? 'png' : 'jpg';
      setPhoto({ uri: asset.uri, name: `comment.${ext}`, type: mimeType });
    }
  };

  return (
    <View style={styles.wrapper}>
      {mentionQuery !== null && mentionableUsers && mentionableUsers.length > 0 && (
        <MentionAutocomplete
          query={mentionQuery}
          users={mentionableUsers}
          onSelect={handleMentionSelect}
        />
      )}
      {photo && (
        <View style={styles.photoPreviewRow}>
          <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
          <Pressable
            onPress={() => setPhoto(null)}
            style={styles.photoRemove}
            hitSlop={8}
          >
            <Feather name="x" size={12} color="#fff" />
          </Pressable>
        </View>
      )}
      <View style={styles.inputRow}>
        <Pressable
          onPress={handlePickPhoto}
          style={styles.mediaBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Attach photo"
        >
          <Feather name="image" size={20} color={photo ? colors.primary : colors.textMuted} />
        </Pressable>
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={text}
          onChangeText={(v) => { detectMention(v); setText(v); }}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={500}
        />
        <Pressable
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          accessibilityLabel="Post comment"
          accessibilityRole="button"
        >
          <Feather name="send" size={18} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderTopWidth: 1,
    borderTopColor: colors.border.default,
    backgroundColor: colors.surface,
  },
  photoPreviewRow: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  photoPreview: {
    width: 72,
    height: 72,
    borderRadius: 10,
  },
  photoRemove: {
    position: 'absolute',
    top: spacing.sm + 4,
    left: spacing.base + 56,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
  },
  mediaBtn: {
    paddingBottom: Platform.OS === 'ios' ? 6 : 8,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background.elevated,
    borderRadius: 24,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textPrimary,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Platform.OS === 'ios' ? 4 : 6,
  },
  buttonDisabled: {
    backgroundColor: colors.border.default,
  },
});
