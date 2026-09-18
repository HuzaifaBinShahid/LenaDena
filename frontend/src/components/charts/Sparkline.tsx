import { memo, useMemo } from "react";
import { View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { sparkPath } from "@/lib/curve";
import { useTheme } from "@/theme/ThemeProvider";
import { colors } from "@/theme/tokens";

export type SparklineProps = {
  values: readonly number[];
  tone: "positive" | "negative" | "neutral";
  /** The card surface behind the end dot. */
  ringColor: string;
  /** Default 60. */
  width?: number;
  /** Default 30. */
  height?: number;
};

// The end dot (r 3.5 plus half of its 2pt ring) must stay inside the box, so the curve keeps 5pt of padding.
const PAD = 5;

/** Static trend line from the shared monotone curve (D8). An empty or flat series is a dashed lavender line with no dot. */
export const Sparkline = memo(function Sparkline({ values, tone, ringColor, width = 60, height = 30 }: SparklineProps) {
  const { colors: c } = useTheme();
  const spark = useMemo(() => sparkPath(values, width, height, PAD), [values, width, height]);
  // Mint and coral follow the theme (brighter on dark cards); lavender already reads on both.
  const color = spark.flat || tone === "neutral" ? colors.lavender : tone === "positive" ? c.mint : c.coral;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width, height }}
    >
      <Svg width={width} height={height}>
        <Path
          d={spark.d}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={spark.flat ? [4, 4] : undefined}
        />
        {spark.flat ? null : (
          <Circle cx={spark.end.x} cy={spark.end.y} r={3.5} fill={color} stroke={ringColor} strokeWidth={2} />
        )}
      </Svg>
    </View>
  );
});
