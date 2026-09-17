/**
 * Core domain types for the exercise-gated alarm.
 */

export type ExerciseType = 'squat' | 'jumping_jack' | 'pushup' | 'arm_raise';

export const EXERCISE_LABELS: Record<ExerciseType, string> = {
  squat: 'Squats',
  jumping_jack: 'Jumping Jacks',
  pushup: 'Push-ups',
  arm_raise: 'Arm Raises',
};

export const ALL_EXERCISES: ExerciseType[] = [
  'squat',
  'jumping_jack',
  'pushup',
  'arm_raise',
];

/** Snooze duration limits, in minutes (user picks within this range). */
export const SNOOZE_MIN_MINUTES = 5;
export const SNOOZE_MAX_MINUTES = 30;

/** Rep count limits the user can configure per alarm. */
export const REPS_MIN = 3;
export const REPS_MAX = 50;

/** Days of week: 0 = Sunday … 6 = Saturday (matches JS Date.getDay()). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Alarm {
  id: string;
  /** 24h clock. */
  hour: number;
  minute: number;
  /** Empty array = one-shot alarm (fires once at the next occurrence). */
  repeatDays: Weekday[];
  enabled: boolean;
  label: string;
  /** Snooze duration in minutes, clamped to [SNOOZE_MIN_MINUTES, SNOOZE_MAX_MINUTES]. */
  snoozeMinutes: number;
  /** Which exercise dismisses this alarm. */
  exercise: ExerciseType;
  /** How many reps the user must complete to dismiss. */
  targetReps: number;
}

/** Runtime state while an alarm is ringing/snoozed. Persisted so a relaunch resumes it. */
export interface ActiveAlarmState {
  alarmId: string;
  /** epoch ms when the alarm originally fired */
  firedAt: number;
  /** epoch ms when current snooze ends, or null if ringing now */
  snoozedUntil: number | null;
  snoozeCount: number;
}

export function makeDefaultAlarm(id: string): Alarm {
  return {
    id,
    hour: 7,
    minute: 0,
    repeatDays: [],
    enabled: true,
    label: '',
    snoozeMinutes: 10,
    exercise: 'squat',
    targetReps: 10,
  };
}

export function clampSnooze(minutes: number): number {
  return Math.min(SNOOZE_MAX_MINUTES, Math.max(SNOOZE_MIN_MINUTES, Math.round(minutes)));
}

export function clampReps(reps: number): number {
  return Math.min(REPS_MAX, Math.max(REPS_MIN, Math.round(reps)));
}

/** Next Date (strictly in the future) at which this alarm should fire. Returns null if disabled. */
export function nextFireDate(alarm: Alarm, from: Date = new Date()): Date | null {
  if (!alarm.enabled) return null;
  const candidate = new Date(from);
  candidate.setHours(alarm.hour, alarm.minute, 0, 0);

  if (alarm.repeatDays.length === 0) {
    if (candidate <= from) candidate.setDate(candidate.getDate() + 1);
    return candidate;
  }

  for (let offset = 0; offset < 8; offset++) {
    const d = new Date(from);
    d.setDate(d.getDate() + offset);
    d.setHours(alarm.hour, alarm.minute, 0, 0);
    if (d > from && alarm.repeatDays.includes(d.getDay() as Weekday)) {
      return d;
    }
  }
  return null;
}

export function formatTime(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h12}:${minute.toString().padStart(2, '0')} ${ampm}`;
}

export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function formatRepeatDays(days: Weekday[]): string {
  if (days.length === 0) return 'Once';
  if (days.length === 7) return 'Every day';
  const sorted = [...days].sort((a, b) => a - b);
  if (sorted.join(',') === '1,2,3,4,5') return 'Weekdays';
  if (sorted.join(',') === '0,6') return 'Weekends';
  return sorted.map((d) => WEEKDAY_SHORT[d]).join(' ');
}
