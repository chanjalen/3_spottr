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
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import {
  fetchGyms,
  fetchBusyLevel,
  fetchGymLeaderboard,
  enrollGym,
  unenrollGym,
} from '../../api/gyms';
import { GymListItem, BusyLevel, TopLifter } from '../../types/gym';
import Avatar from '../../components/common/Avatar';
import { colors, spacing, typography } from '../../theme';
import { GymsStackParamList, RootStackParamList } from '../../navigation/types';
import AppHeader from '../../components/navigation/AppHeader';

type RootNav = NativeStackNavigationProp<RootStackParamList>;

type Props = {
  navigation: NativeStackNavigationProp<GymsStackParamList, 'GymList'>;
};

const DEFAULT_REGION = {
  latitude: 40.115,
  longitude: -88.235,
  latitudeDelta: 0.15,
  longitudeDelta: 0.15,
};

function busyLevelColor(level: number | null): string {
  if (level === null) return '#9CA3AF';
  const map: Record<number, string> = {
    1: '#10B981',
    2: '#34D399',
    3: '#F59E0B',
    4: '#F97316',
    5: '#EF4444',
  };
  return map[level] ?? '#9CA3AF';
}

const LEGEND_ITEMS = [
  { label: 'No data',             color: '#9CA3AF' },
  { label: 'Not crowded',         color: '#10B981' },
  { label: 'Not too crowded',     color: '#34D399' },
  { label: 'Moderately crowded',  color: '#F59E0B' },
  { label: 'Crowded',             color: '#F97316' },
  { label: 'Very crowded',        color: '#EF4444' },
];

