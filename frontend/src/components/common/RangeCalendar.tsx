import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, typography } from '../../theme';

interface Props {
  startDate: Date | null;
  endDate: Date | null;
  onChange: (start: Date | null, end: Date | null) => void;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function stripTime(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export default function RangeCalendar({ startDate, endDate, onChange }: Props) {
  const today = stripTime(new Date());
  const [monthOffset, setMonthOffset] = useState(0);

  const displayYear = today.getFullYear() + Math.floor((today.getMonth() + monthOffset) / 12);
  const displayMonth = ((today.getMonth() + monthOffset) % 12 + 12) % 12;

  const firstDay = new Date(displayYear, displayMonth, 1);
  const daysInMonth = new Date(displayYear, displayMonth + 1, 0).getDate();
  const startWeekday = firstDay.getDay(); // 0=Sun

  const cells: (Date | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(displayYear, displayMonth, i + 1)),
  ];

  const handleDayPress = (day: Date) => {
    const d = stripTime(day);
    if (!startDate) {
      onChange(d, null);
    } else if (!endDate) {
      if (d < startDate) {
        onChange(d, null);
      } else if (sameDay(d, startDate)) {
        // third tap = reset
        onChange(null, null);
      } else {
        onChange(startDate, d);
      }
    } else {
      // already have both — reset and start new selection
      onChange(d, null);
    }
  };

  const isStart = (day: Date) => !!startDate && sameDay(day, startDate);
  const isEnd = (day: Date) => !!endDate && sameDay(day, endDate);
  const isInRange = (day: Date) => {
    if (!startDate || !endDate) return false;
    return day > startDate && day < endDate;
  };
  const isToday = (day: Date) => sameDay(day, today);

  return (
    <View style={styles.container}>
      {/* Month header */}
      <View style={styles.header}>
        <Pressable style={styles.navBtn} onPress={() => setMonthOffset(o => o - 1)} hitSlop={8}>
          <Feather name="chevron-left" size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.monthLabel}>
          {MONTHS[displayMonth]} {displayYear}
        </Text>
        <Pressable style={styles.navBtn} onPress={() => setMonthOffset(o => o + 1)} hitSlop={8}>
          <Feather name="chevron-right" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      {/* Day-of-week row */}
      <View style={styles.weekRow}>
        {DAYS.map(d => (
          <Text key={d} style={styles.dayLabel}>{d}</Text>
        ))}
      </View>

      {/* Day grid */}
      <View style={styles.grid}>
        {cells.map((day, idx) => {
          if (!day) {
            return <View key={`empty-${idx}`} style={styles.cell} />;
          }
          const selected = isStart(day) || isEnd(day);
          const inRange = isInRange(day);
          const todayDot = isToday(day) && !selected;

          return (
            <Pressable
              key={day.toISOString()}
              style={[styles.cell, inRange && styles.cellInRange]}
              onPress={() => handleDayPress(day)}
            >
              <View style={[styles.dayCircle, selected && styles.dayCircleSelected]}>
                <Text style={[styles.dayText, selected && styles.dayTextSelected]}>
                  {day.getDate()}
                </Text>
              </View>
              {todayDot && <View style={styles.todayDot} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  navBtn: {
    padding: 4,
  },
  monthLabel: {
    fontSize: typography.size.base,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: typography.size.xs,
    fontWeight: '600',
    color: colors.textMuted,
    paddingVertical: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellInRange: {
    backgroundColor: 'rgba(79,195,224,0.15)',
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleSelected: {
    backgroundColor: '#4FC3E0',
  },
  dayText: {
    fontSize: typography.size.sm,
    color: colors.textPrimary,
  },
  dayTextSelected: {
    color: '#fff',
    fontWeight: '700',
  },
  todayDot: {
    position: 'absolute',
    bottom: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
});
