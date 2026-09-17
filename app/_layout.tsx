import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as store from '../src/domain/store';
import {
  configureNotificationHandler,
  ensurePermissionsAndChannel,
  rescheduleAll,
} from '../src/domain/scheduler';
import { beginRinging, resumeIfRinging } from '../src/domain/ringController';
import { colors } from '../src/ui/theme';

configureNotificationHandler();

export default function RootLayout() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      await store.hydrate();
      await ensurePermissionsAndChannel();
      await rescheduleAll(store.getAlarms());

      // If we were killed mid-ring or a snooze expired while dead, resume.
      const ringingId = await resumeIfRinging();
      setReady(true);
      if (ringingId) {
        router.push(`/ring/${ringingId}`);
        return;
      }

      // Cold-start from tapping an alarm notification.
      const last = await Notifications.getLastNotificationResponseAsync();
      const alarmId = (last?.notification.request.content.data as { alarmId?: string } | null)
        ?.alarmId;
      if (alarmId && store.getAlarm(alarmId)) {
        const alarm = store.getAlarm(alarmId)!;
        await beginRinging(alarm);
        router.push(`/ring/${alarmId}`);
      }
    })();
  }, [router]);

  useEffect(() => {
    // Alarm fires while app is foregrounded/backgrounded-but-alive.
    const recv = Notifications.addNotificationReceivedListener(async (notification) => {
      const alarmId = (notification.request.content.data as { alarmId?: string } | null)?.alarmId;
      const alarm = alarmId ? store.getAlarm(alarmId) : undefined;
      if (alarm) {
        await beginRinging(alarm);
        router.push(`/ring/${alarm.id}`);
      }
    });
    // User taps the notification.
    const resp = Notifications.addNotificationResponseReceivedListener(async (response) => {
      const alarmId = (response.notification.request.content.data as { alarmId?: string } | null)
        ?.alarmId;
      const alarm = alarmId ? store.getAlarm(alarmId) : undefined;
      if (alarm) {
        await beginRinging(alarm);
        router.push(`/ring/${alarm.id}`);
      }
    });
    return () => {
      recv.remove();
      resp.remove();
    };
  }, [router]);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="edit/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="ring/[id]" options={{ gestureEnabled: false }} />
      </Stack>
    </GestureHandlerRootView>
  );
}
