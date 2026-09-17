/**
 * Camera + MoveNet pose pipeline.
 *
 * Frame flow (camera thread worklet):
 *   Frame (rgb, ~192px) → resample to 192×192×3 uint8 → MoveNet → 17 keypoints
 *   → scheduleOnRN(onPose) → React side steps the rep counter.
 *
 * Keeping the rep state machine on the React side keeps all mutable state in
 * one runtime; the worklet stays stateless.
 */
import { NitroModules } from 'react-native-nitro-modules';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  NativePreviewView,
  useCamera,
  useCameraPermission,
  useFrameOutput,
  usePreviewOutput,
  type Frame,
} from 'react-native-vision-camera';
import { useTensorflowModel, type TensorflowModel } from 'react-native-fast-tflite';
import { scheduleOnRN } from 'react-native-worklets';
import type { ExerciseType } from '../domain/types';
import { decodePose, type Pose } from './pose';
import { initialRepState, stepRepCounter, type RepState } from './repCounter';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MODEL = require('../../assets/models/movenet_lightning_int8.tflite');

const INPUT_SIZE = 192;

export interface ExerciseCameraProps {
  exercise: ExerciseType;
  targetReps: number;
  onRepsChanged: (reps: number, state: RepState) => void;
  onCompleted: () => void;
}

/**
 * Worklet: resample an RGB/RGBA/BGRA frame into a 192×192×3 uint8 tensor
 * (nearest neighbor, center-cropped square) and run MoveNet.
 */
function runPoseInference(frame: Frame, model: TensorflowModel, inputIsFloat: boolean): Pose | null {
  'worklet';
  const width = frame.width;
  const height = frame.height;
  if (width <= 0 || height <= 0) return null;

  const pixels = new Uint8Array(frame.getPixelBuffer());
  const bytesPerRow = frame.bytesPerRow;
  const channels = Math.floor(bytesPerRow / width); // 3 (rgb) or 4 (rgba/bgra)
  if (channels < 3) return null; // planar/yuv — not our negotiated format
  const bgra = frame.pixelFormat === 'rgb-bgra-8-bit';

  // Center-crop the largest square, then nearest-neighbor sample to 192×192.
  const square = Math.min(width, height);
  const offX = (width - square) >> 1;
  const offY = (height - square) >> 1;

  const input = inputIsFloat
    ? new Float32Array(INPUT_SIZE * INPUT_SIZE * 3)
    : new Uint8Array(INPUT_SIZE * INPUT_SIZE * 3);
  let di = 0;
  for (let y = 0; y < INPUT_SIZE; y++) {
    const sy = offY + Math.floor((y * square) / INPUT_SIZE);
    const rowBase = sy * bytesPerRow;
    for (let x = 0; x < INPUT_SIZE; x++) {
      const sx = offX + Math.floor((x * square) / INPUT_SIZE);
      const p = rowBase + sx * channels;
      const r = bgra ? pixels[p + 2] : pixels[p];
      const g = pixels[p + 1];
      const b = bgra ? pixels[p] : pixels[p + 2];
      if (inputIsFloat) {
        input[di++] = r / 255;
        input[di++] = g / 255;
        input[di++] = b / 255;
      } else {
        input[di++] = r;
        input[di++] = g;
        input[di++] = b;
      }
    }
  }

  const outputs = model.runSync([input.buffer as ArrayBuffer]);
  const out = new Float32Array(outputs[0]);
  if (out.length < 51) return null;
  return decodePose(out);
}

export function ExerciseCamera({
  exercise,
  targetReps,
  onRepsChanged,
  onCompleted,
}: ExerciseCameraProps) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const [permissionAsked, setPermissionAsked] = useState(false);

  useEffect(() => {
    if (!hasPermission) {
      requestPermission().finally(() => setPermissionAsked(true));
    }
  }, [hasPermission, requestPermission]);

  const tflite = useTensorflowModel(MODEL, []);
  const model = tflite.state === 'loaded' ? tflite.model : undefined;

  // Rep counting on the React side.
  const repStateRef = useRef<RepState>(initialRepState());
  const completedRef = useRef(false);
  const onPose = useCallback(
    (pose: Pose) => {
      if (completedRef.current) return;
      const prev = repStateRef.current;
      const next = stepRepCounter(prev, pose, exercise);
      repStateRef.current = next;
      if (next.reps !== prev.reps || next.bodyVisible !== prev.bodyVisible) {
        onRepsChanged(next.reps, next);
      }
      if (next.reps >= targetReps) {
        completedRef.current = true;
        onCompleted();
      }
    },
    [exercise, targetReps, onRepsChanged, onCompleted],
  );

  // Reset the counter when the exercise changes.
  useEffect(() => {
    repStateRef.current = initialRepState();
    completedRef.current = false;
  }, [exercise, targetReps]);

  // Box the nitro model so the camera-thread worklet can unbox it there.
  const boxedModel = useMemo(() => (model ? NitroModules.box(model) : undefined), [model]);
  const inputIsFloat = model?.inputs[0]?.dataType === 'float32';

  const preview = usePreviewOutput();
  const frameOutput = useFrameOutput({
    targetResolution: { width: 256, height: 256 },
    pixelFormat: 'rgb',
    dropFramesWhileBusy: true,
    onFrame: useCallback(
      (frame: Frame) => {
        'worklet';
        try {
          if (boxedModel != null) {
            const m = boxedModel.unbox();
            const pose = runPoseInference(frame, m, inputIsFloat);
            if (pose != null) {
              scheduleOnRN(onPose, pose);
            }
          }
        } finally {
          frame.dispose();
        }
      },
      [boxedModel, inputIsFloat, onPose],
    ),
  });

  useCamera({
    isActive: true,
    device: 'front',
    outputs: [preview, frameOutput],
    onError: (e) => console.warn('Camera error', e),
  });

  if (!hasPermission) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}>
          {permissionAsked
            ? 'Camera permission is required to verify your exercise. Enable it in Settings.'
            : 'Requesting camera permission…'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <NativePreviewView previewOutput={preview} resizeMode="cover" style={styles.preview} />
      {tflite.state === 'loading' && (
        <View style={styles.overlay}>
          <Text style={styles.fallbackText}>Loading pose model…</Text>
        </View>
      )}
      {tflite.state === 'error' && (
        <View style={styles.overlay}>
          <Text style={styles.fallbackText}>Pose model failed to load: {String(tflite.error)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', borderRadius: 24 },
  preview: { flex: 1 },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#111',
    borderRadius: 24,
  },
  fallbackText: { color: '#fff', textAlign: 'center', fontSize: 16 },
});
