import { useId } from "react";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

/*
 * The LenaDena mark: a gold coin split in two, the halves sliding apart — money shared between
 * two people. Same geometry as the app icon (frontend/assets/brand-mark.svg), with the 24° tilt
 * and the rim offset baked into the paths so react-native-svg needs no transforms.
 */
const VIEW_BOX = "216.4 221.4 591.3 591.3";
const PATHS = {
  leftRim: "M 593.2 287.7 A 224 224 0 0 0 411 697 Z",
  rightRim: "M 613 371 A 224 224 0 0 1 430.8 780.3 Z",
  leftFace: "M 593.2 253.7 A 224 224 0 0 0 411 663 Z",
  rightFace: "M 613 337 A 224 224 0 0 1 430.8 746.3 Z",
  leftRing: "M 565.9 315.1 A 156.8 156.8 0 0 0 438.3 601.6",
  rightRing: "M 585.7 398.4 A 156.8 156.8 0 0 1 458.1 684.9",
  shine: "M 417.1 307.7 A 192.6 192.6 0 0 1 536.8 270.3",
} as const;
/** Rounds the halves' corners; the viewBox already leaves room for it. */
const ROUNDING = 26;

export function CoinMark({ size }: { size: number }) {
  const idBase = useId().replace(/[^A-Za-z0-9_-]/g, "");
  const face = `coin-face-${idBase}`;
  const rim = `coin-rim-${idBase}`;
  const shape = (paint: string) => ({ fill: paint, stroke: paint, strokeWidth: ROUNDING, strokeLinejoin: "round" as const });

  return (
    <Svg width={size} height={size} viewBox={VIEW_BOX} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Defs>
        <LinearGradient id={face} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFE8AE" />
          <Stop offset="0.55" stopColor="#FACB6A" />
          <Stop offset="1" stopColor="#F1AE43" />
        </LinearGradient>
        <LinearGradient id={rim} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#D9953A" />
          <Stop offset="1" stopColor="#A9681B" />
        </LinearGradient>
      </Defs>
      <Path d={PATHS.leftRim} {...shape(`url(#${rim})`)} />
      <Path d={PATHS.rightRim} {...shape(`url(#${rim})`)} />
      <Path d={PATHS.leftFace} {...shape(`url(#${face})`)} />
      <Path d={PATHS.rightFace} {...shape(`url(#${face})`)} />
      <Path d={PATHS.leftRing} fill="none" stroke="#B8761E" strokeOpacity={0.38} strokeWidth={15} strokeLinecap="round" />
      <Path d={PATHS.rightRing} fill="none" stroke="#B8761E" strokeOpacity={0.38} strokeWidth={15} strokeLinecap="round" />
      <Path d={PATHS.shine} fill="none" stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={14} strokeLinecap="round" />
    </Svg>
  );
}
