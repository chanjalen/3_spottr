import React from 'react';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { colors, spacing } from '../../theme';

interface FeedCardImageProps {
  uri: string;
}

export default function FeedCardImage({ uri }: FeedCardImageProps) {
  return (
    <Image
      source={{ uri }}
      style={styles.image}
      contentFit="cover"
      transition={300}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 16,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.elevated,
  },
});
