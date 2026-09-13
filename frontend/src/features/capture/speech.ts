import Constants, { ExecutionEnvironment } from "expo-constants";

type Listener = { remove: () => void };

type SpeechModule = {
  ExpoSpeechRecognitionModule: {
    isRecognitionAvailable: () => boolean;
    supportsOnDeviceRecognition: () => boolean;
    requestMicrophonePermissionsAsync: () => Promise<{ granted: boolean }>;
    addListener: (name: string, listener: (event: Record<string, unknown>) => void) => Listener;
    start: (options: Record<string, unknown>) => void;
    stop: () => void;
    abort: () => void;
  };
};

export type SpeechSession = {
  stop: () => void;
  cancel: () => void;
};

export function speechUnavailableMessage() {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return "Voice transcription is not included in Expo Go. Open OweYaar in a development build to use on-device speech.";
  }
  return null;
}

export async function startOnDeviceSpeech(
  locale: string,
  onText: (value: string, final: boolean) => void,
  onEnd: () => void,
  onError: (message: string) => void,
): Promise<SpeechSession | null> {
  if (speechUnavailableMessage()) return null;
  try {
    const { ExpoSpeechRecognitionModule: module } = await import("expo-speech-recognition") as SpeechModule;
    if (!module.isRecognitionAvailable() || !module.supportsOnDeviceRecognition()) {
      return null;
    }
    const permission = await module.requestMicrophonePermissionsAsync();
    if (!permission.granted) {
      onError("Microphone permission was not granted.");
      return null;
    }
    const resultListener = module.addListener("result", (event) => {
      const results = event.results as Array<{ transcript?: string }> | undefined;
      const transcript = results?.[0]?.transcript;
      if (transcript) {
        onText(transcript, Boolean(event.isFinal));
      }
    });
    const errorListener = module.addListener("error", (event) => {
      onError(String(event.message ?? "Speech recognition stopped."));
    });
    const endListener = module.addListener("end", () => {
      resultListener.remove();
      errorListener.remove();
      endListener.remove();
      onEnd();
    });
    module.start({
      lang: locale,
      interimResults: true,
      continuous: false,
      maxAlternatives: 1,
      requiresOnDeviceRecognition: true,
      addsPunctuation: true,
    });
    return {
      stop: () => module.stop(),
      cancel: () => module.abort(),
    };
  } catch {
    return null;
  }
}
