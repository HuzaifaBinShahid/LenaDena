import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "OweYaar",
  slug: "oweyaar",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "oweyaar",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  icon: "./assets/icon.png",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.oweyaar.app",
  },
  android: {
    package: "com.oweyaar.app",
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
        backgroundColor: "#1A1037",
        dark: {
          backgroundColor: "#1A1037",
        },
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "Choose a receipt image to prepare an expense.",
        cameraPermission: "Take a receipt photo to prepare an expense.",
        microphonePermission: false,
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
    ["expo-build-properties", { ios: { deploymentTarget: "16.4", useFrameworks: "static" } }],
    "expo-sqlite",
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
