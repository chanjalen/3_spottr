import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Modal,
  Animated,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Avatar from '../common/Avatar';
import { fetchLikers, Liker } from '../../api/feed';
import { colors, spacing, typography } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

interface LikersSheetProps {
  visible: boolean;
  itemId: string;
  itemType: 'post' | 'checkin';
  likeCount: number;
  onClose: () => void;
}

const SCREEN_H = Dimensions.get('window').height;
const SHEET_MAX_H = SCREEN_H * 0.55;

export default function LikersSheet({
  visible,
  itemId,
  itemType,
  likeCount,
  onClose,
}: LikersSheetProps) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [likers, setLikers] = useState<Liker[]>([]);
  const [loading, setLoading] = useState(false);
  const translateY = useRef(new Animated.Value(SHEET_MAX_H)).current;

  useEffect(() => {
    if (visible) {
      setLoading(true);
      setLikers([]);
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        damping: 22,
        stiffness: 180,
      }).start();
      fetchLikers(itemId, itemType)
        .then(setLikers)
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      Animated.timing(translateY, {
        toValue: SHEET_MAX_H,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, itemId, itemType]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUserPress = (username: string) => {
    onClose();
    setTimeout(() => navigation.navigate('Profile', { username }), 200);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose} />

      <Animated.View
        style={[
          styles.sheet,
          { maxHeight: SHEET_MAX_H, paddingBottom: insets.bottom + spacing.md },
          { transform: [{ translateY }] },
        ]}
      >
        <View style={styles.handle} />

        <View style={styles.header}>
          <Text style={styles.title}>
            {likeCount} {likeCount === 1 ? 'like' : 'likes'}
          </Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : likers.length === 0 ? (
          <View style={styles.center}>
            <Feather name="heart" size={32} color={colors.textMuted} />
            <Text style={styles.emptyText}>No one liked this yet</Text>
          </View>
        ) : (
          <FlatList
            data={likers}
            keyExtractor={(u) => u.id}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={() => handleUserPress(item.username)}
              >
                <Avatar uri={item.avatar_url} name={item.display_name} size={40} />
                <View style={styles.userText}>
                  <Text style={styles.displayName}>{item.display_name}</Text>
                  <Text style={styles.username}>@{item.username}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.textMuted} />
              </Pressable>
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 20,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.border.default,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  title: {
    fontSize: typography.size.md,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['3xl'],
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
  },
  listContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  rowPressed: {
    opacity: 0.7,
  },
  userText: {
    flex: 1,
    gap: 2,
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
