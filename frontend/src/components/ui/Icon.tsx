import type { ComponentProps } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";

const icons = {
  "alert-circle": "alert-circle-outline",
  "arrow-left": "arrow-back",
  "arrow-right": "arrow-forward",
  "arrow-down": "arrow-down",
  "arrow-up": "arrow-up",
  "arrow-up-right": "arrow-up-right-box-outline",
  calendar: "calendar-clear-outline",
  cash: "cash-outline",
  check: "checkmark",
  "check-circle": "checkmark-circle",
  "chevron-right": "chevron-forward",
  close: "close",
  clock: "time-outline",
  "credit-card": "card-outline",
  download: "download-outline",
  "file-text": "receipt-outline",
  filter: "funnel-outline",
  grid: "grid-outline",
  image: "image-outline",
  "log-out": "log-out-outline",
  mail: "mail-outline",
  maximize: "scan-outline",
  mic: "mic-outline",
  options: "options-outline",
  plus: "add",
  pulse: "pulse-outline",
  scan: "scan-outline",
  send: "paper-plane-outline",
  sparkles: "sparkles",
  square: "stop",
  star: "star",
  "trash-2": "trash-outline",
  user: "person-outline",
  "user-plus": "person-add-outline",
  users: "people-outline",
  wallet: "wallet-outline",
} as const satisfies Record<string, ComponentProps<typeof Ionicons>["name"]>;

export type IconName = keyof typeof icons;

type IconProps = {
  name: IconName;
  size?: number;
  color: string;
};

export function Icon({ name, size = 20, color }: IconProps) {
  return <Ionicons name={icons[name]} size={size} color={color} />;
}
