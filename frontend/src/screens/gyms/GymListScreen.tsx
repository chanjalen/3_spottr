import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchGyms } from '../../api/gyms';
import { Gym } from '../../types/gym';
import { colors, spacing, typography, shadow } from '../../theme';
import { GymsStackParamList } from '../../navigation/types';
import AppHeader from '../../components/navigation/AppHeader';

type Props = {
  navigation: NativeStackNavigationProp<GymsStackParamList, 'GymList'>;
};

export default function GymListScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [searchText, setSearchText] = useState('');

  const load = useCallback(async (q = '') => {
    try {
      const data = await fetchGyms(q || undefined);
      setGyms(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSearch = () => {
    setLoading(true);
    load(searchText.trim());
  };

  const renderGym = ({ item }: { item: Gym }) => (
    <Pressable
      style={({ pressed }) => [styles.gymCard, pressed && styles.gymCardPressed]}
      onPress={() => navigation.navigate('GymDetail', { gymId: item.id, gymName: item.name })}
    >
      <View style={styles.gymIconWrap}>
        <Feather name="activity" size={24} color={colors.primary} />
      </View>
      <View style={styles.gymInfo}>
        <Text style={styles.gymName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.gymAddress} numberOfLines={1}>{item.address}, {item.city}</Text>
      </View>
      <View style={styles.gymRight}>
        {item.is_enrolled && (
          <View style={styles.enrolledBadge}>
            <Text style={styles.enrolledText}>Enrolled</Text>
          </View>
        )}
        <Feather name="chevron-right" size={18} color={colors.textMuted} />
      </View>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      <AppHeader />

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Feather name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Search gyms…"
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />
          {searchText.length > 0 && (
            <Pressable onPress={() => { setSearchText(''); load(); }}>
              <Feather name="x" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={gyms}
          keyExtractor={(item) => item.id}
          renderItem={renderGym}
          contentContainerStyle={{ paddingHorizontal: spacing.base, paddingTop: spacing.sm, paddingBottom: insets.bottom + 100 }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(searchText); }} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="activity" size={36} color={colors.textMuted} />
              <Text style={styles.emptyText}>No gyms found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  searchWrap: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background.elevated,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingTop: spacing['2xl'],
  },
  emptyText: { fontSize: typography.size.base, color: colors.textMuted },
  gymCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    gap: spacing.md,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 2 },
    }),
  },
  gymCardPressed: { opacity: 0.8 },
  gymIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(79,195,224,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gymInfo: { flex: 1, gap: 2 },
  gymName: { fontSize: typography.size.base, fontWeight: '600', color: colors.textPrimary },
  gymAddress: { fontSize: typography.size.xs, color: colors.textSecondary },
  gymRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  enrolledBadge: {
    backgroundColor: 'rgba(79,195,224,0.15)',
    borderRadius: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  enrolledText: { fontSize: typography.size.xs, color: colors.primary, fontWeight: '600' },
});
