import DateTimePicker from '@react-native-community/datetimepicker';
import Slider from '@react-native-community/slider';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as store from '../../src/domain/store';
import { scheduleAlarm, cancelAlarmNotifications } from '../../src/domain/scheduler';
import {
  ALL_EXERCISES,
  EXERCISE_LABELS,
  REPS_MAX,
  REPS_MIN,
  SNOOZE_MAX_MINUTES,
  SNOOZE_MIN_MINUTES,
  WEEKDAY_SHORT,
  clampReps,
  clampSnooze,
  makeDefaultAlarm,
  type Alarm,
  type ExerciseType,
  type Weekday,
} from '../../src/domain/types';
import { colors, radii } from '../../src/ui/theme';

export default function EditAlarm() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const initial = useMemo<Alarm>(() => {
    if (!isNew) {
      const existing = store.getAlarm(id);
      if (existing) return existing;
    }
    return makeDefaultAlarm(store.newAlarmId());
  }, [id, isNew]);

  const [alarm, setAlarm] = useState<Alarm>(initial);

  const set = <K extends keyof Alarm>(key: K, value: Alarm[K]) =>
    setAlarm((a) => ({ ...a, [key]: value }));

  const toggleDay = (d: Weekday) =>
    setAlarm((a) => ({
      ...a,
      repeatDays: a.repeatDays.includes(d)
        ? a.repeatDays.filter((x) => x !== d)
        : [...a.repeatDays, d],
    }));

  const save = async () => {
    const clean: Alarm = {
      ...alarm,
      enabled: true,
      snoozeMinutes: clampSnooze(alarm.snoozeMinutes),
      targetReps: clampReps(alarm.targetReps),
    };
    await store.upsertAlarm(clean);
    await scheduleAlarm(clean);
    router.back();
  };

  const remove = async () => {
    await cancelAlarmNotifications(alarm.id);
    await store.deleteAlarm(alarm.id);
    router.back();
  };

  const pickerDate = new Date();
  pickerDate.setHours(alarm.hour, alarm.minute, 0, 0);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.headerBtn}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{isNew ? 'New Alarm' : 'Edit Alarm'}</Text>
          <Pressable onPress={save} hitSlop={12}>
            <Text style={[styles.headerBtn, { fontWeight: '700' }]}>Save</Text>
          </Pressable>
        </View>

        <View style={styles.pickerWrap}>
          <DateTimePicker
            value={pickerDate}
            mode="time"
            display="spinner"
            themeVariant="dark"
            onChange={(_, date) => {
              if (date) {
                setAlarm((a) => ({ ...a, hour: date.getHours(), minute: date.getMinutes() }));
              }
            }}
            style={{ alignSelf: 'center' }}
          />
        </View>

        <Text style={styles.sectionLabel}>Repeat</Text>
        <View style={styles.chipRow}>
          {WEEKDAY_SHORT.map((label, d) => {
            const selected = alarm.repeatDays.includes(d as Weekday);
            return (
              <Pressable
                key={label}
                onPress={() => toggleDay(d as Weekday)}
                style={[styles.dayChip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>Label</Text>
        <TextInput
          value={alarm.label}
          onChangeText={(t) => set('label', t)}
          placeholder="Morning workout"
          placeholderTextColor={colors.textDim}
          style={styles.input}
        />

        <Text style={styles.sectionLabel}>
          Snooze duration — {alarm.snoozeMinutes} min
        </Text>
        <View style={styles.sliderCard}>
          <Slider
            minimumValue={SNOOZE_MIN_MINUTES}
            maximumValue={SNOOZE_MAX_MINUTES}
            step={1}
            value={alarm.snoozeMinutes}
            onValueChange={(v: number) => set('snoozeMinutes', Math.round(v))}
            minimumTrackTintColor={colors.accent}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.accent}
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>{SNOOZE_MIN_MINUTES} min</Text>
            <Text style={styles.sliderLabel}>{SNOOZE_MAX_MINUTES} min</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Exercise to dismiss</Text>
        <View style={styles.chipRow}>
          {ALL_EXERCISES.map((ex: ExerciseType) => {
            const selected = alarm.exercise === ex;
            return (
              <Pressable
                key={ex}
                onPress={() => set('exercise', ex)}
                style={[styles.exChip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                  {EXERCISE_LABELS[ex]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>
          Reps required — {alarm.targetReps}
        </Text>
        <View style={styles.sliderCard}>
          <Slider
            minimumValue={REPS_MIN}
            maximumValue={REPS_MAX}
            step={1}
            value={alarm.targetReps}
            onValueChange={(v: number) => set('targetReps', Math.round(v))}
            minimumTrackTintColor={colors.accent}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.accent}
          />
          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>{REPS_MIN}</Text>
            <Text style={styles.sliderLabel}>{REPS_MAX}</Text>
          </View>
        </View>

        {!isNew && (
          <Pressable onPress={remove} style={styles.deleteBtn}>
            <Text style={styles.deleteText}>Delete Alarm</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 60 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '600' },
  headerBtn: { color: colors.accent, fontSize: 17 },
  pickerWrap: {
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.card,
    borderRadius: radii.card,
    marginVertical: 8,
  },
  sectionLabel: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 24,
    marginBottom: 10,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exChip: {
    paddingHorizontal: 16,
    height: 40,
    borderRadius: radii.chip,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textDim, fontSize: 14, fontWeight: '600' },
  chipTextSelected: { color: '#fff' },
  input: {
    backgroundColor: colors.card,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sliderCard: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  sliderLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  sliderLabel: { color: colors.textDim, fontSize: 12 },
  deleteBtn: {
    marginTop: 36,
    backgroundColor: colors.card,
    borderRadius: radii.button,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteText: { color: colors.danger, fontSize: 16, fontWeight: '600' },
});
