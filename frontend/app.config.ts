import type { ExpoConfig } from "expo/config";

// Voice entry is off (see src/lib/features.ts). Turning it on (EXPO_PUBLIC_VOICE_ENTRY=true) restores the microphone.
const voiceEnabled = process.env.EXPO_PUBLIC_VOICE_ENTRY === "true";

// Permissions that libraries add to the Android manifest on their own. With voice off nothing here is used, and each one
// would otherwise be shown on the store page and need an explanation: the microphone (expo-audio and
// expo-speech-recognition), audio settings and foreground playback (expo-audio), and drawing over other apps (React
// Native's debug overlay, not needed in a release build).
const blockedAndroidPermissions = [
  "android.permission.SYSTEM_ALERT_WINDOW",
  ...(voiceEnabled ? [] : [
    "android.permission.RECORD_AUDIO",
    "android.permission.MODIFY_AUDIO_SETTINGS",
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
  ]),
];

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
    permissions: voiceEnabled ? ["RECORD_AUDIO"] : [],
    blockedPermissions: blockedAndroidPermissions,
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
    ["expo-audio", { microphonePermission: "Use the microphone to turn a short spoken balance into a draft for your review." }],
    ["expo-mlkit-ocr", { iosEngine: "auto" }],
    ["expo-local-authentication", { faceIDPermission: "Use Face ID to unlock LenaDena and to sign you in." }],
    "expo-secure-store",
    ["expo-build-properties", { ios: { deploymentTarget: "16.4", useFrameworks: "static" } }],
    "expo-sqlite",
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
