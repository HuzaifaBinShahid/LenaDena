import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text as NativeText, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  LinearTransition,
  SlideInRight,
  SlideOutRight,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon, type IconName } from "@/components/ui/Icon";
import { enqueueToast, toastDuration, type ToastOptions, type ToastRecord, type ToastTone } from "@/components/ui/toast-queue";
import { colors } from "@/theme/tokens";

export type { ToastOptions, ToastTone } from "@/components/ui/toast-queue";

type ToastApi = {
  /** Returns the toast id for a later `dismiss(id)`. */
  show: (options: ToastOptions) => number;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  dismiss: (id?: number) => void;
};

const SWIPE_DISMISS_DISTANCE = 72;

const tones: Record<ToastTone, { color: string; icon: IconName; haptic?: Haptics.NotificationFeedbackType }> = {
  success: { color: colors.mintBright, icon: "check-circle", haptic: Haptics.NotificationFeedbackType.Success },
  error: { color: colors.coralBright, icon: "alert-circle", haptic: Haptics.NotificationFeedbackType.Error },
  warning: { color: colors.goldBright, icon: "warning", haptic: Haptics.NotificationFeedbackType.Warning },
  info: { color: colors.lavender, icon: "info" },
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id?: number) => {
    setToasts((current) => (id === undefined ? [] : current.filter((item) => item.id !== id)));
  }, []);

  const show = useCallback((options: ToastOptions) => {
    const record: ToastRecord = { ...options, tone: options.tone ?? "info", id: nextId.current++ };
    setToasts((current) => enqueueToast(current, record));
    const haptic = tones[record.tone].haptic;
    if (haptic !== undefined) void Haptics.notificationAsync(haptic).catch(() => undefined);
    AccessibilityInfo.announceForAccessibility(record.message ? `${record.title}. ${record.message}` : record.title);
    return record.id;
  }, []);

  const api = useMemo<ToastApi>(() => ({
    show,
    success: (title, message) => {
      show({ title, message, tone: "success" });
    },
    error: (title, message) => {
      show({ title, message, tone: "error" });
    },
    warning: (title, message) => {
      show({ title, message, tone: "warning" });
    },
    info: (title, message) => {
      show({ title, message, tone: "info" });
    },
    dismiss,
  }), [dismiss, show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}

function ToastViewport({ toasts, onDismiss }: { toasts: ToastRecord[]; onDismiss: (id: number) => void }) {
  const insets = useSafeAreaInsets();
  return createElement(
    View,
    {
      pointerEvents: "box-none",
      style: [styles.viewport, { top: insets.top + 8, left: Math.max(insets.left, 12), right: Math.max(insets.right, 12) }],
    },
    toasts.map((toast) => <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />),
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastRecord; onDismiss: (id: number) => void }) {
  const reduceMotion = useReducedMotion();
  const tone = tones[toast.tone];
  const offset = useSharedValue(0);
  const dismissing = useSharedValue(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remaining = useRef(toastDuration(toast));
  const startedAt = useRef(0);
  const mounted = useRef(true);

  const close = useCallback(() => onDismiss(toast.id), [onDismiss, toast.id]);

  const resume = useCallback(() => {
    // A tap can dismiss the toast before the gesture's finalize callback reaches the JS thread.
    if (!mounted.current) return;
    if (timer.current) clearTimeout(timer.current);
    startedAt.current = Date.now();
    timer.current = setTimeout(close, remaining.current);
  }, [close]);

  const pause = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    // Leave enough time to finish reading once the finger lifts.
    remaining.current = Math.max(remaining.current - (Date.now() - startedAt.current), 1400);
  }, []);

  useEffect(() => {
    mounted.current = true;
    resume();
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [resume]);

  const swipe = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-16, 16])
    .onBegin(() => {
      scheduleOnRN(pause);
    })
    .onUpdate((event) => {
      // Follow the finger to the right; resist dragging toward the screen centre.
      offset.value = event.translationX > 0 ? event.translationX : event.translationX * 0.18;
    })
    .onEnd((event) => {
      if (event.translationX > SWIPE_DISMISS_DISTANCE || event.velocityX > 650) {
        dismissing.value = true;
        offset.value = withTiming(440, { duration: 170 }, (finished) => {
          if (finished) {
            scheduleOnRN(close);
            return;
          }
          // A second touch caught the toast mid-exit; hand control back to that gesture.
          dismissing.value = false;
        });
        return;
      }
      offset.value = withSpring(0, { damping: 18, stiffness: 260 });
    })
    .onFinalize(() => {
      if (!dismissing.value) scheduleOnRN(resume);
    });

  const dragStyle = useAnimatedStyle(() => ({
    opacity: interpolate(offset.value, [0, 260], [1, 0.15], Extrapolation.CLAMP),
    transform: [{ translateX: offset.value }],
  }));

  const entering = reduceMotion ? FadeIn.duration(140) : SlideInRight.springify().damping(19).stiffness(200).mass(0.9);
  const exiting = reduceMotion ? FadeOut.duration(120) : SlideOutRight.duration(220);
  const layout = reduceMotion ? undefined : LinearTransition.springify().damping(22).stiffness(220);

  return createElement(
    Animated.View,
    { entering, exiting, layout, style: styles.slot },
    <GestureDetector gesture={swipe}>
      {createElement(
        Animated.View,
        { style: [styles.dragLayer, dragStyle] },
        createElement(
          Pressable,
          {
            onPress: close,
            accessibilityRole: "alert",
            accessibilityLiveRegion: "polite",
            accessibilityLabel: toast.message ? `${toast.title}. ${toast.message}` : toast.title,
            accessibilityHint: "Double tap to dismiss",
            style: styles.card,
          },
          createElement(View, { style: [styles.iconFrame, { backgroundColor: `${tone.color}24` }] }, <Icon name={tone.icon} size={18} color={tone.color} />),
          createElement(
            View,
            { style: styles.copy },
            createElement(NativeText, { numberOfLines: 2, style: styles.title }, toast.title),
            toast.message ? createElement(NativeText, { numberOfLines: 4, style: styles.message }, toast.message) : null,
            toast.action
              ? createElement(
                Pressable,
                {
                  onPress: () => {
                    toast.action?.onPress();
                    close();
                  },
                  accessibilityRole: "button",
                  hitSlop: 6,
                  style: ({ pressed }: { pressed: boolean }) => [styles.action, pressed && styles.actionPressed],
                },
                createElement(NativeText, { style: styles.actionLabel }, toast.action.label),
                <Icon name="arrow-right" size={13} color={colors.lavender} />,
              )
              : null,
          ),
          createElement(View, { style: styles.close, importantForAccessibility: "no" }, <Icon name="close" size={15} color="rgba(255,255,255,0.4)" />),
        ),
      )}
    </GestureDetector>,
  );
}

