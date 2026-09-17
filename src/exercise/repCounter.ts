/**
 * Per-exercise rep counting state machines.
 *
 * All exercises reduce to a two-phase (open/closed) cycle with hysteresis:
 * distinct enter/exit thresholds so jitter at the boundary can't double-count,
 * plus an N-consecutive-frames debounce.
 *
 * Coordinates: image space, y grows DOWNWARD, values normalized [0,1].
 * Worklet-safe: plain data + pure functions only.
 */
import type { ExerciseType } from '../domain/types';
import { angleDeg, dist, KP, kpOk, type Pose } from './pose';

export type Phase = 'open' | 'closed' | 'unknown';

export interface RepState {
  phase: Phase;
  candidate: Phase;
  candidateFrames: number;
  reps: number;
  /** true when required keypoints were visible last frame (for UI hints) */
  bodyVisible: boolean;
}

export function initialRepState(): RepState {
  'worklet';
  return { phase: 'unknown', candidate: 'unknown', candidateFrames: 0, reps: 0, bodyVisible: false };
}

/** Frames a phase must hold before it is accepted (~100-200ms at 15-30fps). */
const CONFIRM_FRAMES = 3;

// ---- per-exercise phase classifiers ----
// Return 'open' (extended / standing / arms up), 'closed' (contracted / down),
// or 'unknown' (between thresholds, or keypoints not visible).

function classifySquat(pose: Pose): Phase {
  'worklet';
  const leftOk = kpOk(pose, KP.leftHip, KP.leftKnee, KP.leftAnkle);
  const rightOk = kpOk(pose, KP.rightHip, KP.rightKnee, KP.rightAnkle);
  if (!leftOk && !rightOk) return 'unknown';
  let angle: number;
  if (leftOk && rightOk) {
    angle =
      (angleDeg(pose, KP.leftHip, KP.leftKnee, KP.leftAnkle) +
        angleDeg(pose, KP.rightHip, KP.rightKnee, KP.rightAnkle)) /
      2;
  } else if (leftOk) {
    angle = angleDeg(pose, KP.leftHip, KP.leftKnee, KP.leftAnkle);
  } else {
    angle = angleDeg(pose, KP.rightHip, KP.rightKnee, KP.rightAnkle);
  }
  if (angle > 155) return 'open'; // standing
  if (angle < 115) return 'closed'; // squatting
  return 'unknown';
}

function classifyJumpingJack(pose: Pose): Phase {
  'worklet';
  if (
    !kpOk(
      pose,
      KP.leftShoulder,
      KP.rightShoulder,
      KP.leftWrist,
      KP.rightWrist,
      KP.leftAnkle,
      KP.rightAnkle,
    )
  ) {
    return 'unknown';
  }
  const shoulderW = dist(pose, KP.leftShoulder, KP.rightShoulder);
  if (shoulderW < 0.02) return 'unknown';
  const ankleSpread = dist(pose, KP.leftAnkle, KP.rightAnkle) / shoulderW;
  const shoulderY = (pose[KP.leftShoulder].y + pose[KP.rightShoulder].y) / 2;
  const armsUp =
    pose[KP.leftWrist].y < shoulderY - shoulderW * 0.5 &&
    pose[KP.rightWrist].y < shoulderY - shoulderW * 0.5;
  const armsDown =
    pose[KP.leftWrist].y > shoulderY + shoulderW * 0.5 &&
    pose[KP.rightWrist].y > shoulderY + shoulderW * 0.5;
  if (armsUp && ankleSpread > 1.6) return 'open';
  if (armsDown && ankleSpread < 1.2) return 'closed';
  return 'unknown';
}

function classifyPushup(pose: Pose): Phase {
  'worklet';
  const leftOk = kpOk(pose, KP.leftShoulder, KP.leftElbow, KP.leftWrist);
  const rightOk = kpOk(pose, KP.rightShoulder, KP.rightElbow, KP.rightWrist);
  if (!leftOk && !rightOk) return 'unknown';
  let angle: number;
  if (leftOk && rightOk) {
    angle =
      (angleDeg(pose, KP.leftShoulder, KP.leftElbow, KP.leftWrist) +
        angleDeg(pose, KP.rightShoulder, KP.rightElbow, KP.rightWrist)) /
      2;
  } else if (leftOk) {
    angle = angleDeg(pose, KP.leftShoulder, KP.leftElbow, KP.leftWrist);
  } else {
    angle = angleDeg(pose, KP.rightShoulder, KP.rightElbow, KP.rightWrist);
  }
  if (angle > 150) return 'open'; // arms extended
  if (angle < 100) return 'closed'; // chest lowered
  return 'unknown';
}

function classifyArmRaise(pose: Pose): Phase {
  'worklet';
  if (!kpOk(pose, KP.nose, KP.leftShoulder, KP.rightShoulder, KP.leftWrist, KP.rightWrist)) {
    return 'unknown';
  }
  const noseY = pose[KP.nose].y;
  const shoulderY = (pose[KP.leftShoulder].y + pose[KP.rightShoulder].y) / 2;
  const up = pose[KP.leftWrist].y < noseY && pose[KP.rightWrist].y < noseY;
  const down = pose[KP.leftWrist].y > shoulderY && pose[KP.rightWrist].y > shoulderY;
  if (up) return 'open';
  if (down) return 'closed';
  return 'unknown';
}

export function classify(pose: Pose, exercise: ExerciseType): Phase {
  'worklet';
  if (exercise === 'squat') return classifySquat(pose);
  if (exercise === 'jumping_jack') return classifyJumpingJack(pose);
  if (exercise === 'pushup') return classifyPushup(pose);
  return classifyArmRaise(pose);
}

/**
 * Advance the state machine one frame. Returns the new state (fresh object).
 *
 * A rep is counted on the closed→open transition, but only after at least one
 * full open→closed excursion (so standing still at "open" counts nothing).
 */
export function stepRepCounter(state: RepState, pose: Pose, exercise: ExerciseType): RepState {
  'worklet';
  const raw = classify(pose, exercise);
  const bodyVisible = raw !== 'unknown' || state.bodyVisible;

  if (raw === 'unknown') {
    // Keep current confirmed phase; decay the candidate.
    return { ...state, candidateFrames: Math.max(0, state.candidateFrames - 1), bodyVisible: false };
  }

  let { candidate, candidateFrames, phase, reps } = state;

  if (raw === candidate) {
    candidateFrames += 1;
  } else {
    candidate = raw;
    candidateFrames = 1;
  }

  if (candidateFrames >= CONFIRM_FRAMES && candidate !== phase) {
    // Confirmed phase transition.
    if (phase === 'closed' && candidate === 'open') {
      reps += 1; // completed a full rep: was down, now back up
    }
    phase = candidate;
  }

  return { phase, candidate, candidateFrames, reps, bodyVisible };
}
