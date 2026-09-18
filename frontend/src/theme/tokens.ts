export const colors = {
  ink: "#171129",
  inkSoft: "#271B4B",
  plum: "#1B103B",
  canvas: "#F5F2FA",
  raised: "#FCFAFF",
  surface: "#EAE4F4",
  violet: "#7657F6",
  violetStrong: "#4B2AA4",
  violetSoft: "#EEE9FF",
  lavender: "#B5A5FF",
  lavenderSoft: "#F0ECFF",
  lime: "#A9F0D6",
  limeSoft: "#E8FAF4",
  mint: "#139A78",
  mintSoft: "#E5F7F1",
  coral: "#E86383",
  coralSoft: "#FDECF1",
  gold: "#C78A35",
  goldSoft: "#FFF3E2",
  slate: "#6E6880",
  muted: "#A39CAF",
  line: "#E3DDEC",
  white: "#FFFFFF",
  // Brighter semantic tints for icons and text on the dark plum shell (toasts, auth, lock screen).
  mintBright: "#6FE0B8",
  coralBright: "#FF8DA6",
  goldBright: "#F4C27A",
  night: "#0D0720",
  // Modal and sheet scrims, and the shadow colour for raised surfaces.
  backdrop: "rgba(16,8,35,0.45)",
  shadow: "#1B103B",
  // The brand's dark shell (Activity header, dock bar, account card) and its gradient end.
  shell: "#1A1037",
  shellEnd: "#6040AE",
} as const;

export const motion = {
  tapIn: 80,
  tapOut: 140,
  screen: 200,
  // Long enough to read the brand line and see the scene settle, without delaying app access.
  splash: 3200,
} as const;
