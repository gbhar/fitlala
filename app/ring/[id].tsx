import { useKeepAwake } from 'expo-keep-awake';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as store from '../../src/domain/store';
import { dismiss, snooze, stopSound } from '../../src/domain/ringController';
import { EXERCISE_LABELS, formatTime } from '../../src/domain/types';
import { ExerciseCamera } from '../../src/exercise/ExerciseCamera';
import type { RepState } from '../../src/exercise/repCounter';
import { colors, radii } from '../../src/ui/theme';

type Mode = 'ringing' | 'exercising' | 'done';

export default function RingScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const alarm = store.getAlarm(id);
  const [mode, setMode] = useState<Mode>('ringing');
  const [reps, setReps] = useState(0);
  const [bodyVisible, setBodyVisible] = useState(false);
  const [snoozedUntil, setSnoozedUntil] = useState<Date | null>(null);

  useKeepAwake();

  // No backing out with the hardware back button while ringing.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => mode !== 'done');
    return () => sub.remove();
  }, [mode]);

  const onSnooze = useCallback(async () => {
    if (!alarm) return;
    const until = await snooze(alarm);
    setSnoozedUntil(until);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setTimeout(() => router.dismissTo('/'), 1200);
  }, [alarm, router]);

  const onStartExercise = useCallback(() => {
    // Sound keeps ringing during exercise — that's the motivation.
    setMode('exercising');
  }, []);

  const onRepsChanged = useCallback((r: number, state: RepState) => {
    setReps(r);
    setBodyVisible(state.bodyVisible);
    if (r > 0) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }, []);

  const onCompleted = useCallback(async () => {
    if (!alarm) return;
    setMode('done');
    stopSound();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await dismiss(alarm);
    setTimeout(() => router.dismissTo('/'), 2000);
  }, [alarm, router]);

  if (!alarm) {
    // Alarm was deleted; nothing to ring.
    stopSound();
    router.dismissTo('/');
    return null;
  }

  if (mode === 'done') {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.doneEmoji}>🎉</Text>
          <Text style={styles.doneTitle}>Good morning!</Text>
          <Text style={styles.doneSub}>
            {alarm.targetReps} {EXERCISE_LABELS[alarm.exercise].toLowerCase()} done. Alarm off.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (snoozedUntil) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <Text style={styles.doneEmoji}>😴</Text>
          <Text style={styles.doneTitle}>Snoozed</Text>
          <Text style={styles.doneSub}>
            Ringing again at{' '}
            {formatTime(snoozedUntil.getHours(), snoozedUntil.getMinutes())}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (mode === 'exercising') {
    const remaining = Math.max(0, alarm.targetReps - reps);
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.exerciseHeader}>
          <Text style={styles.exerciseTitle}>{EXERCISE_LABELS[alarm.exercise]}</Text>
          <Text style={styles.repCount}>
            {reps}
            <Text style={styles.repTotal}> / {alarm.targetReps}</Text>
          </Text>
          <Text style={styles.hint}>
            {bodyVisible
              ? remaining > 0
                ? `${remaining} to go — keep moving!`
                : 'Done!'
              : 'Step back so your whole body is in frame'}
          </Text>
        </View>
        <View style={styles.cameraWrap}>
          <ExerciseCamera
            exercise={alarm.exercise}
            targetReps={alarm.targetReps}
            onRepsChanged={onRepsChanged}
            onCompleted={onCompleted}
          />
        </View>
        <Pressable onPress={() => setMode('ringing')} style={styles.backLink} hitSlop={8}>
          <Text style={styles.backLinkText}>← Back (alarm keeps ringing)</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // ringing
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.center}>
        <Text style={styles.ringTime}>{formatTime(alarm.hour, alarm.minute)}</Text>
        {!!alarm.label && <Text style={styles.ringLabel}>{alarm.label}</Text>}
        <Text style={styles.ringEmoji}>⏰</Text>
      </View>
      <View style={styles.actions}>
        <Pressable onPress={onStartExercise} style={[styles.bigBtn, styles.dismissBtn]}>
          <Text style={styles.bigBtnText}>
            Do {alarm.targetReps} {EXERCISE_LABELS[alarm.exercise].toLowerCase()} to turn off
          </Text>
        </Pressable>
        <Pressable onPress={onSnooze} style={[styles.bigBtn, styles.snoozeBtn]}>
          <Text style={[styles.bigBtnText, { color: colors.text }]}>
            Snooze {alarm.snoozeMinutes} min
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  ringTime: { color: colors.text, fontSize: 72, fontWeight: '700', fontVariant: ['tabular-nums'] },
  ringLabel: { color: colors.textDim, fontSize: 20 },
  ringEmoji: { fontSize: 64, marginTop: 12 },
  actions: { padding: 24, gap: 14 },
  bigBtn: {
    borderRadius: radii.card,
    paddingVertical: 20,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  dismissBtn: { backgroundColor: colors.accent },
  snoozeBtn: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  bigBtnText: { color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  exerciseHeader: { alignItems: 'center', paddingTop: 12, paddingBottom: 16, gap: 4 },
  exerciseTitle: { color: colors.textDim, fontSize: 16, fontWeight: '600' },
  repCount: { color: colors.text, fontSize: 64, fontWeight: '800', fontVariant: ['tabular-nums'] },
  repTotal: { color: colors.textDim, fontSize: 32, fontWeight: '600' },
  hint: { color: colors.warning, fontSize: 15, textAlign: 'center', paddingHorizontal: 24 },
  cameraWrap: { flex: 1, marginHorizontal: 16, marginBottom: 8 },
  backLink: { alignItems: 'center', paddingVertical: 14 },
  backLinkText: { color: colors.textDim, fontSize: 14 },
  doneEmoji: { fontSize: 72 },
  doneTitle: { color: colors.text, fontSize: 32, fontWeight: '700' },
  doneSub: { color: colors.textDim, fontSize: 17, textAlign: 'center', paddingHorizontal: 32 },
});
