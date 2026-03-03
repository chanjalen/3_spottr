import React, { useState } from 'react';
import { View, Pressable, Text, Image, TextInput, StyleSheet, Platform, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, spacing, typography } from '../../theme';

interface CommentInputProps {
  placeholder?: string;
  onSubmit: (text: string, photo?: { uri: string; name: string; type: string }) => void;
}

export default function CommentInput({
  placeholder = 'Add a comment...',
  onSubmit,
}: CommentInputProps) {
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<{ uri: string; name: string; type: string } | null>(null);

  const canSubmit = text.trim().length > 0 || !!photo;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(text.trim(), photo ?? undefined);
    setText('');
    setPhoto(null);
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
          style={styles.input}
          value={text}
          onChangeText={setText}
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
          <Text style={[styles.buttonText, !canSubmit && styles.buttonTextDisabled]}>
            Post
          </Text>
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
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm + 2,
    minHeight: 44,
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.semibold,
    color: colors.primary,
  },
  buttonTextDisabled: {
    color: colors.textMuted,
  },
});
