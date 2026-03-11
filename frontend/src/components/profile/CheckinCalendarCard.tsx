/**
 * CheckinCalendarCard
 *
 * Same calendar grid and day-tap viewer as the Profile screen.
 * Data: fetchUserCheckins (JS Date / device timezone, no UTC shift).
 * Viewer: full photo card with gradient overlays — matches CalCheckinCard
 * in ProfileScreen exactly.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { fetchUserCheckins, CheckinItem } from '../../api/feed';
import { fetchCalendarPosts } from '../../api/workouts';
import { colors, spacing } from '../../theme';
import { getImageUrl } from '../../utils/imageUrl';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const { width: SW, height: SH } = Dimensions.get('window');
const CARD_W = SW * 0.88;
const CARD_H = SH * 0.64;

interface Props {
  username: string;
}

type DayCheckins = { day: number; checkins: CheckinItem[] };

export default function CheckinCalendarCard({ username }: Props) {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed

  const [checkins, setCheckins] = useState<CheckinItem[]>([]);
  const [restDayNums, setRestDayNums] = useState<Set<number>>(new Set());
  const [modalVisible, setModalVisible] = useState(false);
  const [modalDayIdx, setModalDayIdx]   = useState(0);

  useEffect(() => {
    setCheckins([]);
    setRestDayNums(new Set());
    fetchUserCheckins(username, undefined, month + 1, year)
      .then((res) => setCheckins(res.items))
      .catch(() => {});
    fetchCalendarPosts(year, month + 1, username)
      .then((res) => {
        const nums = new Set(
          res.posts
            .filter((p) => p.type === 'rest')
            .map((p) => {
              const parts = p.date.split('-');
              return parseInt(parts[2], 10);
            })
        );
        setRestDayNums(nums);
      })
      .catch(() => {});
  }, [username, year, month]);

  // Group by local day — same as profile (JS Date = device timezone)
  const dayMap = useMemo(() => {
    const map = new Map<number, CheckinItem[]>();
    for (const c of checkins) {
      const d = new Date(c.created_at);
      // 3AM rule: activities before 3AM count for the previous day
      if (d.getHours() < 3) d.setDate(d.getDate() - 1);
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate();
        if (!map.has(day)) map.set(day, []);
        map.get(day)!.push(c);
      }
    }
    return map;
  }, [checkins, year, month]);

  const checkinDayNums = useMemo(() => new Set(dayMap.keys()), [dayMap]);

  // Sorted list of days with checkins for the viewer FlatList
  const sortedDays = useMemo<DayCheckins[]>(() =>
    Array.from(dayMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([day, items]) => ({ day, checkins: items })),
    [dayMap],
  );

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };
  const isNextDisabled = () => {
    const today = new Date();
    return year >= today.getFullYear() && month >= today.getMonth();
  };

  const handleDayPress = (day: number) => {
    if (!checkinDayNums.has(day)) return;
    const idx = sortedDays.findIndex((d) => d.day === day);
    setModalDayIdx(idx >= 0 ? idx : 0);
    setModalVisible(true);
  };

  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build explicit week rows so each cell uses flex: 1 (avoids % rounding wrap bugs)
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  return (
    <View style={styles.card}>
      {/* Month nav */}
      <View style={styles.calNav}>
        <Pressable style={styles.calNavBtn} onPress={prevMonth}>
          <Feather name="chevron-left" size={18} color={colors.textSecondary} />
        </Pressable>
        <Text style={styles.calMonthLabel}>{MONTHS[month]} {year}</Text>
        <Pressable
          style={[styles.calNavBtn, isNextDisabled() && { opacity: 0.3 }]}
          onPress={nextMonth}
          disabled={isNextDisabled()}
        >
          <Feather name="chevron-right" size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Weekday headers */}
      <View style={styles.calWeekdays}>
        {WEEKDAYS.map((d, i) => (
          <Text key={i} style={styles.calWeekday}>{d}</Text>
        ))}
      </View>

      {/* Day grid — rendered as explicit rows so each cell uses flex:1 (no % rounding) */}
      <View style={styles.calDays}>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.calWeekRow}>
            {week.map((day, di) => {
              if (day === null) return <View key={di} style={styles.calDay} />;
              const hasCheckin = checkinDayNums.has(day);
              const isRestDay = !hasCheckin && restDayNums.has(day);
              return (
                <Pressable
                  key={di}
                  style={styles.calDay}
                  onPress={() => handleDayPress(day)}
                  disabled={!hasCheckin}
                >
                  <View style={[
                    styles.calDayBubble,
                    hasCheckin && styles.calDayBubbleWorkout,
                    isRestDay && styles.calDayBubbleRest,
                  ]}>
                    <Text style={[styles.calDayText, hasCheckin && styles.calDayTextWorkout, isRestDay && styles.calDayTextWorkout]}>
                      {day}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      {/* Day viewer modal — matches profile's CalCheckinCard */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
        statusBarTranslucent
      >
        <View style={styles.modalBg}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalVisible(false)} />

          {sortedDays.length > 0 && (
            <DayViewer
              days={sortedDays}
              initialIdx={modalDayIdx}
              year={year}
              month={month}
              onClose={() => setModalVisible(false)}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

// ─── Day Viewer (vertical swipe between days, horizontal swipe between
//     multiple check-ins on the same day) ────────────────────────────────────

function DayViewer({
  days, initialIdx, year, month, onClose,
}: {
  days: DayCheckins[];
  initialIdx: number;
  year: number;
  month: number;
  onClose: () => void;
}) {
  const listRef = useRef<FlatList>(null);

  return (
    <FlatList
      ref={listRef}
      data={days}
      keyExtractor={(d) => String(d.day)}
      pagingEnabled
      showsVerticalScrollIndicator={false}
      decelerationRate="fast"
      initialScrollIndex={initialIdx > 0 ? initialIdx : undefined}
      getItemLayout={(_, index) => ({ length: SH, offset: SH * index, index })}
      renderItem={({ item }) => (
        <View style={{ width: SW, height: SH, alignItems: 'center', justifyContent: 'center' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <CheckinCard
            day={item}
            year={year}
            month={month}
            onClose={onClose}
          />
        </View>
      )}
    />
  );
}

// ─── Single checkin card — identical layout to profile's CalCheckinCard ───────

function CheckinCard({
  day, year, month, onClose,
}: {
  day: DayCheckins;
  year: number;
  month: number;
  onClose: () => void;
}) {
  const [checkinIdx, setCheckinIdx] = useState(0);
  const total = day.checkins.length;

  if (total === 1) {
    return (
      <SingleCheckin
        checkin={day.checkins[0]}
        day={day.day}
        year={year}
        month={month}
        idx={0}
        total={1}
        isActive
        onClose={onClose}
      />
    );
  }

  // Multiple check-ins — horizontal paginated FlatList, same as profile
  return (
    <View style={styles.photoCard}>
      <FlatList
        data={day.checkins}
        keyExtractor={(c) => c.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        getItemLayout={(_, index) => ({ length: CARD_W, offset: CARD_W * index, index })}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / CARD_W);
          setCheckinIdx(idx);
        }}
        renderItem={({ item: checkin, index }) => (
          <SingleCheckin
            checkin={checkin}
            day={day.day}
            year={year}
            month={month}
            idx={index}
            total={total}
            isActive={index === checkinIdx}
            onClose={onClose}
          />
        )}
      />
      {/* Dot indicators sit above the FlatList */}
      <View style={styles.dotsAbsolute}>
        {day.checkins.map((_, i) => (
          <View key={i} style={[styles.dot, i === checkinIdx && styles.dotActive]} />
        ))}
      </View>
      <Pressable style={styles.xBtn} onPress={onClose} hitSlop={12}>
        <Feather name="x" size={18} color="#fff" />
      </Pressable>
    </View>
  );
}

function SingleCheckin({
  checkin, day, year, month, idx, total, isActive, onClose,
}: {
  checkin: CheckinItem;
  day: number;
  year: number;
  month: number;
  idx: number;
  total: number;
  isActive: boolean;
  onClose: () => void;
}) {
  const hasVideo = !!checkin.video_url;
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);

  const videoPlayer = useVideoPlayer(hasVideo ? checkin.video_url! : null, (p) => {
    p.loop = true;
    p.muted = false;
  });

  useEffect(() => {
    if (!hasVideo) return;
    if (isActive) {
      videoPlayer.play();
      setIsVideoPlaying(true);
      setUserPaused(false);
    } else {
      videoPlayer.pause();
      setIsVideoPlaying(false);
      setUserPaused(false);
    }
  }, [isActive, hasVideo]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastVideoTapRef = useRef(0);
  const videoTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleVideoTap = () => {
    const now = Date.now();
    if (now - lastVideoTapRef.current < 300) {
      if (videoTapTimerRef.current) { clearTimeout(videoTapTimerRef.current); videoTapTimerRef.current = null; }
      lastVideoTapRef.current = 0;
      return;
    }
    lastVideoTapRef.current = now;
    const playing = isVideoPlaying;
    videoTapTimerRef.current = setTimeout(() => {
      videoTapTimerRef.current = null;
      if (playing) {
        videoPlayer.pause();
        setIsVideoPlaying(false);
        setUserPaused(true);
      } else {
        videoPlayer.play();
        setIsVideoPlaying(true);
        setUserPaused(false);
      }
    }, 300);
  };

  return (
    <Pressable style={styles.photoCard} onPress={hasVideo ? handleVideoTap : undefined}>
      {hasVideo ? (
        <View style={[StyleSheet.absoluteFill, { transform: [{ scaleX: -1 }] }]}>
          <VideoView
            player={videoPlayer}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
          />
        </View>
      ) : checkin.photo_url ? (
        <Image source={{ uri: getImageUrl(checkin.photo_url, 'thumbnail') ?? checkin.photo_url }} style={[StyleSheet.absoluteFill, checkin.is_front_camera && { transform: [{ scaleX: -1 }] }]} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.noPhoto]}>
          <Feather name="camera" size={48} color="rgba(255,255,255,0.2)" />
        </View>
      )}

      {hasVideo && userPaused && (
        <View style={styles.pauseIndicator} pointerEvents="none">
          <Feather name="pause" size={36} color="rgba(255,255,255,0.85)" />
        </View>
      )}

      <LinearGradient colors={['rgba(0,0,0,0.6)', 'transparent']} style={styles.topGrad}>
        <Text style={styles.dateText}>{MONTHS[month]} {day}, {year}</Text>
        {total > 1 && (
          <Text style={styles.checkinOf}>{idx + 1} / {total}</Text>
        )}
      </LinearGradient>

      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.82)']} style={styles.bottomGrad}>
        {!!checkin.workout_type && (
          <Text style={styles.workoutType}>{checkin.workout_type}</Text>
        )}
        {!!checkin.location_name && (
          <View style={styles.locRow}>
            <Feather name="map-pin" size={12} color="rgba(255,255,255,0.75)" />
            <Text style={styles.location}>{checkin.location_name}</Text>
          </View>
        )}
        {!!checkin.description && (
          <Text style={styles.desc}>{checkin.description}</Text>
        )}
      </LinearGradient>

      {total === 1 && (
        <Pressable style={styles.xBtn} onPress={onClose} hitSlop={12}>
          <Feather name="x" size={18} color="#fff" />
        </Pressable>
      )}
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Calendar grid (identical to profile)
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border.default,
    padding: spacing.base,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  calNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  calNavBtn: {
    width: 36, height: 36, backgroundColor: colors.background.elevated,
    borderRadius: 8, borderWidth: 1, borderColor: colors.border.subtle,
    alignItems: 'center', justifyContent: 'center',
  },
  calMonthLabel: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  calWeekdays: { flexDirection: 'row', marginBottom: spacing.sm },
  calWeekday: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '500', color: colors.textMuted, paddingVertical: 4 },
  calDays: {},
  calWeekRow: { flexDirection: 'row' },
  calDay: { flex: 1, aspectRatio: 1, padding: 2, alignItems: 'center', justifyContent: 'center' },
  calDayBubble: {
    flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center',
    borderRadius: 999, backgroundColor: 'rgba(120,120,128,0.15)',
  },
  calDayBubbleWorkout: { backgroundColor: colors.primary },
  calDayBubbleRest: { backgroundColor: colors.textMuted },
  calDayText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
  calDayTextWorkout: { color: '#fff', fontWeight: '700' },
  calDayRestText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // Modal
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Photo card (matches profile CalModalCard)
  photoCard: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#111',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.5, shadowRadius: 24 },
      android: { elevation: 16 },
    }),
  },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  pauseIndicator: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  topGrad: {
    position: 'absolute', top: 0, left: 0, right: 0,
    paddingTop: 16, paddingHorizontal: 16, paddingBottom: 40,
  },
  bottomGrad: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 60, paddingBottom: 16,
  },
  dateText: { fontSize: 17, fontWeight: '700', color: '#fff' },
  checkinOf: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  workoutType: { fontSize: 18, fontWeight: '700', color: '#fff' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  location: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  desc: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 5, lineHeight: 19 },
  dotsAbsolute: {
    position: 'absolute', bottom: 18, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotActive: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  xBtn: {
    position: 'absolute', top: 12, right: 12,
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
  },
});
