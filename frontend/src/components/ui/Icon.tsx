import type { ComponentProps } from "react";
import { View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

const icons = {
  "alert-circle": "alert-circle-outline",
  "arrow-left": "arrow-back",
  "arrow-right": "arrow-forward",
  "arrow-down": "arrow-down",
  "arrow-up": "arrow-up",
  "arrow-up-right": "arrow-up-right-box-outline",
  bell: "notifications-outline",
  calendar: "calendar-clear-outline",
  chart: "stats-chart-outline",
  "chart-active": "stats-chart",
  cash: "cash-outline",
  check: "checkmark",
  "check-circle": "checkmark-circle",
  "check-circle-outline": "checkmark-circle-outline",
  "chevron-down": "chevron-down",
  "chevron-right": "chevron-forward",
  close: "close",
  clock: "time-outline",
  "credit-card": "card-outline",
  download: "download-outline",
  exchange: "swap-horizontal",
  "file-text": "receipt-outline",
  filter: "funnel-outline",
  "finger-print": "finger-print-outline",
  grid: "grid-outline",
  home: "home-outline",
  "home-active": "home",
  image: "image-outline",
  info: "information-circle-outline",
  "lock-closed": "lock-closed-outline",
  "log-out": "log-out-outline",
  mail: "mail-outline",
  maximize: "scan-outline",
  mic: "mic-outline",
  minus: "remove",
  options: "options-outline",
  plus: "add",
  pulse: "pulse-outline",
  scan: "scan-outline",
  send: "paper-plane-outline",
  settings: "settings-outline",
  "shield-check": "shield-checkmark-outline",
  sparkles: "sparkles",
  square: "stop",
  star: "star",
  "trash-2": "trash-outline",
  "trending-down": "trending-down",
  "trending-up": "trending-up",
  user: "person-outline",
  "user-plus": "person-add-outline",
  users: "people-outline",
  "users-active": "people",
  wallet: "wallet-outline",
  warning: "warning-outline",
  // Appearance, people and editing (added 2026-09-18).
  "add-circle": "add-circle-outline",
  at: "at-outline",
  camera: "camera-outline",
  "check-done": "checkmark-done-outline",
  "chevron-left": "chevron-back",
  "chevron-up": "chevron-up",
  contrast: "contrast-outline",
  edit: "create-outline",
  eye: "eye-outline",
  "eye-off": "eye-off-outline",
  heart: "heart-outline",
  hourglass: "hourglass-outline",
  link: "link-outline",
  moon: "moon-outline",
  more: "ellipsis-horizontal",
  palette: "color-palette-outline",
  pencil: "pencil",
  people: "people-circle-outline",
  "person-circle": "person-circle-outline",
  "person-remove": "person-remove-outline",
  phone: "phone-portrait-outline",
  search: "search-outline",
  share: "share-outline",
  sun: "sunny-outline",
  "swap-vertical": "swap-vertical",
} as const satisfies Record<string, ComponentProps<typeof Ionicons>["name"]>;

/** Glyphs Ionicons does not provide, drawn to match its rounded outline weight. */
type CustomIconName = "face-id";

export type IconName = keyof typeof icons | CustomIconName;

type IconProps = {
  name: IconName;
  size?: number;
  color: string;
};

export function Icon({ name, size = 20, color }: IconProps) {
  if (name === "face-id") return <FaceIdGlyph size={size} color={color} />;
  return <Ionicons name={icons[name]} size={size} color={color} />;
}

function FaceIdGlyph({ size, color }: { size: number; color: string }) {
  const stroke = Math.max(1.5, size * 0.075);
  const inset = size * 0.06;
  const corner = size * 0.27;
  const radius = size * 0.15;
  const cornerBase = { position: "absolute" as const, width: corner, height: corner, borderColor: color };
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[cornerBase, { left: inset, top: inset, borderLeftWidth: stroke, borderTopWidth: stroke, borderTopLeftRadius: radius }]} />
      <View style={[cornerBase, { right: inset, top: inset, borderRightWidth: stroke, borderTopWidth: stroke, borderTopRightRadius: radius }]} />
      <View style={[cornerBase, { left: inset, bottom: inset, borderLeftWidth: stroke, borderBottomWidth: stroke, borderBottomLeftRadius: radius }]} />
      <View style={[cornerBase, { right: inset, bottom: inset, borderRightWidth: stroke, borderBottomWidth: stroke, borderBottomRightRadius: radius }]} />
      <View style={{ position: "absolute", left: size * 0.34 - stroke / 2, top: size * 0.33, width: stroke, height: size * 0.13, borderRadius: stroke, backgroundColor: color }} />
      <View style={{ position: "absolute", left: size * 0.66 - stroke / 2, top: size * 0.33, width: stroke, height: size * 0.13, borderRadius: stroke, backgroundColor: color }} />
      <View
        style={{
          position: "absolute",
          left: size * 0.44,
          top: size * 0.35,
          width: size * 0.09,
          height: size * 0.19,
          borderRightWidth: stroke,
          borderBottomWidth: stroke,
          borderBottomRightRadius: size * 0.05,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: size * 0.31,
          top: size * 0.56,
          width: size * 0.38,
          height: size * 0.15,
          borderWidth: stroke,
          borderTopColor: "transparent",
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderBottomColor: color,
          borderBottomLeftRadius: size * 0.19,
          borderBottomRightRadius: size * 0.19,
        }}
      />
    </View>
  );
}
