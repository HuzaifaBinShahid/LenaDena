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
    // iOS 18 home-screen appearances: the dark and tinted icons sit on a system-supplied ground.
    icon: {
      light: "./assets/icon.png",
      dark: "./assets/icon-dark.png",
      tinted: "./assets/icon-tinted.png",
    },
  },
  android: {
    package: "com.lenadena.app",
    // Resize the activity, then let KeyboardAwareScrollView move only the focused form field.
    softwareKeyboardLayoutMode: "resize",
    permissions: ["RECORD_AUDIO"],
    adaptiveIcon: {
      // Split gold coin on a transparent layer, kept inside the 66dp safe zone so every launcher
      // mask (circle, squircle, rounded square) shows the whole coin over the violet gradient layer.
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundImage: "./assets/adaptive-background.png",
      // Android 13+ themed icons tint this silhouette.
      monochromeImage: "./assets/adaptive-monochrome.png",
      backgroundColor: "#6848E6",
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
