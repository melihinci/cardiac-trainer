export type HeartRateSample = {
  bpm: number;
  isoTime: string;
  timestamp: number;
};

export type RecordingSession = {
  endedAt: number | null;
  id: string;
  name: string;
  samples: HeartRateSample[];
  startedAt: number;
};
