/**
 * Notification-based alarm scheduling.
 *
 * Android: high-importance channel with sound + lockscreen visibility.
 * iOS: time-sensitive local notifications (30s max sound — platform limit).
 *
 * Every scheduled notification carries { alarmId } in its data payload so the
 * app can route to the ringing screen when the user taps it / it fires.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Alarm, Weekday } from './types';
import { nextFireDate } from './types';

export const ALARM_CHANNEL_ID = 'alarm-v1';
export const ALARM_CATEGORY = 'alarm';

/** Notifications fired while the app is foregrounded still show + play sound. */
export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export async function ensurePermissionsAndChannel(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ALARM_CHANNEL_ID, {
      name: 'Alarms',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'alarm.wav',
      vibrationPattern: [0, 500, 500, 500, 500, 500],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
      enableVibrate: true,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
    });
  }

  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  const req = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowSound: true,
      allowBadge: false,
    },
  });
  return req.granted;
}

function contentFor(alarm: Alarm): Notifications.NotificationContentInput {
  return {
    title: alarm.label || 'Alarm',
    body: `Wake up! Complete ${alarm.targetReps} ${alarm.exercise.replace('_', ' ')}s to turn me off.`,
    sound: 'alarm.wav',
    priority: Notifications.AndroidNotificationPriority.MAX,
    categoryIdentifier: ALARM_CATEGORY,
    interruptionLevel: 'timeSensitive',
    data: { alarmId: alarm.id, kind: 'alarm' },
  };
}

/** Cancel every scheduled notification belonging to this alarm id. */
export async function cancelAlarmNotifications(alarmId: string): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => (n.content.data as { alarmId?: string } | null)?.alarmId === alarmId)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/**
 * (Re)schedule notifications for one alarm.
 * Repeating alarms use weekly triggers (one per selected weekday);
 * one-shot alarms use a single date trigger.
 */
export async function scheduleAlarm(alarm: Alarm): Promise<void> {
  await cancelAlarmNotifications(alarm.id);
  if (!alarm.enabled) return;

  const content = contentFor(alarm);

  if (alarm.repeatDays.length === 0) {
    const fireDate = nextFireDate(alarm);
    if (!fireDate) return;
    await Notifications.scheduleNotificationAsync({
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireDate,
        channelId: ALARM_CHANNEL_ID,
      },
    });
    return;
  }

  await Promise.all(
    alarm.repeatDays.map((day: Weekday) =>
      Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          // expo-notifications weekday: 1 = Sunday … 7 = Saturday
          weekday: day + 1,
          hour: alarm.hour,
          minute: alarm.minute,
          channelId: ALARM_CHANNEL_ID,
        },
      }),
    ),
  );
}

/** Schedule the snooze follow-up notification. */
export async function scheduleSnooze(alarm: Alarm, snoozedUntil: Date): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      ...contentFor(alarm),
      title: `${alarm.label || 'Alarm'} (snoozed)`,
      data: { alarmId: alarm.id, kind: 'snooze' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: snoozedUntil,
      channelId: ALARM_CHANNEL_ID,
    },
  });
}

/** Cancel only snooze notifications for an alarm (used on dismiss). */
export async function cancelSnoozeNotifications(alarmId: string): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => {
        const d = n.content.data as { alarmId?: string; kind?: string } | null;
        return d?.alarmId === alarmId && d?.kind === 'snooze';
      })
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/** Re-sync all schedules (call on app start after hydration). */
export async function rescheduleAll(alarms: Alarm[]): Promise<void> {
  for (const alarm of alarms) {
    await scheduleAlarm(alarm);
  }
}
