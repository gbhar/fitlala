# WakeFit Alarm ⏰💪

An alarm clock for Android and iOS that you can snooze (5–30 min, user-configurable) —
but to **turn it off**, you must turn on the camera and complete a configurable number
of body exercises. On-device AI (MoveNet pose estimation) counts your reps; nothing is
ever uploaded.

## Features

- **Alarms**: time, repeat days (or one-shot), label, per-alarm settings
- **Snooze**: 5–30 minutes, chosen per alarm with a slider
- **Exercise gate**: squats, jumping jacks, push-ups, or arm raises — 3–50 reps,
  user-configurable. The alarm keeps ringing until the reps are done.
- **Rep counting**: MoveNet SinglePose Lightning (int8 TFLite, bundled, ~3 MB) runs on
  the camera stream at full frame rate via VisionCamera frame worklets. A hysteresis
  state machine (distinct up/down thresholds + 3-frame debounce) prevents cheating by
  jiggling the phone.
- **Reliability**: Android uses a MAX-importance notification channel with alarm audio
  attributes, DND bypass, exact-alarm + full-screen-intent permissions, and the app
  shows over the lock screen. iOS uses time-sensitive local notifications (platform
  limitation: ~30 s of sound if the app isn't opened — see below).

## Tech stack

- Expo SDK 57 / React Native 0.86 / TypeScript, expo-router
- react-native-vision-camera v5 (Nitro) + react-native-fast-tflite v3 + react-native-worklets
- expo-notifications for scheduling, expo-audio for the looping ring

## Project layout

```
app/                  # expo-router screens
  _layout.tsx         # boot: hydrate store, notification listeners, resume ringing
  index.tsx           # alarm list
  edit/[id].tsx       # alarm editor (id = 'new' to create)
  ring/[id].tsx       # ringing screen → exercise mode → dismissed
src/domain/           # types, AsyncStorage store, notification scheduling, ring controller
src/exercise/         # pose decoding, rep-counting state machines, camera component
plugins/              # config plugin: showWhenLocked/turnScreenOn on MainActivity
assets/models/        # movenet_lightning_int8.tflite (192×192 input, 17 keypoints)
assets/sounds/        # alarm.wav (generated, 25 s beep pattern)
```

## Running it

This app uses native modules — it **cannot run in Expo Go**. You need a dev build,
and the camera requires a **real device**.

### Android (needs Android Studio / SDK installed)

```bash
npm install
npx expo run:android          # builds + installs on connected device
```

### iOS (needs full Xcode, real iPhone)

```bash
npm install
npx expo run:ios --device
```

### No local SDKs? Use EAS cloud builds

```bash
npm i -g eas-cli
eas build --profile development --platform android   # or ios
```

Then install the build on your phone and start the dev server with `npx expo start`.

## Testing the logic

Rep-counter state machines are pure functions — a synthetic-pose test exists and
passes for all four exercises (3 squats / 5 arm raises / 4 jumping jacks / 3 push-ups
counted exactly; 200 frames of stand-still jitter counts 0).

## Known platform limitations (v1)

- **iOS background alarm**: if the app is not open, iOS only plays the notification
  sound (max 30 s) and can be silenced by Focus/silent switch. Opening the app (or
  tapping the notification) starts the full looping alarm. A Critical Alerts
  entitlement or a background-audio keep-alive would strengthen this — deliberately
  deferred from v1.
- **Android 14+**: `SCHEDULE_EXACT_ALARM` may require the user to grant "Alarms &
  reminders" in system settings for exact timing.
- **Push-up detection** is the least reliable of the four (phone angle usually cuts
  off part of the body). Squats and arm raises are the most robust.
- Notification-channel settings (sound) are fixed at first launch on Android;
  reinstall the app if you change `alarm.wav`.

## Tuning exercise detection

Thresholds live in `src/exercise/repCounter.ts` (per-exercise classify functions)
and `src/exercise/pose.ts` (`MIN_KP_SCORE`). If reps over- or under-count on your
device, adjust the angle/spread thresholds there — the hysteresis pattern (enter
threshold ≠ exit threshold) should be preserved.
