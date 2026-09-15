import { createElement } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";
import Svg, { Rect } from "react-native-svg";

export type DashedOutlineProps = {
  width: number;
  height: number;
  radius: number;
  color: string;
  /** Default 1.5. */
  strokeWidth?: number;
  /** Dash and gap lengths. Default [5, 4]. Ignored when `dashCount` is set. */
  dash?: readonly [number, number];
  /** Spread exactly this many dashes evenly around the outline (55% dash, 45% gap), so the pattern closes without a seam. */
  dashCount?: number;
  style?: StyleProp<ViewStyle>;
};

const DEFAULT_DASH = [5, 4] as const;

/**
 * Dashed border drawn with SVG, because native dashed view borders are unreliable on Android (D16).
 * It is absolutely positioned at the parent's top-left and ignores touches; a circle is `radius = width / 2`.
 */
export function DashedOutline({ width, height, radius, color, strokeWidth = 1.5, dash = DEFAULT_DASH, dashCount, style }: DashedOutlineProps) {
  if (!(width > 0) || !(height > 0)) return null;
  const inset = strokeWidth / 2;
  // The Rect is inset by half the stroke so the whole stroke stays inside the box.
  const w = Math.max(0, width - strokeWidth);
  const h = Math.max(0, height - strokeWidth);
  if (!(w > 0) || !(h > 0)) return null;
  const rx = Math.max(0, Math.min(radius - inset, w / 2, h / 2));
  // A zero-length dash pattern can stall the native dash path effect, so both lengths stay positive.
  let dashArray: number[] = [Math.max(0.5, dash[0]), Math.max(0.5, dash[1])];
  if (dashCount && dashCount > 0) {
    // Perimeter of the drawn rounded rect: p = 2(w + h) − (8 − 2π)·r.
    const perimeter = 2 * (w + h) - (8 - 2 * Math.PI) * rx;
    const segment = perimeter / Math.round(dashCount);
    dashArray = [round(segment * 0.55), round(segment * 0.45)];
  }

  return createElement(
    View,
    {
      pointerEvents: "none",
      accessibilityElementsHidden: true,
      importantForAccessibility: "no-hide-descendants",
      style: [styles.frame, { width, height }, style],
    },
    <Svg width={width} height={height}>
      <Rect
        x={inset}
        y={inset}
        width={w}
        height={h}
        rx={rx}
        ry={rx}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray}
        strokeLinecap="round"
      />
    </Svg>,
  );
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

const styles = StyleSheet.create({
  frame: {
    position: "absolute",
    left: 0,
    top: 0,
  },
});
