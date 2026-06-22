import { Vibration } from "react-native";
import { Audio, InterruptionModeIOS } from "expo-av";

const restCompleteBeepAsset = require("../../assets/audio/rest-complete-low.wav") as number;
const exerciseLimitBeepAsset = require("../../assets/audio/exercise-limit-high.wav") as number;

export type BeepResult = {
  error: string | null;
  played: boolean;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown beep playback error.";
}

async function playBundledBeep(asset: number, fallbackPattern: number[]): Promise<BeepResult> {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: false
    });

    const { sound } = await Audio.Sound.createAsync(asset, {
      isLooping: false,
      shouldPlay: true,
      volume: 1
    });

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        void sound.unloadAsync();
      }
    });

    return { error: null, played: true };
  } catch (error) {
    Vibration.vibrate(fallbackPattern);

    return {
      error: getErrorMessage(error),
      played: false
    };
  }
}

export async function playRestCompleteBeep(): Promise<BeepResult> {
  return playBundledBeep(restCompleteBeepAsset, [0, 300]);
}

export async function playExerciseLimitBeep(): Promise<BeepResult> {
  return playBundledBeep(exerciseLimitBeepAsset, [0, 90, 70, 90, 70, 90]);
}
