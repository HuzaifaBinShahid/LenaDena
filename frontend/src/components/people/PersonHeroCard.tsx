import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { makeStyles, useTheme } from "@/theme/ThemeProvider";

type PersonHeroCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * The contact-card surface for a person (their page and the add/edit preview). It is a brand hero, so it keeps
 * the violet shell gradient in both themes; in dark mode the shell lifts off the night canvas and a lavender
 * hairline marks the edge where a shadow would on light. Content on it uses white text.
 */
export function PersonHeroCard({ children, style }: PersonHeroCardProps) {
  const { colors: c } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.shadow, style]}>
      <View style={styles.clip}>
        <LinearGradient
          pointerEvents="none"
          colors={[c.shell, c.shellEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Soft light from the upper right and a lavender bounce lower left; still decoration, no motion. */}
        <View pointerEvents="none" style={shape.orbTop} />
        <View pointerEvents="none" style={shape.orbBottom} />
        <View style={shape.content}>{children}</View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c, { isDark }) => ({
  shadow: {
    borderRadius: 28,
    backgroundColor: c.shell,
    // Shadows vanish on the night canvas, so dark mode relies on the hairline instead.
    shadowColor: c.violetStrong,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: isDark ? 0 : 0.22,
    shadowRadius: 20,
    elevation: isDark ? 0 : 6,
  },
  clip: {
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: isDark ? 1 : 0,
    borderColor: "rgba(181,165,255,0.16)",
  },
}));

const shape = StyleSheet.create({
  orbTop: {
    position: "absolute",
    right: -70,
    top: -90,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  orbBottom: {
    position: "absolute",
    left: -60,
    bottom: -80,
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: "rgba(181,165,255,0.12)",
  },
  content: {
    padding: 20,
  },
});
