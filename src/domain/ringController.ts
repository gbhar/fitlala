/**
 * Orchestrates a ringing alarm: sound, snooze, dismiss.
 *
 * The ringing screen calls into this; state lives in the store so a killed +
 * relaunched app can resume ringing.
 */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import type { Alarm } from './types';
import { clampSnooze } from './types';
import * as store from './store';
import { cancelSnoozeNotifications, scheduleAlarm, scheduleSnooze } from './scheduler';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ALARM_SOUND = require('../../assets/sounds/alarm.wav');

let player: AudioPlayer | null = null;

async function startSound() {
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    interruptionMode: 'doNotMix',
  });
  if (!player) {
    player = createAudioPlayer(ALARM_SOUND);
    player.loop = true;
  }
  player.volume = 1;
  player.seekTo(0);
  player.play();
}

export function stopSound() {
  player?.pause();
}

/** Called when an alarm notification fires / is tapped. */
export async function beginRinging(alarm: Alarm): Promise<void> {
  const existing = store.getActive();
  if (existing?.alarmId === alarm.id) {
    // Snooze elapsed → ring again, keep count.
    await store.setActive({ ...existing, snoozedUntil: null });
  } else {
    await store.setActive({
      alarmId: alarm.id,
      firedAt: Date.now(),
      snoozedUntil: null,
      snoozeCount: 0,
    });
  }
  await startSound();
}

/** Snooze: silence now, ring again after the alarm's configured duration. */
export async function snooze(alarm: Alarm): Promise<Date> {
  stopSound();
  const minutes = clampSnooze(alarm.snoozeMinutes);
  const until = new Date(Date.now() + minutes * 60_000);
  const active = store.getActive();
  await store.setActive({
    alarmId: alarm.id,
    firedAt: active?.firedAt ?? Date.now(),
    snoozedUntil: until.getTime(),
    snoozeCount: (active?.snoozeCount ?? 0) + 1,
  });
  await scheduleSnooze(alarm, until);
  return until;
}

/**
 * Dismiss — only reachable after the exercise gate passes.
 * Clears active state, cancels pending snoozes, disables one-shot alarms,
 * and re-schedules repeating ones for their next occurrence.
 */
export async function dismiss(alarm: Alarm): Promise<void> {
  stopSound();
  await store.setActive(null);
  await cancelSnoozeNotifications(alarm.id);
  if (alarm.repeatDays.length === 0) {
    await store.upsertAlarm({ ...alarm, enabled: false });
    await scheduleAlarm({ ...alarm, enabled: false });
  } else {
    await scheduleAlarm(alarm); // weekly triggers persist; harmless refresh
  }
}

/** Resume ringing after app relaunch if an active alarm should be sounding. */
export async function resumeIfRinging(): Promise<string | null> {
  const active = store.getActive();
  if (!active) return null;
  const alarm = store.getAlarm(active.alarmId);
  if (!alarm) {
    await store.setActive(null);
    return null;
  }
  if (active.snoozedUntil === null || active.snoozedUntil <= Date.now()) {
    await beginRinging(alarm);
    return alarm.id;
  }
  return null; // still snoozed; notification will bring us back
}
