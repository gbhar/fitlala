/**
 * Alarm persistence + reactive store.
 *
 * Simple observable store backed by AsyncStorage — no external state library.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import type { ActiveAlarmState, Alarm } from './types';

const ALARMS_KEY = '@alarms/v1';
const ACTIVE_KEY = '@alarms/active/v1';

type Listener = () => void;

interface StoreState {
  alarms: Alarm[];
  active: ActiveAlarmState | null;
  hydrated: boolean;
}

let state: StoreState = { alarms: [], active: null, hydrated: false };
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

function setState(partial: Partial<StoreState>) {
  state = { ...state, ...partial };
  emit();
}

export async function hydrate(): Promise<void> {
  try {
    const [alarmsRaw, activeRaw] = await Promise.all([
      AsyncStorage.getItem(ALARMS_KEY),
      AsyncStorage.getItem(ACTIVE_KEY),
    ]);
    setState({
      alarms: alarmsRaw ? (JSON.parse(alarmsRaw) as Alarm[]) : [],
      active: activeRaw ? (JSON.parse(activeRaw) as ActiveAlarmState) : null,
      hydrated: true,
    });
  } catch (e) {
    console.warn('Failed to hydrate alarm store', e);
    setState({ hydrated: true });
  }
}

async function persistAlarms() {
  await AsyncStorage.setItem(ALARMS_KEY, JSON.stringify(state.alarms));
}

async function persistActive() {
  if (state.active) {
    await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify(state.active));
  } else {
    await AsyncStorage.removeItem(ACTIVE_KEY);
  }
}

export function getAlarms(): Alarm[] {
  return state.alarms;
}

export function getAlarm(id: string): Alarm | undefined {
  return state.alarms.find((a) => a.id === id);
}

export function getActive(): ActiveAlarmState | null {
  return state.active;
}

export async function upsertAlarm(alarm: Alarm): Promise<void> {
  const idx = state.alarms.findIndex((a) => a.id === alarm.id);
  const alarms =
    idx >= 0
      ? state.alarms.map((a) => (a.id === alarm.id ? alarm : a))
      : [...state.alarms, alarm];
  setState({ alarms });
  await persistAlarms();
}

export async function deleteAlarm(id: string): Promise<void> {
  setState({ alarms: state.alarms.filter((a) => a.id !== id) });
  await persistAlarms();
}

export async function setActive(active: ActiveAlarmState | null): Promise<void> {
  setState({ active });
  await persistActive();
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ---- React hooks ----

export function useAlarms(): { alarms: Alarm[]; hydrated: boolean } {
  const snap = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
  return { alarms: snap.alarms, hydrated: snap.hydrated };
}

export function useActiveAlarm(): ActiveAlarmState | null {
  return useSyncExternalStore(
    subscribe,
    () => state.active,
    () => state.active,
  );
}

export function newAlarmId(): string {
  return `alarm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
