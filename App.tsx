import { useEffect, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

import { useHeartRateSensor } from "./src/ble/useHeartRateSensor";
import { HeartRateChart } from "./src/components/HeartRateChart";
import { exportRecordingCsv } from "./src/recording/exportCsv";
import { loadRecordingSessions, saveRecordingSessions } from "./src/recording/storage";
import { playExerciseLimitBeep, playRestCompleteBeep } from "./src/trainer/beeps";
import type { HeartRateSample, RecordingSession } from "./src/types/recording";
import type { TrainerMode, TrainerSettings } from "./src/types/trainer";

const defaultTrainerSettings: TrainerSettings = {
  beepCooldownSeconds: 10,
  exerciseLimitBpm: 150,
  restCompleteBpm: 110
};

type TrainerEvent = {
  bpm: number;
  elapsedSeconds?: number;
  message: string;
  mode: TrainerMode;
  threshold: number;
  triggeredAt: string;
} | null;

function createRecordingId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function getRecordingDuration(session: RecordingSession): number {
  return (session.endedAt ?? Date.now()) - session.startedAt;
}

function getAverageBpm(samples: HeartRateSample[]): number | null {
  if (samples.length === 0) {
    return null;
  }

  const total = samples.reduce((sum, sample) => sum + sample.bpm, 0);

  return Math.round(total / samples.length);
}

function getMaxBpm(samples: HeartRateSample[]): number | null {
  if (samples.length === 0) {
    return null;
  }

  return Math.max(...samples.map((sample) => sample.bpm));
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "requesting-permission":
      return "Requesting Bluetooth permission";
    case "scanning":
      return "Scanning for heart rate sensor";
    case "connecting":
      return "Connecting";
    case "connected":
      return "Connected";
    case "disconnected":
      return "Disconnected";
    case "error":
      return "Error";
    default:
      return "Idle";
  }
}

