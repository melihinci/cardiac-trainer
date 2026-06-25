import AsyncStorage from "@react-native-async-storage/async-storage";

import type { RecordingSession } from "../types/recording";

const RECORDINGS_STORAGE_KEY = "cardiac-trainer.recordings.v1";

export async function loadRecordingSessions(): Promise<RecordingSession[]> {
  const value = await AsyncStorage.getItem(RECORDINGS_STORAGE_KEY);

  if (!value) {
    return [];
  }

  const parsed = JSON.parse(value) as RecordingSession[];

  return parsed.sort((first, second) => second.startedAt - first.startedAt);
}

export async function saveRecordingSessions(sessions: RecordingSession[]): Promise<void> {
  const sortedSessions = [...sessions].sort((first, second) => second.startedAt - first.startedAt);

  await AsyncStorage.setItem(RECORDINGS_STORAGE_KEY, JSON.stringify(sortedSessions));
}
