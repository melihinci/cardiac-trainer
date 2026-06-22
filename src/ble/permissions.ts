import { PermissionsAndroid, Platform } from "react-native";

export type BluetoothPermissionResult = {
  granted: boolean;
  error: string | null;
};

export async function requestBluetoothPermissions(): Promise<BluetoothPermissionResult> {
  if (Platform.OS !== "android") {
    return { granted: true, error: null };
  }

  try {
    if (Platform.Version >= 31) {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
      ]);

      const scanGranted =
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
        PermissionsAndroid.RESULTS.GRANTED;
      const connectGranted =
        results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
        PermissionsAndroid.RESULTS.GRANTED;

      if (!scanGranted || !connectGranted) {
        return {
          granted: false,
          error: "Bluetooth scan/connect permission was denied."
        };
      }

      return { granted: true, error: null };
    }

    const locationResult = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );

    if (locationResult !== PermissionsAndroid.RESULTS.GRANTED) {
      return {
        granted: false,
        error: "Location permission is required for Bluetooth scanning on this Android version."
      };
    }

    return { granted: true, error: null };
  } catch (error) {
    return {
      granted: false,
      error: error instanceof Error ? error.message : "Failed to request Bluetooth permissions."
    };
  }
}