const styles = StyleSheet.create({
  viewport: {
    position: "absolute",
    // Highest layer on both platforms (Android orders siblings by elevation): above the lock screen and splash.
    zIndex: 1000,
    elevation: 100,
    alignItems: "flex-end",
    gap: 8,
  },
  slot: {
    width: "100%",
    maxWidth: 400,
  },
  dragLayer: {
    width: "100%",
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(22,13,46,0.97)",
    paddingLeft: 12,
    paddingRight: 10,
    paddingVertical: 12,
    shadowColor: colors.night,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.34,
    shadowRadius: 26,
    elevation: 18,
  },
  iconFrame: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  copy: {
    minWidth: 0,
    flex: 1,
    paddingTop: 1,
  },
  title: {
    color: colors.white,
    fontFamily: "Manrope_700Bold",
    fontSize: 14,
    lineHeight: 19,
  },
  message: {
    marginTop: 2,
    color: "rgba(240,236,255,0.68)",
    fontFamily: "Manrope_500Medium",
    fontSize: 12.5,
    lineHeight: 17,
  },
  action: {
    marginTop: 9,
    alignSelf: "flex-start",
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 10,
    backgroundColor: "rgba(181,165,255,0.14)",
    paddingHorizontal: 11,
  },
  actionPressed: {
    opacity: 0.7,
  },
  actionLabel: {
    color: colors.lavender,
    fontFamily: "Manrope_700Bold",
    fontSize: 12.5,
  },
  close: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
