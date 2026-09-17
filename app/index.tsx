import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as store from '../src/domain/store';
import { scheduleAlarm } from '../src/domain/scheduler';
import {
  EXERCISE_LABELS,
  formatRepeatDays,
  formatTime,
  type Alarm,
} from '../src/domain/types';
import { colors, radii } from '../src/ui/theme';

function AlarmRow({ alarm }: { alarm: Alarm }) {
  const router = useRouter();
  const toggle = async (enabled: boolean) => {
    const updated = { ...alarm, enabled };
    await store.upsertAlarm(updated);
    await scheduleAlarm(updated);
  };
  return (
    <Pressable
      onPress={() => router.push(`/edit/${alarm.id}`)}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: colors.cardPressed }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.time, !alarm.enabled && styles.disabledText]}>
          {formatTime(alarm.hour, alarm.minute)}
        </Text>
        <Text style={styles.meta}>
          {alarm.label ? `${alarm.label} · ` : ''}
          {formatRepeatDays(alarm.repeatDays)}
        </Text>
        <Text style={styles.metaDim}>
          {alarm.targetReps} {EXERCISE_LABELS[alarm.exercise].toLowerCase()} to dismiss · snooze{' '}
          {alarm.snoozeMinutes} min
        </Text>
      </View>
      <Switch
        value={alarm.enabled}
        onValueChange={toggle}
        trackColor={{ true: colors.accent, false: colors.border }}
        thumbColor="#fff"
      />
    </Pressable>
  );
}

export default function AlarmList() {
  const router = useRouter();
  const { alarms } = store.useAlarms();
  const active = store.useActiveAlarm();
  const [now, setNow] = useState(() => Date.now());

  // Tick while snoozed so the banner countdown stays fresh.
  useEffect(() => {
    if (!active?.snoozedUntil) return;
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, [active?.snoozedUntil]);

  const snoozedAlarm = active?.snoozedUntil ? store.getAlarm(active.alarmId) : undefined;
  const snoozeMinsLeft = active?.snoozedUntil
    ? Math.max(0, Math.ceil((active.snoozedUntil - now) / 60_000))
    : 0;

  const sorted = [...alarms].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Alarms</Text>
        <Pressable
          onPress={() => router.push('/edit/new')}
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.addBtnText}>＋</Text>
        </Pressable>
      </View>

      {snoozedAlarm && (
        <Pressable style={styles.snoozeBanner} onPress={() => router.push(`/ring/${snoozedAlarm.id}`)}>
          <Text style={styles.snoozeBannerText}>
            😴 {snoozedAlarm.label || formatTime(snoozedAlarm.hour, snoozedAlarm.minute)} snoozed —
            rings again in {snoozeMinsLeft} min
          </Text>
        </Pressable>
      )}

      <FlatList
        data={sorted}
        keyExtractor={(a) => a.id}
        renderItem={({ item }) => <AlarmRow alarm={item} />}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No alarms yet</Text>
            <Text style={styles.emptyText}>
              Add one — you&apos;ll have to move your body to turn it off. 💪
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: { color: colors.text, fontSize: 34, fontWeight: '700' },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 24, lineHeight: 28, fontWeight: '600' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
  },
  time: { color: colors.text, fontSize: 32, fontWeight: '600', fontVariant: ['tabular-nums'] },
  disabledText: { color: colors.textDim },
  meta: { color: colors.text, fontSize: 14, marginTop: 4 },
  metaDim: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  snoozeBanner: {
    marginHorizontal: 16,
    marginBottom: 4,
    backgroundColor: colors.accentSoft,
    borderRadius: radii.card,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  snoozeBannerText: { color: colors.text, fontSize: 14 },
  empty: { alignItems: 'center', paddingTop: 120, gap: 8 },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: '600' },
  emptyText: { color: colors.textDim, fontSize: 15, textAlign: 'center', paddingHorizontal: 40 },
});
