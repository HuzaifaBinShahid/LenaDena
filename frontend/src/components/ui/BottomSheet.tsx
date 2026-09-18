import { createElement, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { LayoutChangeEvent, StyleProp, ViewStyle } from "react-native";
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type AccessibilityActionEvent } from "react-native";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { useScreenObscured } from "@/components/ui/ScreenObscured";
import { shadows } from "@/theme/shadows";
import { makeStyles } from "@/theme/ThemeProvider";

export type BottomSheetProps = {
  visible: boolean;
  /**
   * Called once the sheet has finished closing after the person dismissed it (drag, fling, scrim tap, Android back,
   * screen-reader escape). Setting `visible` to false from the parent also plays the close animation.
   */
  onClose: () => void;
  /** What the sheet is, e.g. "Refine activity". Names the handle and the close affordance for screen readers. */
  title: string;
  /** Sits under the handle and drags the sheet together with it. */
  header?: ReactNode;
  /** The scrollable body. Dragging it scrolls; drag the handle or header to move the sheet. */
  children: ReactNode;
  /** Pinned below the body, above the safe-area inset. */
  footer?: ReactNode;
  /** Two snap points: collapsed (content height, up to ~60% of the screen) and expanded (up to ~92%). */
  expandable?: boolean;
  bodyContentStyle?: StyleProp<ViewStyle>;
};

/** A drag past this share of the collapsed height dismisses; less snaps back. */
const DISMISS_SHARE = 0.25;
/** Downward speed (pt/s) that dismisses (or collapses an expanded sheet) whatever the distance. */
const FLING_VELOCITY = 1000;
const SNAP_VELOCITY = 500;
const COLLAPSED_SHARE = 0.6;
const EXPANDED_SHARE = 0.92;
/** Below this gain an expandable sheet keeps a single snap point: expanding would only add blank space. */
const MIN_EXPAND_GAIN = 24;
/** How far the rubber band can stretch above the top snap. */
const RUBBER_LIMIT = 72;
/** Sheet colour painted under the bottom edge, so a spring overshoot or rubber band never shows a gap. */
const TAIL = 160;
const OPEN_SPRING = { damping: 26, stiffness: 240, mass: 1 };
const SNAP_SPRING = { damping: 30, stiffness: 280, mass: 1 };
const CLOSE_TIMING = { duration: 230, easing: Easing.out(Easing.cubic) };
const FADE_IN = { duration: 180 };
const FADE_OUT = { duration: 140 };

type Layouts = { top: number; footer: number; content: number };

/**
 * The one bottom sheet: springs up over a fading scrim, drags down to dismiss (or up/down between two snap points
 * when `expandable`), rubber-bands above its top snap, and only reports `onClose` once it has left the screen.
 * Reduced motion swaps every spring for a short fade. Hidden while the app lock covers the screen.
 */
