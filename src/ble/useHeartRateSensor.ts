import { useCallback, useEffect, useRef, useState } from "react";
import { BleError, BleManager, Device, Subscription } from "react-native-ble-plx";

import {
  HEART_RATE_MEASUREMENT_CHARACTERISTIC_UUID,
  HEART_RATE_SERVICE_UUID
} from "./constants";
import { parseHeartRateMeasurement } from "./heartRateParser";
import { requestBluetoothPermissions } from "./permissions";
import { HeartRateSensorState } from "../types/heartRate";

const initialState: HeartRateSensorState = {
  bpm: null,
  deviceName: null,
  error: null,
  status: "idle"
};

function getDeviceName(device: Device): string {
  return device.name ?? device.localName ?? "Heart rate sensor";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof BleError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown Bluetooth error.";
}

export function useHeartRateSensor() {
  const managerRef = useRef<BleManager | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const monitorSubscriptionRef = useRef<Subscription | null>(null);
  const stateSubscriptionRef = useRef<Subscription | null>(null);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<HeartRateSensorState>(initialState);

  if (managerRef.current === null) {
    managerRef.current = new BleManager();
  }

  const stopScan = useCallback(() => {
    managerRef.current?.stopDeviceScan();

    if (scanTimeoutRef.current !== null) {
      clearTimeout(scanTimeoutRef.current);
      scanTimeoutRef.current = null;
    }
  }, []);

  const cleanupDevice = useCallback(async () => {
    monitorSubscriptionRef.current?.remove();
    monitorSubscriptionRef.current = null;
    stopScan();

    const device = deviceRef.current;
    deviceRef.current = null;

    if (device !== null) {
      try {
        await managerRef.current?.cancelDeviceConnection(device.id);
      } catch {
        // Device may already be disconnected.
      }
    }
  }, [stopScan]);

  const disconnect = useCallback(async () => {
    await cleanupDevice();
    setState((current) => ({
      ...current,
      bpm: null,
      status: "disconnected"
    }));
  }, [cleanupDevice]);

  const connectToDevice = useCallback(
    async (device: Device) => {
      stopScan();
      setState({
        bpm: null,
        deviceName: getDeviceName(device),
        error: null,
        status: "connecting"
      });

      try {
        const connectedDevice = await device.connect();
        deviceRef.current = connectedDevice;

        const readyDevice = await connectedDevice.discoverAllServicesAndCharacteristics();

        monitorSubscriptionRef.current = readyDevice.monitorCharacteristicForService(
          HEART_RATE_SERVICE_UUID,
          HEART_RATE_MEASUREMENT_CHARACTERISTIC_UUID,
          (error, characteristic) => {
            if (error !== null) {
              setState((current) => ({
                ...current,
                error: error.message,
                status: "error"
              }));
              return;
            }

            if (!characteristic?.value) {
              return;
            }

            try {
              const bpm = parseHeartRateMeasurement(characteristic.value);

              setState({
                bpm,
                deviceName: getDeviceName(readyDevice),
                error: null,
                status: "connected"
              });
            } catch (parseError) {
              setState((current) => ({
                ...current,
                error: getErrorMessage(parseError),
                status: "error"
              }));
            }
          }
        );

        setState((current) => ({
          ...current,
          deviceName: getDeviceName(readyDevice),
          error: null,
          status: "connected"
        }));
      } catch (error) {
        await cleanupDevice();
        setState((current) => ({
          ...current,
          error: getErrorMessage(error),
          status: "error"
        }));
      }
    },
    [cleanupDevice, stopScan]
  );

  const startScan = useCallback(async () => {
    const manager = managerRef.current;

    if (manager === null) {
      return;
    }

    await cleanupDevice();
    setState({
      bpm: null,
      deviceName: null,
      error: null,
      status: "requesting-permission"
    });

    const permission = await requestBluetoothPermissions();

    if (!permission.granted) {
      setState({
        bpm: null,
        deviceName: null,
        error: permission.error,
        status: "error"
      });
      return;
    }

    const bluetoothState = await manager.state();

    if (bluetoothState !== "PoweredOn") {
      setState({
        bpm: null,
        deviceName: null,
        error: "Turn Bluetooth on, then try again.",
        status: "error"
      });
      return;
    }

    setState({
      bpm: null,
      deviceName: null,
      error: null,
      status: "scanning"
    });

    scanTimeoutRef.current = setTimeout(() => {
      stopScan();
      setState((current) => {
        if (current.status !== "scanning") {
          return current;
        }

        return {
          ...current,
          error: "No heart rate sensor found.",
          status: "error"
        };
      });
    }, 15000);

    manager.startDeviceScan([HEART_RATE_SERVICE_UUID], null, (error, device) => {
      if (error !== null) {
        stopScan();
        setState({
          bpm: null,
          deviceName: null,
          error: error.message,
          status: "error"
        });
        return;
      }

      if (device === null) {
        return;
      }

      void connectToDevice(device);
    });
  }, [cleanupDevice, connectToDevice, stopScan]);

  useEffect(() => {
    const manager = managerRef.current;

    stateSubscriptionRef.current =
      manager?.onStateChange((nextState) => {
        if (nextState === "PoweredOff") {
          void cleanupDevice();
          setState((current) => ({
            ...current,
            bpm: null,
            error: "Bluetooth is off.",
            status: "error"
          }));
        }
      }, true) ?? null;

    return () => {
      stateSubscriptionRef.current?.remove();
      stateSubscriptionRef.current = null;
      monitorSubscriptionRef.current?.remove();
      monitorSubscriptionRef.current = null;
      stopScan();
      void cleanupDevice();
      managerRef.current?.destroy();
      managerRef.current = null;
    };
  }, [cleanupDevice, stopScan]);

  return {
    ...state,
    disconnect,
    startScan
  };
}
