import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";

import type { RecordingSession } from "../types/recording";

function escapeCsvValue(value: string | number): string {
  const stringValue = String(value);

  if (!/[",\n\r]/.test(stringValue)) {
    return stringValue;
  }

  return `"${stringValue.replace(/"/g, '""')}"`;
}

function buildRecordingCsv(session: RecordingSession): string {
  const rows = session.samples.map((sample) =>
    [sample.isoTime, sample.timestamp, sample.bpm].map(escapeCsvValue).join(",")
  );

  return ["timestamp_iso,timestamp_ms,bpm", ...rows].join("\n");
}

export async function exportRecordingCsv(session: RecordingSession): Promise<string> {
  if (!FileSystem.cacheDirectory) {
    throw new Error("File system cache directory is unavailable.");
  }

  const isSharingAvailable = await Sharing.isAvailableAsync();

  if (!isSharingAvailable) {
    throw new Error("Sharing is not available on this device.");
  }

  const fileUri = `${FileSystem.cacheDirectory}cardiac-trainer-${session.startedAt}.csv`;

  await FileSystem.writeAsStringAsync(fileUri, buildRecordingCsv(session), {
    encoding: FileSystem.EncodingType.UTF8
  });
  await Sharing.shareAsync(fileUri, {
    dialogTitle: session.name,
    mimeType: "text/csv",
    UTI: "public.comma-separated-values-text"
  });

  return fileUri;
}
