import React from 'react';
import { Text, TextStyle } from 'react-native';
import { colors } from '../../theme';

interface Props {
  content: string;
  textStyle: TextStyle | TextStyle[];
  mentionStyle?: TextStyle;
  onMentionPress?: (username: string) => void;
}

const DEFAULT_MENTION_STYLE: TextStyle = {
  color: colors.primary,
  fontWeight: '600',
};

export default function MentionText({ content, textStyle, mentionStyle, onMentionPress }: Props) {
  const parts = content.split(/(@\w+)/g);

  return (
    <Text style={textStyle}>
      {parts.map((part, index) => {
        if (/^@\w+$/.test(part)) {
          const username = part.slice(1);
          return (
            <Text
              key={index}
              style={mentionStyle ?? DEFAULT_MENTION_STYLE}
              onPress={onMentionPress ? () => onMentionPress(username) : undefined}
            >
              {part}
            </Text>
          );
        }
        return <Text key={index}>{part}</Text>;
      })}
    </Text>
  );
}
