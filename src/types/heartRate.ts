export type HeartRateConnectionStatus =
  | "idle"
  | "requesting-permission"
  | "scanning"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export type HeartRateSensorState = {
  bpm: number | null;
  deviceName: string | null;
  error: string | null;
  status: HeartRateConnectionStatus;
};
