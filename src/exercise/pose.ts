/**
 * Pose types + MoveNet output decoding.
 *
 * MoveNet SinglePose returns [1, 1, 17, 3] float32: (y, x, score) per keypoint,
 * y/x normalized to [0, 1] in input-image coordinates.
 *
 * Everything here is worklet-safe (pure math, no closures over JS objects).
 */

export const KP = {
  nose: 0,
  leftEye: 1,
  rightEye: 2,
  leftEar: 3,
  rightEar: 4,
  leftShoulder: 5,
  rightShoulder: 6,
  leftElbow: 7,
  rightElbow: 8,
  leftWrist: 9,
  rightWrist: 10,
  leftHip: 11,
  rightHip: 12,
  leftKnee: 13,
  rightKnee: 14,
  leftAnkle: 15,
  rightAnkle: 16,
} as const;

export interface Keypoint {
  x: number; // normalized [0,1]
  y: number; // normalized [0,1]
  score: number;
}

export type Pose = Keypoint[]; // length 17

export const MIN_KP_SCORE = 0.3;

/** Decode raw MoveNet output (Float32Array of 51 values) into a Pose. */
export function decodePose(out: Float32Array): Pose {
  'worklet';
  const pose: Pose = [];
  for (let i = 0; i < 17; i++) {
    pose.push({
      y: out[i * 3],
      x: out[i * 3 + 1],
      score: out[i * 3 + 2],
    });
  }
  return pose;
}

export function kpOk(pose: Pose, ...indices: number[]): boolean {
  'worklet';
  for (const i of indices) {
    if (pose[i].score < MIN_KP_SCORE) return false;
  }
  return true;
}

/** Interior angle at joint b (degrees) formed by segments b→a and b→c. */
export function angleDeg(pose: Pose, a: number, b: number, c: number): number {
  'worklet';
  const abx = pose[a].x - pose[b].x;
  const aby = pose[a].y - pose[b].y;
  const cbx = pose[c].x - pose[b].x;
  const cby = pose[c].y - pose[b].y;
  const dot = abx * cbx + aby * cby;
  const magAb = Math.sqrt(abx * abx + aby * aby);
  const magCb = Math.sqrt(cbx * cbx + cby * cby);
  if (magAb === 0 || magCb === 0) return 180;
  const cos = Math.min(1, Math.max(-1, dot / (magAb * magCb)));
  return (Math.acos(cos) * 180) / Math.PI;
}

export function mid(pose: Pose, a: number, b: number): { x: number; y: number } {
  'worklet';
  return { x: (pose[a].x + pose[b].x) / 2, y: (pose[a].y + pose[b].y) / 2 };
}

export function dist(pose: Pose, a: number, b: number): number {
  'worklet';
  const dx = pose[a].x - pose[b].x;
  const dy = pose[a].y - pose[b].y;
  return Math.sqrt(dx * dx + dy * dy);
}
