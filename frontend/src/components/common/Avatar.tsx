import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { colors, typography } from '../../theme';
import { getImageUrl } from '../../utils/imageUrl';

interface AvatarProps {
  uri: string | null;
  name: string;
  size?: number;
  onPress?: () => void;
}

export default function Avatar({ uri, name, size = 40, onPress }: AvatarProps) {
  const safeName = name || '';
  const initials =
    safeName
      .split(' ')
      .map((n) => n[0] || '')
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?';

  const content = uri ? (
    <Image
      source={{ uri: getImageUrl(uri, 'avatar') ?? uri }}
      style={[
        styles.image,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
      contentFit="cover"
      transition={200}
    />
  ) : (
    <View
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
    >
      <Text
        style={[
          styles.initials,
          { fontSize: size * 0.38 },
        ]}
      >
        {initials}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} hitSlop={8}>
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: colors.background.elevated,
  },
  fallback: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: colors.textOnPrimary,
    fontFamily: typography.family.semibold,
  },
});
