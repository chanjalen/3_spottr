import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { createWorkoutInvite } from '../../api/gyms';
import { colors, spacing, typography } from '../../theme';
import { GymsStackParamList } from '../../navigation/types';

type Props = {
  navigation: NativeStackNavigationProp<GymsStackParamList, 'CreateInvite'>;
  route: RouteProp<GymsStackParamList, 'CreateInvite'>;
};

export default function CreateInviteScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { gymId, gymName } = route.params;

  const [workoutType, setWorkoutType] = useState('');
  const [description, setDescription] = useState('');
  const [spots, setSpots] = useState(1);
  const [scheduledDate, setScheduledDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDateChange = (_event: DateTimePickerEvent, selected?: Date) => {
    setShowDatePicker(false);
    if (selected) {
      const updated = new Date(scheduledDate);
      updated.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      setScheduledDate(updated);
    }
  };

  const handleTimeChange = (_event: DateTimePickerEvent, selected?: Date) => {
    setShowTimePicker(false);
    if (selected) {
      const updated = new Date(scheduledDate);
      updated.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setScheduledDate(updated);
    }
  };

  const handleSubmit = async () => {
    if (!workoutType.trim()) {
      setError('Workout type is required.');
      return;
    }
    setError(null);
    setSubmitting(true);

    const expiresAt = new Date(scheduledDate.getTime() + 60 * 60 * 1000); // +1 hour

    try {
      await createWorkoutInvite({
        gym_id: gymId,
        workout_type: workoutType.trim(),
        description: description.trim(),
        spots_available: spots,
        scheduled_time: scheduledDate.toISOString(),
        type: 'gym',
        expires_at: expiresAt.toISOString(),
      });
      navigation.goBack();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.response?.data?.detail ?? 'Failed to create invite.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.base }}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Feather name="x" size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Post Invite</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.base, paddingBottom: insets.bottom + 80 }}>
        <Text style={styles.gymLabel}>{gymName}</Text>

        {/* Workout Type */}
        <View style={styles.field}>
          <Text style={styles.label}>Workout Type</Text>
          <TextInput
            style={styles.input}
            value={workoutType}
            onChangeText={setWorkoutType}
            placeholder="e.g. Leg Day, Push, Cardio…"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        {/* Description */}
        <View style={styles.field}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="What are you planning to do?"
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Spots */}
        <View style={styles.field}>
          <Text style={styles.label}>Spots Available</Text>
          <View style={styles.stepper}>
            <Pressable
              style={styles.stepBtn}
              onPress={() => setSpots(s => Math.max(1, s - 1))}
            >
              <Feather name="minus" size={18} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.stepValue}>{spots}</Text>
            <Pressable
              style={styles.stepBtn}
              onPress={() => setSpots(s => s + 1)}
            >
              <Feather name="plus" size={18} color={colors.textPrimary} />
            </Pressable>
          </View>
        </View>

        {/* Date & Time */}
        <View style={styles.field}>
          <Text style={styles.label}>Scheduled Time</Text>
          <View style={styles.dateTimeRow}>
            <Pressable style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
              <Feather name="calendar" size={14} color={colors.primary} />
              <Text style={styles.dateBtnText}>
                {scheduledDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </Pressable>
            <Pressable style={styles.dateBtn} onPress={() => setShowTimePicker(true)}>
              <Feather name="clock" size={14} color={colors.primary} />
              <Text style={styles.dateBtnText}>
                {scheduledDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </Pressable>
          </View>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={scheduledDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleDateChange}
            minimumDate={new Date()}
          />
        )}
        {showTimePicker && (
          <DateTimePicker
            value={scheduledDate}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleTimeChange}
          />
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable style={styles.submitBtn} onPress={handleSubmit} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>Post Invite</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: typography.size.base, fontWeight: '700', color: colors.textPrimary },
  gymLabel: {
    fontSize: typography.size.sm,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },
  field: { marginBottom: spacing.md, gap: spacing.xs },
  label: { fontSize: typography.size.sm, fontWeight: '600', color: colors.textPrimary },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    fontSize: typography.size.sm,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  textArea: { minHeight: 80 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  stepValue: {
    fontSize: typography.size.xl,
    fontWeight: '700',
    color: colors.textPrimary,
    minWidth: 36,
    textAlign: 'center',
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.default,
  },
  dateBtnText: { fontSize: typography.size.sm, color: colors.primary, fontWeight: '600' },
  errorText: {
    fontSize: typography.size.sm,
    color: '#EF4444',
    marginBottom: spacing.sm,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: spacing.md + 2,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitBtnText: { fontSize: typography.size.base, fontWeight: '700', color: '#fff' },
});
