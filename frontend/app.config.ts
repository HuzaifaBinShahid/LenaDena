import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "LenaDena",
  slug: "lenadena",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "lenadena",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  icon: "./assets/icon.png",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.lenadena.app",
  },
  android: {
    package: "com.lenadena.app",
    // Resize the activity, then let KeyboardAwareScrollView move only the focused form field.
    softwareKeyboardLayoutMode: "resize",
    permissions: ["RECORD_AUDIO"],
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#1A1037",
    },
    edgeToEdgeEnabled: true,
  },
  web: {
    bundler: "metro",
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        backgroundColor: "#1A1037",
        dark: {
          backgroundColor: "#1A1037",
        },
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "Choose a receipt, payment proof, or profile photo for LenaDena.",
        cameraPermission: "Take a receipt, payment proof, or profile photo for LenaDena.",
      },
    ],
    [
      "expo-sharing",
      {
        ios: {
          enabled: true,
          activationRule: {
            supportsImageWithMaxCount: 1,
          },
        },
        android: {
          enabled: true,
          singleShareMimeTypes: ["image/*"],
          multipleShareMimeTypes: [],
        },
      },
    ],
    [
      "expo-speech-recognition",
      {
        microphonePermission: "Use the microphone for on-device expense dictation.",
        speechRecognitionPermission: "Transcribe expense details on this device.",
      },
    ],
    ["expo-mlkit-ocr", { iosEngine: "auto" }],
    ["expo-local-authentication", { faceIDPermission: "Use Face ID to unlock LenaDena." }],
    "expo-secure-store",
    ["expo-build-properties", { ios: { deploymentTarget: "16.4", useFrameworks: "static" } }],
    "expo-sqlite",
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