export default function GymListScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const rootNav = useNavigation<RootNav>();
  const [allGyms, setAllGyms] = useState<GymListItem[]>([]);
  const [gyms, setGyms] = useState<GymListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [busyLevels, setBusyLevels] = useState<Record<string, BusyLevel>>({});
  const [topLifters, setTopLifters] = useState<Record<string, TopLifter | null>>({});
  const [enrolling, setEnrolling] = useState<Set<string>>(new Set());
  const [selectedGymId, setSelectedGymId] = useState<string | null>(null);

  const displayedGyms = selectedGymId
    ? gyms.filter(g => g.id === selectedGymId)
    : gyms;

  const loadExtended = useCallback(async (gymList: GymListItem[]) => {
    const results = await Promise.allSettled(
      gymList.map(async (g) => {
        const [busy, lifters] = await Promise.allSettled([
          fetchBusyLevel(g.id),
          fetchGymLeaderboard(g.id, 'total'),
        ]);
        return {
          id: g.id,
          busy: busy.status === 'fulfilled' ? busy.value : null,
          topLifter: lifters.status === 'fulfilled' ? (lifters.value[0] ?? null) : null,
        };
      }),
    );
    const newBusy: Record<string, BusyLevel> = {};
    const newLifters: Record<string, TopLifter | null> = {};
    results.forEach((r) => {
      if (r.status === 'fulfilled') {
        if (r.value.busy) newBusy[r.value.id] = r.value.busy;
        newLifters[r.value.id] = r.value.topLifter;
      }
    });
    setBusyLevels(newBusy);
    setTopLifters(newLifters);
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await fetchGyms();
      setAllGyms(data);
      setGyms(data);
      loadExtended(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadExtended]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (text: string) => {
    setSearchText(text);
    if (!text.trim()) {
      setGyms(allGyms);
    } else {
      const q = text.trim().toLowerCase();
      setGyms(allGyms.filter(
        g => g.name.toLowerCase().includes(q) || (g.address ?? '').toLowerCase().includes(q),
      ));
    }
  };

  const handleEnroll = async (gym: GymListItem) => {
    if (enrolling.has(gym.id)) return;
    setEnrolling(prev => new Set(prev).add(gym.id));
    try {
      if (gym.is_enrolled) {
        await unenrollGym(gym.id);
      } else {
        await enrollGym(gym.id);
      }
      const toggled = { ...gym, is_enrolled: !gym.is_enrolled };
      setAllGyms(prev => prev.map(g => g.id === gym.id ? toggled : g));
      setGyms(prev => prev.map(g => g.id === gym.id ? toggled : g));
    } catch {
      // ignore
    } finally {
      setEnrolling(prev => { const s = new Set(prev); s.delete(gym.id); return s; });
    }
  };

  const mapRegion = (() => {
    const withCoords = gyms.filter(g => g.latitude && g.longitude);
    if (withCoords.length === 0) return DEFAULT_REGION;
    const lats = withCoords.map(g => parseFloat(g.latitude!));
    const lngs = withCoords.map(g => parseFloat(g.longitude!));
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const padding = 1.4;
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: (maxLat - minLat) * padding || 0.05,
      longitudeDelta: (maxLng - minLng) * padding || 0.05,
    };
  })();

  const renderGym = ({ item }: { item: GymListItem }) => {
    const busy = busyLevels[item.id] ?? null;
    const lifter = topLifters[item.id] ?? null;
    const isEnrolling = enrolling.has(item.id);
    const busyColor = busyLevelColor(busy?.level ?? null);

    return (
      <Pressable
        style={({ pressed }) => [styles.gymCard, pressed && styles.gymCardPressed]}
        onPress={() => navigation.navigate('GymDetail', { gymId: item.id, gymName: item.name })}
      >
        {/* Top row: name + enroll */}
        <View style={styles.cardTop}>
          <View style={styles.cardTitleBlock}>
            <Text style={styles.gymName} numberOfLines={2}>{item.name}</Text>
            {item.address ? (
              <Text style={styles.gymAddress} numberOfLines={1}>{item.address}</Text>
            ) : null}
          </View>
          <Pressable
            style={[styles.enrollBtn, item.is_enrolled && styles.enrolledBtn]}
            onPress={() => handleEnroll(item)}
            disabled={isEnrolling}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            {isEnrolling
              ? <ActivityIndicator size="small" color={item.is_enrolled ? colors.textOnPrimary : colors.primary} />
              : <Text style={[styles.enrollBtnText, item.is_enrolled && styles.enrolledBtnText]}>
                  {item.is_enrolled ? 'Enrolled' : 'Enroll'}
                </Text>
            }
          </Pressable>
        </View>

        {/* Divider */}
        <View style={styles.cardDivider} />

        {/* Bottom row: activity + top lifter */}
        <View style={styles.cardBottom}>
          {/* Activity block */}
          <View style={styles.activityBlock}>
            <Text style={styles.sectionLabel}>ACTIVITY</Text>
            <View style={styles.busyRow}>
              <View style={[styles.busyDot, { backgroundColor: busyColor }]} />
              <Text style={[styles.busyText, { color: busyColor }]}>
                {busy?.label ?? 'No data'}
              </Text>
            </View>
          </View>

          <View style={styles.cardBottomDivider} />

          {/* Top lifter block */}
          <View style={styles.lifterBlock}>
            <Text style={styles.sectionLabel}>TOP TOTAL LIFTER</Text>
            {lifter ? (
              <View style={styles.lifterRow}>
                <Pressable
                  style={styles.lifterUserPressable}
                  onPress={() => rootNav.navigate('Profile', { username: lifter.username })}
                >
                  <Avatar uri={lifter.avatar_url} name={lifter.display_name} size={28} />
                  <View style={styles.lifterInfo}>
                    <Text style={styles.lifterName} numberOfLines={1}>{lifter.display_name}</Text>
                    <Text style={styles.lifterUsername} numberOfLines={1}>@{lifter.username}</Text>
                  </View>
                </Pressable>
                <Text style={styles.lifterValue}>{lifter.value}</Text>
                <Text style={styles.lifterUnit}>{lifter.unit}</Text>
              </View>
            ) : (
              <Text style={styles.noDataText}>No data</Text>
            )}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      <LinearGradient
        colors={['#4FC3E0', '#6DCFE8', '#A8E2F4', '#D6F2FB', '#FFFFFF']}
        locations={[0, 0.2, 0.5, 0.75, 1]}
      >
        <AppHeader />

        {/* Search bar */}
        <View style={styles.searchWrap}>
          <View style={styles.searchBar}>
            <Feather name="search" size={16} color={colors.textSecondary} />
            <TextInput
              style={styles.searchInput}
              value={searchText}
              onChangeText={handleSearch}
              placeholder="Search gyms…"
              placeholderTextColor={colors.textSecondary}
              returnKeyType="search"
            />
            {searchText.length > 0 && (
              <Pressable onPress={() => handleSearch('')}>
                <Feather name="x" size={16} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={displayedGyms}
          keyExtractor={(item) => item.id}
          renderItem={renderGym}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <>
              {/* Stats row */}
              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>TOTAL GYMS</Text>
                  <Text style={styles.statValue}>{allGyms.length}</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>SHOWING</Text>
                  <Text style={styles.statValue}>{displayedGyms.length}</Text>
                </View>
              </View>

              {/* Map + legend overlay */}
              <View style={styles.mapContainer}>
                <MapView
                  style={StyleSheet.absoluteFillObject}
                  initialRegion={mapRegion}
                  region={mapRegion}
                >
                  {gyms
                    .filter(g => g.latitude && g.longitude)
                    .map(g => (
                      <Marker
                        key={g.id}
                        coordinate={{ latitude: parseFloat(g.latitude!), longitude: parseFloat(g.longitude!) }}
                        title={g.name}
                        description={g.address ?? undefined}
                        pinColor={busyLevelColor(busyLevels[g.id]?.level ?? null)}
                        onPress={() => setSelectedGymId(prev => prev === g.id ? null : g.id)}
                        onCalloutPress={() => navigation.navigate('GymDetail', { gymId: g.id, gymName: g.name })}
                      />
                    ))}
                </MapView>

                {/* Legend */}
                <View style={styles.legend}>
                  <Text style={styles.legendTitle}>Busy Level</Text>
                  {LEGEND_ITEMS.map(item => (
                    <View key={item.label} style={styles.legendRow}>
                      <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                      <Text style={styles.legendLabel}>{item.label}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Active pin filter chip */}
              {selectedGymId && (
                <Pressable style={styles.filterChip} onPress={() => setSelectedGymId(null)}>
                  <Feather name="x" size={12} color={colors.textOnPrimary} />
                  <Text style={styles.filterChipText}>Show all gyms</Text>
                </Pressable>
              )}
            </>
          }
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
  listContent: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: 120,
  },

  // Search bar
  searchWrap: {
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 24,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? 8 : 5,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.size.sm,
    fontFamily: typography.family.regular,
    color: colors.textSecondary,
    paddingVertical: 0,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.background.elevated,
    borderRadius: 14,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.base,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  statLabel: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 28,
    fontFamily: typography.family.bold,
    color: colors.textPrimary,
  },

  // Map
  mapContainer: {
    height: 220,
    borderRadius: 14,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },

  // Legend overlay
  legend: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(30, 30, 40, 0.82)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 4,
  },
  legendTitle: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.bold,
    color: '#FFFFFF',
    marginBottom: 2,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 10,
    fontFamily: typography.family.regular,
    color: '#E5E7EB',
  },

  // Gym card
  gymCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.base,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
    }),
  },
  gymCardPressed: { opacity: 0.85 },

  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  cardTitleBlock: {
    flex: 1,
    gap: 4,
  },
  gymName: {
    fontSize: typography.size.base,
    fontFamily: typography.family.bold,
    color: colors.textPrimary,
  },
  gymAddress: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textSecondary,
  },

  // Enroll button
  enrollBtn: {
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: colors.primary,
    minWidth: 72,
    alignItems: 'center',
  },
  enrolledBtn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  enrollBtnText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.primary,
  },
  enrolledBtnText: {
    color: colors.textOnPrimary,
  },

  // Divider
  cardDivider: {
    height: 1,
    backgroundColor: colors.border.subtle,
    marginBottom: spacing.md,
  },

  cardBottom: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cardBottomDivider: {
    width: 1,
    backgroundColor: colors.border.subtle,
  },

  // Activity block
  activityBlock: {
    flex: 1,
    gap: 6,
  },
  sectionLabel: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  busyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  busyText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
  },

  // Top lifter block
  lifterBlock: {
    flex: 2,
    gap: 6,
  },
  lifterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  lifterUserPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  lifterInfo: {
    flex: 1,
  },
  lifterName: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.textPrimary,
  },
  lifterUsername: {
    fontSize: 10,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
  },
  lifterValue: {
    fontSize: typography.size.base,
    fontFamily: typography.family.bold,
    color: colors.primary,
  },
  lifterUnit: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textSecondary,
  },
  noDataText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.regular,
    color: colors.textMuted,
  },

  // Pin filter chip
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: colors.primary,
    borderRadius: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginBottom: spacing.md,
  },
  filterChipText: {
    fontSize: typography.size.xs,
    fontFamily: typography.family.semibold,
    color: colors.textOnPrimary,
  },

  // Misc
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingTop: spacing['2xl'],
  },
  emptyText: {
    fontSize: typography.size.base,
    color: colors.textMuted,
  },
});
