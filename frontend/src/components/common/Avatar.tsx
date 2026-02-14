import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { colors, typography } from '../../theme';

interface AvatarProps {
  uri: string | null;
  name: string;
  size?: number;
}

export default function Avatar({ uri, name, size = 44 }: AvatarProps) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (uri) {
    return (
      <Image
        source={{ uri }}
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
    );
  }

  return (
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
}

const styles = StyleSheet.create({
  image: {
    borderWidth: 1,
    borderColor: colors.border.subtle,
    backgroundColor: colors.background.elevated,
  },
  fallback: {
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: colors.text.primary,
    fontFamily: typography.family.semibold,
  },
});