export default function App() {
  const { bpm, deviceName, disconnect, error, startScan, status } = useHeartRateSensor();
  const [mode, setMode] = useState<TrainerMode>("idle");
  const [settings, setSettings] = useState<TrainerSettings>(defaultTrainerSettings);
  const [beepStatus, setBeepStatus] = useState<string | null>(null);
  const [currentRecording, setCurrentRecording] = useState<RecordingSession | null>(null);
  const [recordings, setRecordings] = useState<RecordingSession[]>([]);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [selectedRecordingId, setSelectedRecordingId] = useState<string | null>(null);
  const [trainerEvent, setTrainerEvent] = useState<TrainerEvent>(null);
  const lastRecordedSampleAtRef = useRef(0);
  const settingsRef = useRef(settings);
  const lastBeepAtRef = useRef({
    exercise: 0,
    rest: 0
  });
  const lastExerciseLimitAtRef = useRef<number | null>(null);
  const restCompletedForLimitAtRef = useRef<number | null>(null);
  const isBusy =
    status === "requesting-permission" || status === "scanning" || status === "connecting";
  const isConnected = status === "connected";
  const isRecording = currentRecording !== null;
  const selectedRecording =
    recordings.find((recording) => recording.id === selectedRecordingId) ?? recordings[0] ?? null;

  useEffect(() => {
    void loadRecordingSessions()
      .then((sessions) => {
        setRecordings(sessions);
      })
      .catch((loadError: unknown) => {
        setRecordingError(
          loadError instanceof Error ? loadError.message : "Failed to load recordings."
        );
      });
  }, []);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (bpm === null || mode !== "exercise") {
      return;
    }

    const now = Date.now();
    const currentSettings = settingsRef.current;
    const cooldownMs = currentSettings.beepCooldownSeconds * 1000;

    if (bpm >= currentSettings.exerciseLimitBpm) {
      setTrainerEvent({
        bpm,
        message: "Exercise limit reached",
        mode: "exercise",
        threshold: currentSettings.exerciseLimitBpm,
        triggeredAt: new Date(now).toLocaleTimeString()
      });

      if (now - lastBeepAtRef.current.exercise >= cooldownMs) {
        lastBeepAtRef.current.exercise = now;
        lastExerciseLimitAtRef.current = now;
        restCompletedForLimitAtRef.current = null;
        void triggerExerciseLimitBeep();
      }

      return;
    }

    const lastExerciseLimitAt = lastExerciseLimitAtRef.current;
    const canCompleteRest =
      lastExerciseLimitAt !== null && restCompletedForLimitAtRef.current !== lastExerciseLimitAt;

    if (bpm <= currentSettings.restCompleteBpm && canCompleteRest) {
      const elapsedSeconds = Math.max(0, Math.round((now - lastExerciseLimitAt) / 1000));

      setTrainerEvent({
        bpm,
        elapsedSeconds,
        message: `Dinlenme tamamlandı ${elapsedSeconds}sn!`,
        mode: "rest",
        threshold: currentSettings.restCompleteBpm,
        triggeredAt: new Date(now).toLocaleTimeString()
      });

      if (now - lastBeepAtRef.current.rest >= cooldownMs) {
        lastBeepAtRef.current.rest = now;
        restCompletedForLimitAtRef.current = lastExerciseLimitAt;
        void triggerRestCompleteBeep();
      }
    }
  }, [bpm, mode, settings.beepCooldownSeconds, settings.exerciseLimitBpm, settings.restCompleteBpm]);

  useEffect(() => {
    if (bpm === null || currentRecording === null) {
      return;
    }

    const now = Date.now();

    if (now - lastRecordedSampleAtRef.current < 1000) {
      return;
    }

    lastRecordedSampleAtRef.current = now;

    const sample: HeartRateSample = {
      bpm,
      isoTime: new Date(now).toISOString(),
      timestamp: now
    };

    setCurrentRecording((recording) => {
      if (recording === null) {
        return null;
      }

      return {
        ...recording,
        samples: [...recording.samples, sample]
      };
    });
  }, [bpm, currentRecording]);

  async function triggerRestCompleteBeep() {
    const result = await playRestCompleteBeep();
    setBeepStatus(
      result.played ? "Rest beep played" : `Rest beep failed, vibration used: ${result.error}`
    );
  }

  async function triggerExerciseLimitBeep() {
    const result = await playExerciseLimitBeep();
    setBeepStatus(
      result.played ? "Limit beep played" : `Limit beep failed, vibration used: ${result.error}`
    );
  }

  function updateSetting(key: keyof TrainerSettings, value: string) {
    const numericValue = Number.parseInt(value, 10);

    setSettings((current) => ({
      ...current,
      [key]: Math.max(1, Number.isNaN(numericValue) ? 1 : numericValue)
    }));
  }

  function startRecording() {
    const now = Date.now();

    lastRecordedSampleAtRef.current = 0;
    setRecordingError(null);
    setCurrentRecording({
      endedAt: null,
      id: createRecordingId(),
      name: `Recording ${new Date(now).toLocaleTimeString()}`,
      samples: [],
      startedAt: now
    });
  }

  async function stopRecording() {
    if (currentRecording === null) {
      return;
    }

    const finishedRecording: RecordingSession = {
      ...currentRecording,
      endedAt: Date.now()
    };
    const nextRecordings = [finishedRecording, ...recordings];

    setCurrentRecording(null);
    setRecordings(nextRecordings);
    setSelectedRecordingId(finishedRecording.id);

    try {
      await saveRecordingSessions(nextRecordings);
      setRecordingError(null);
    } catch (saveError) {
      setRecordingError(saveError instanceof Error ? saveError.message : "Failed to save recording.");
    }
  }

  async function deleteRecording(id: string) {
    const nextRecordings = recordings.filter((recording) => recording.id !== id);

    setRecordings(nextRecordings);
    setSelectedRecordingId((currentId) => {
      if (currentId !== id) {
        return currentId;
      }

      return nextRecordings[0]?.id ?? null;
    });

    try {
      await saveRecordingSessions(nextRecordings);
      setRecordingError(null);
    } catch (deleteError) {
      setRecordingError(
        deleteError instanceof Error ? deleteError.message : "Failed to delete recording."
      );
    }
  }

  async function exportRecording(recording: RecordingSession) {
    try {
      await exportRecordingCsv(recording);
      setRecordingError(null);
    } catch (exportError) {
      setRecordingError(
        exportError instanceof Error ? exportError.message : "Failed to export recording."
      );
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>cardiac-trainer</Text>
          <Text style={styles.subtitle}>Bluetooth LE heart rate monitor</Text>
        </View>

        <View style={styles.bpmPanel}>
          <Text style={styles.bpmValue}>{bpm ?? "--"}</Text>
          <Text style={styles.bpmLabel}>BPM</Text>
        </View>

        <View style={styles.statusPanel}>
          <Text style={styles.statusLabel}>Status</Text>
          <Text style={styles.statusText}>{getStatusLabel(status)}</Text>
          <Text style={styles.deviceText}>{deviceName ?? "No sensor connected"}</Text>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>

        <View style={styles.recordingPanel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Recording</Text>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => {
                if (isRecording) {
                  void stopRecording();
                } else {
                  startRecording();
                }
              }}
              style={[styles.recButton, isRecording && styles.activeRecButton]}
            >
              <View style={styles.recDot} />
              <Text style={styles.recButtonText}>{isRecording ? "STOP" : "REC"}</Text>
            </TouchableOpacity>
          </View>

          {currentRecording ? (
            <View style={styles.chartSection}>
              <Text style={styles.recordingSummary}>
                Recording {currentRecording.samples.length} samples /{" "}
                {formatDuration(getRecordingDuration(currentRecording))}
              </Text>
              <HeartRateChart samples={currentRecording.samples} />
            </View>
          ) : (
            <Text style={styles.trainerHint}>No active recording</Text>
          )}

          {selectedRecording ? (
            <View style={styles.chartSection}>
              <Text style={styles.chartTitle}>Selected: {selectedRecording.name}</Text>
              <HeartRateChart samples={selectedRecording.samples} />
            </View>
          ) : null}

          {recordingError ? <Text style={styles.errorText}>{recordingError}</Text> : null}

          <View style={styles.recordingList}>
            {recordings.length === 0 ? (
              <Text style={styles.trainerHint}>No saved recordings yet</Text>
            ) : (
              recordings.map((recording) => {
                const averageBpm = getAverageBpm(recording.samples);
                const maxBpm = getMaxBpm(recording.samples);

                return (
                  <View key={recording.id} style={styles.recordingItem}>
                    <View style={styles.recordingItemHeader}>
                      <Text style={styles.recordingName}>{recording.name}</Text>
                      <View style={styles.recordingActions}>
                        <TouchableOpacity
                          accessibilityRole="button"
                          onPress={() => {
                            setSelectedRecordingId(recording.id);
                          }}
                          style={[
                            styles.selectButton,
                            selectedRecording?.id === recording.id && styles.activeSelectButton
                          ]}
                        >
                          <Text
                            style={[
                              styles.selectButtonText,
                              selectedRecording?.id === recording.id && styles.activeSelectButtonText
                            ]}
                          >
                            {selectedRecording?.id === recording.id ? "Selected" : "Select"}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          accessibilityRole="button"
                          onPress={() => {
                            void exportRecording(recording);
                          }}
                          style={styles.exportButton}
                        >
                          <Text style={styles.exportButtonText}>Export CSV</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          accessibilityRole="button"
                          onPress={() => {
                            void deleteRecording(recording.id);
                          }}
                          style={styles.deleteButton}
                        >
                          <Text style={styles.deleteButtonText}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <Text style={styles.recordingMeta}>{formatDate(recording.startedAt)}</Text>
                    <Text style={styles.recordingMeta}>
                      {formatDuration(getRecordingDuration(recording))} /{" "}
                      {recording.samples.length} samples / avg {averageBpm ?? "--"} BPM / max{" "}
                      {maxBpm ?? "--"} BPM
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </View>

        <View style={styles.trainerPanel}>
          <Text style={styles.panelTitle}>Trainer</Text>

          <View style={styles.modeButtons}>
            {(["idle", "exercise"] as TrainerMode[]).map((nextMode) => (
              <TouchableOpacity
                accessibilityRole="button"
                key={nextMode}
                onPress={() => setMode(nextMode)}
                style={[styles.modeButton, mode === nextMode && styles.activeModeButton]}
              >
                <Text style={[styles.modeButtonText, mode === nextMode && styles.activeModeText]}>
                  {nextMode}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.settingsGrid}>
            <View style={styles.settingField}>
              <Text style={styles.settingLabel}>Rest complete</Text>
              <TextInput
                keyboardType="number-pad"
                onChangeText={(value) => updateSetting("restCompleteBpm", value)}
                style={styles.settingInput}
                value={String(settings.restCompleteBpm)}
              />
            </View>

            <View style={styles.settingField}>
              <Text style={styles.settingLabel}>Exercise limit</Text>
              <TextInput
                keyboardType="number-pad"
                onChangeText={(value) => updateSetting("exerciseLimitBpm", value)}
                style={styles.settingInput}
                value={String(settings.exerciseLimitBpm)}
              />
            </View>

            <View style={styles.settingField}>
              <Text style={styles.settingLabel}>Cooldown sec</Text>
              <TextInput
                keyboardType="number-pad"
                onChangeText={(value) => updateSetting("beepCooldownSeconds", value)}
                style={styles.settingInput}
                value={String(settings.beepCooldownSeconds)}
              />
            </View>
          </View>

          {trainerEvent ? (
            <View style={styles.trainerEvent}>
              <Text style={styles.trainerEventTitle}>{trainerEvent.message}</Text>
              <Text style={styles.trainerEventText}>
                {trainerEvent.bpm} BPM at {trainerEvent.triggeredAt} / threshold{" "}
                {trainerEvent.threshold}
              </Text>
            </View>
          ) : (
            <Text style={styles.trainerHint}>No threshold event yet</Text>
          )}

          {beepStatus ? <Text style={styles.beepStatusText}>{beepStatus}</Text> : null}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            accessibilityRole="button"
            disabled={isBusy}
            onPress={startScan}
            style={[styles.primaryButton, isBusy && styles.disabledButton]}
          >
            <Text style={styles.primaryButtonText}>
              {isBusy ? "Working..." : isConnected ? "Reconnect" : "Connect sensor"}
            </Text>
          </TouchableOpacity>

          {isConnected ? (
            <TouchableOpacity
              accessibilityRole="button"
              onPress={disconnect}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Disconnect</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: 12,
    width: "100%"
  },
  bpmLabel: {
    color: "#596579",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  bpmPanel: {
    alignItems: "center",
    borderColor: "#d9e1ee",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingVertical: 34,
    width: "100%"
  },
  bpmValue: {
    color: "#172033",
    fontSize: 82,
    fontWeight: "800",
    letterSpacing: 0,
    lineHeight: 92
  },
  beepStatusText: {
    color: "#4d5870",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0
  },
  container: {
    alignItems: "center",
    gap: 24,
    justifyContent: "center",
    minHeight: "100%",
    paddingHorizontal: 24,
    paddingVertical: 28
  },
  deviceText: {
    color: "#4d5870",
    fontSize: 16,
    letterSpacing: 0,
    marginTop: 6,
    textAlign: "center"
  },
  disabledButton: {
    opacity: 0.55
  },
  activeRecButton: {
    backgroundColor: "#b42318",
    borderColor: "#b42318"
  },
  activeSelectButton: {
    backgroundColor: "#172033",
    borderColor: "#172033"
  },
  activeSelectButtonText: {
    color: "#ffffff"
  },
  chartSection: {
    gap: 10,
    width: "100%"
  },
  chartTitle: {
    color: "#172033",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0
  },
  deleteButton: {
    borderColor: "#d0d7e2",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  deleteButtonText: {
    color: "#b42318",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0
  },
  errorText: {
    color: "#b42318",
    fontSize: 15,
    letterSpacing: 0,
    marginTop: 10,
    textAlign: "center"
  },
  exportButton: {
    borderColor: "#1f6feb",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  exportButtonText: {
    color: "#1f6feb",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0
  },
  header: {
    alignItems: "center",
    gap: 6
  },
  activeModeButton: {
    backgroundColor: "#172033",
    borderColor: "#172033"
  },
  activeModeText: {
    color: "#ffffff"
  },
  modeButton: {
    alignItems: "center",
    borderColor: "#bdc8d9",
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 42,
    justifyContent: "center",
    paddingHorizontal: 8
  },
  modeButtons: {
    flexDirection: "row",
    gap: 8,
    width: "100%"
  },
  modeButtonText: {
    color: "#172033",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "capitalize"
  },
  panelTitle: {
    alignSelf: "flex-start",
    color: "#172033",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0
  },
  panelHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%"
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#1f6feb",
    borderRadius: 8,
    minHeight: 52,
    justifyContent: "center",
    paddingHorizontal: 18,
    width: "100%"
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0
  },
  safeArea: {
    backgroundColor: "#f7f9fc",
    flex: 1
  },
  recButton: {
    alignItems: "center",
    backgroundColor: "#d92d20",
    borderColor: "#d92d20",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 16
  },
  recButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 0
  },
  recDot: {
    backgroundColor: "#ffffff",
    borderRadius: 999,
    height: 12,
    width: 12
  },
  recordingItem: {
    borderColor: "#d9e1ee",
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    padding: 12,
    width: "100%"
  },
  recordingItemHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  recordingActions: {
    alignItems: "flex-end",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end"
  },
  recordingList: {
    gap: 10,
    width: "100%"
  },
  recordingMeta: {
    color: "#596579",
    fontSize: 13,
    letterSpacing: 0
  },
  recordingName: {
    color: "#172033",
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0
  },
  recordingPanel: {
    borderColor: "#d9e1ee",
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16,
    width: "100%"
  },
  recordingSummary: {
    color: "#172033",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#bdc8d9",
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 50,
    justifyContent: "center",
    paddingHorizontal: 18,
    width: "100%"
  },
  secondaryButtonText: {
    color: "#172033",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0
  },
  selectButton: {
    borderColor: "#172033",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  selectButtonText: {
    color: "#172033",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0
  },
  statusLabel: {
    color: "#657188",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  statusPanel: {
    alignItems: "center",
    minHeight: 96,
    width: "100%"
  },
  statusText: {
    color: "#172033",
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 0,
    marginTop: 6,
    textAlign: "center"
  },
  settingField: {
    flex: 1,
    gap: 6,
    minWidth: 96
  },
  settingInput: {
    backgroundColor: "#ffffff",
    borderColor: "#bdc8d9",
    borderRadius: 8,
    borderWidth: 1,
    color: "#172033",
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0,
    minHeight: 46,
    paddingHorizontal: 12
  },
  settingLabel: {
    color: "#596579",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0
  },
  settingsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    width: "100%"
  },
  subtitle: {
    color: "#596579",
    fontSize: 16,
    letterSpacing: 0,
    textAlign: "center"
  },
  title: {
    color: "#172033",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center"
  },
  trainerPanel: {
    borderColor: "#d9e1ee",
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16,
    width: "100%"
  },
  trainerEvent: {
    backgroundColor: "#fff4d6",
    borderColor: "#e5b94f",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 12,
    width: "100%"
  },
  trainerEventText: {
    color: "#5c4611",
    fontSize: 14,
    letterSpacing: 0
  },
  trainerEventTitle: {
    color: "#172033",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0
  },
  trainerHint: {
    color: "#657188",
    fontSize: 14,
    letterSpacing: 0
  }
});