export function BottomSheet({ visible, onClose, title, header, children, footer, expandable = false, bodyContentStyle }: BottomSheetProps) {
  const obscured = useScreenObscured();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const styles = useStyles();

  const [mounted, setMounted] = useState(visible);
  const [natural, setNatural] = useState(0);
  const [expandedState, setExpandedState] = useState(false);
  const layouts = useRef<Partial<Layouts>>({});
  const opened = useRef(false);
  const closing = useRef(false);
  const dismissedByUser = useRef(false);

  // UI-thread state. `sheetHeight` is the laid-out height; `offset` pushes the sheet down (positive) or lifts it
  // for the rubber band (negative). The visible height is `sheetHeight - offset`.
  const sheetHeight = useSharedValue(0);
  const offset = useSharedValue(0);
  const fade = useSharedValue(0);
  const collapsedSV = useSharedValue(0);
  const expandedSV = useSharedValue(0);
  const expandedSnap = useSharedValue(false);
  const busy = useSharedValue(false);
  const dragStart = useSharedValue(0);

  const bottomPadding = Math.max(insets.bottom + 12, 24);
  const maxHeight = Math.max(0, Math.min(windowHeight * EXPANDED_SHARE, windowHeight - insets.top - 8));
  const collapsedHeight = natural ? Math.min(natural, expandable ? windowHeight * COLLAPSED_SHARE : maxHeight) : 0;
  const expandedCandidate = expandable && natural ? Math.min(natural, maxHeight) : collapsedHeight;
  const canExpand = expandedCandidate - collapsedHeight >= MIN_EXPAND_GAIN;
  const expandedHeight = canExpand ? expandedCandidate : collapsedHeight;

  // --- lifecycle -------------------------------------------------------------------------------------------------

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const finishClose = useCallback(() => {
    if (!closing.current) return;
    closing.current = false;
    opened.current = false;
    layouts.current = {};
    sheetHeight.value = 0;
    offset.value = 0;
    fade.value = 0;
    expandedSnap.value = false;
    busy.value = false;
    setExpandedState(false);
    setNatural(0);
    setMounted(false);
    if (dismissedByUser.current) {
      dismissedByUser.current = false;
      onCloseRef.current();
    }
  }, [busy, expandedSnap, fade, offset, sheetHeight]);

  const animateOut = useCallback((byUser: boolean) => {
    if (closing.current) return;
    closing.current = true;
    dismissedByUser.current = byUser;
    busy.value = true;
    if (reduceMotion || !opened.current) {
      fade.value = withTiming(0, FADE_OUT, (finished) => {
        if (finished) scheduleOnRN(finishClose);
      });
      return;
    }
    offset.value = withTiming(sheetHeight.value + TAIL, CLOSE_TIMING, (finished) => {
      if (finished) scheduleOnRN(finishClose);
    });
  }, [busy, fade, finishClose, offset, reduceMotion, sheetHeight]);

  const dismiss = useCallback(() => animateOut(true), [animateOut]);

  const animateIn = useCallback(() => {
    busy.value = false;
    if (reduceMotion) {
      offset.value = 0;
      fade.value = withTiming(1, FADE_IN);
      return;
    }
    fade.value = 1;
    offset.value = withSpring(0, OPEN_SPRING);
  }, [busy, fade, offset, reduceMotion]);

  useEffect(() => {
    if (visible) {
      if (!mounted) {
        setMounted(true);
        return;
      }
      if (closing.current) {
        // Reopened mid-close: turn around from wherever the sheet is.
        closing.current = false;
        dismissedByUser.current = false;
        animateIn();
      }
      return;
    }
    if (mounted) animateOut(false);
  }, [animateIn, animateOut, mounted, visible]);

  // First open once the content has been measured: start just below the screen edge and spring up.
  useEffect(() => {
    if (!mounted || !collapsedHeight || opened.current || closing.current) return;
    opened.current = true;
    collapsedSV.value = collapsedHeight;
    expandedSV.value = expandedHeight;
    sheetHeight.value = collapsedHeight;
    offset.value = reduceMotion ? 0 : collapsedHeight + TAIL;
    animateIn();
  }, [animateIn, collapsedHeight, collapsedSV, expandedHeight, expandedSV, mounted, offset, reduceMotion, sheetHeight]);

  // Content or window size changed while open: follow the new snap points.
  useEffect(() => {
    collapsedSV.value = collapsedHeight;
    expandedSV.value = expandedHeight;
    if (!opened.current || closing.current || !collapsedHeight) return;
    if (!canExpand && expandedSnap.value) {
      expandedSnap.value = false;
      setExpandedState(false);
    }
    const target = expandedSnap.value ? expandedHeight : collapsedHeight;
    sheetHeight.value = reduceMotion ? target : withTiming(target, { duration: 200 });
  }, [canExpand, collapsedHeight, collapsedSV, expandedHeight, expandedSV, expandedSnap, reduceMotion, sheetHeight]);

  // --- measuring -------------------------------------------------------------------------------------------------

  const hasFooter = footer !== undefined && footer !== null && footer !== false;
  const measure = useCallback(() => {
    const { top, footer: footerHeight, content } = layouts.current;
    if (top === undefined || content === undefined || (hasFooter && footerHeight === undefined)) return;
    const next = Math.ceil(top + content + (hasFooter ? footerHeight ?? 0 : 0) + bottomPadding + BORDER);
    setNatural((current) => (Math.abs(current - next) < 1 ? current : next));
  }, [bottomPadding, hasFooter]);

  useEffect(measure, [measure]);

  const onTopLayout = (event: LayoutChangeEvent) => {
    layouts.current.top = event.nativeEvent.layout.height;
    measure();
  };
  const onFooterLayout = (event: LayoutChangeEvent) => {
    layouts.current.footer = event.nativeEvent.layout.height;
    measure();
  };
  const onContentSize = (_width: number, height: number) => {
    layouts.current.content = height;
    measure();
  };

  // --- snapping --------------------------------------------------------------------------------------------------

  /** Runs on either thread; returns whether the sheet ends up expanded. */
  const applySnap = useCallback((expand: boolean) => {
    "worklet";
    const target = expand ? expandedSV.value : collapsedSV.value;
    const expanded = expand && expandedSV.value > collapsedSV.value;
    expandedSnap.value = expanded;
    sheetHeight.value = reduceMotion ? withTiming(target, { duration: 120 }) : withSpring(target, SNAP_SPRING);
    offset.value = reduceMotion ? withTiming(0, { duration: 120 }) : withSpring(0, SNAP_SPRING);
    return expanded;
  }, [collapsedSV, expandedSV, expandedSnap, offset, reduceMotion, sheetHeight]);

  const snapTo = (expand: boolean) => {
    "worklet";
    scheduleOnRN(setExpandedState, applySnap(expand));
  };

  const toggleExpanded = () => {
    if (!canExpand || closing.current) return;
    setExpandedState(applySnap(!expandedSnap.value));
  };

  const pan = Gesture.Pan()
    .activeOffsetY([-6, 6])
    .onStart(() => {
      dragStart.value = sheetHeight.value - offset.value;
    })
    .onUpdate((event) => {
      if (busy.value) return;
      const low = collapsedSV.value;
      const high = expandedSV.value;
      let visibleHeight = dragStart.value - event.translationY;
      if (visibleHeight > high) {
        // Rubber band: the further past the top snap, the less the sheet follows the finger.
        const over = visibleHeight - high;
        visibleHeight = high + RUBBER_LIMIT * (1 - 1 / (over / RUBBER_LIMIT + 1));
      }
      if (visibleHeight >= low) {
        sheetHeight.value = Math.min(visibleHeight, high);
        offset.value = visibleHeight > high ? high - visibleHeight : 0;
      } else {
        sheetHeight.value = low;
        offset.value = low - visibleHeight;
      }
    })
    .onEnd((event) => {
      if (busy.value) return;
      const low = collapsedSV.value;
      const high = expandedSV.value;
      const visibleHeight = sheetHeight.value - offset.value;
      const velocity = event.velocityY;
      if (visibleHeight < low) {
        if (low - visibleHeight > low * DISMISS_SHARE || velocity > FLING_VELOCITY) {
          scheduleOnRN(dismiss);
          return;
        }
        snapTo(false);
        return;
      }
      if (high - low < 1) {
        snapTo(false);
        return;
      }
      if (velocity < -SNAP_VELOCITY) snapTo(true);
      else if (velocity > SNAP_VELOCITY) snapTo(false);
      else snapTo(visibleHeight - low > (high - low) / 2);
    });

  // --- styles ----------------------------------------------------------------------------------------------------

  const sheetStyle = useAnimatedStyle(() => {
    const measured = sheetHeight.value > 0;
    return {
      height: measured ? sheetHeight.value : maxHeight,
      opacity: measured ? fade.value : 0,
      transform: [{ translateY: offset.value }],
    };
  }, [maxHeight]);

  const scrimStyle = useAnimatedStyle(() => {
    const travel = collapsedSV.value > 0 ? collapsedSV.value : 1;
    return { opacity: fade.value * interpolate(offset.value, [0, travel], [1, 0], Extrapolation.CLAMP) };
  });

  // --- accessibility ---------------------------------------------------------------------------------------------

  const handleActions = [
    { name: "activate" as const },
    ...(canExpand ? [{ name: expandedState ? "collapse" : "expand", label: expandedState ? "Collapse" : "Expand" }] : []),
    { name: "dismiss", label: "Close" },
  ];
  const onHandleAction = (event: AccessibilityActionEvent) => {
    const action = event.nativeEvent.actionName;
    if (action === "dismiss") dismiss();
    else if (action === "expand" || action === "collapse") toggleExpanded();
    else if (action === "activate") {
      if (canExpand) toggleExpanded();
      else dismiss();
    }
  };

  if (!mounted) return null;

  const handle = createElement(
    Pressable,
    {
      onPress: canExpand ? toggleExpanded : undefined,
      accessibilityRole: "button",
      accessibilityLabel: `${title} sheet`,
      accessibilityHint: canExpand
        ? expandedState ? "Double tap to collapse. Swipe up or down for more actions." : "Double tap to expand. Swipe up or down for more actions."
        : "Double tap to close.",
      accessibilityState: canExpand ? { expanded: expandedState } : {},
      accessibilityActions: handleActions,
      onAccessibilityAction: onHandleAction,
      hitSlop: { top: 6, bottom: 6, left: 24, right: 24 },
      style: styles.handleHit,
    },
    <View style={styles.handle} />,
  );

  const sheet = createElement(
    Animated.View,
    { style: [styles.sheet, { maxHeight, paddingBottom: bottomPadding }, sheetStyle] },
    <View pointerEvents="none" style={styles.tail} />,
    <GestureDetector gesture={pan}>
      <View collapsable={false} onLayout={onTopLayout} style={styles.top}>
        {handle}
        {header ? <View style={styles.header}>{header}</View> : null}
      </View>
    </GestureDetector>,
    <ScrollView
      style={styles.body}
      contentContainerStyle={[styles.bodyContent, bodyContentStyle]}
      onContentSizeChange={onContentSize}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      bounces={expandedState || (natural > 0 && natural > collapsedHeight)}
    >
      {children}
    </ScrollView>,
    hasFooter ? <View onLayout={onFooterLayout} style={styles.footer}>{footer}</View> : null,
  );

  return (
    <Modal
      visible={!obscured}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={dismiss}
    >
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.root} accessibilityViewIsModal onAccessibilityEscape={dismiss}>
          {createElement(
            Animated.View,
            { style: [StyleSheet.absoluteFill, styles.scrim, scrimStyle] },
            createElement(Pressable, {
              style: StyleSheet.absoluteFill,
              onPress: dismiss,
              accessibilityRole: "button",
              accessibilityLabel: `Close ${title}`,
            }),
          )}
          {sheet}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

/** The dark theme's 1px border adds to the height the sheet needs. */
const BORDER = 1;

const useStyles = makeStyles((c, { isDark }) => ({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  scrim: {
    backgroundColor: c.backdrop,
  },
  sheet: {
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: c.raised,
    paddingHorizontal: 20,
    // Dark: the hairline is what lifts the sheet off the scrim (shadows vanish). Light: the shadow does it.
    ...(isDark
      ? { borderWidth: 1, borderBottomWidth: 0, borderColor: c.line }
      : { ...shadows.sheet, shadowColor: c.shadow }),
  },
  tail: {
    position: "absolute",
    top: "100%",
    left: isDark ? -1 : 0,
    right: isDark ? -1 : 0,
    height: TAIL,
    backgroundColor: c.raised,
    ...(isDark ? { borderLeftWidth: 1, borderRightWidth: 1, borderColor: c.line } : {}),
  },
  top: {
    // The whole handle + header block is the drag target.
    backgroundColor: "transparent",
  },
  handleHit: {
    alignSelf: "center",
    width: 88,
    paddingTop: 12,
    paddingBottom: 18,
    alignItems: "center",
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    // The line colour is too faint for a grab handle on the dark sheet; a soft slate reads without shouting.
    backgroundColor: isDark ? "rgba(167,159,195,0.32)" : c.line,
  },
  header: {
    paddingBottom: 4,
  },
  body: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minHeight: 0,
  },
  bodyContent: {
    paddingTop: 14,
    paddingBottom: 16,
  },
  footer: {},
}));
