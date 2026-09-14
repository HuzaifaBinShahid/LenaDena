export type ToastTone = "success" | "error" | "warning" | "info";

export type ToastOptions = {
  title: string;
  message?: string;
  tone?: ToastTone;
  /** Milliseconds before the toast leaves on its own. Defaults to a tone- and length-aware value. */
  duration?: number;
  action?: { label: string; onPress: () => void };
};

export type ToastRecord = ToastOptions & { id: number; tone: ToastTone };

export const MAX_VISIBLE_TOASTS = 3;

const baseDurations: Record<ToastTone, number> = {
  success: 3200,
  info: 3600,
  warning: 4400,
  error: 5200,
};

/** Errors and longer messages stay longer; an action adds time to reach for it. */
export function toastDuration(toast: Pick<ToastRecord, "tone" | "message" | "duration" | "action">) {
  if (toast.duration) return toast.duration;
  const reading = Math.min((toast.message?.length ?? 0) * 28, 2600);
  return baseDurations[toast.tone] + reading + (toast.action ? 1500 : 0);
}

/** Newest first, an identical message replaces its earlier copy, and the stack never exceeds the limit. */
export function enqueueToast(current: ToastRecord[], next: ToastRecord) {
  const withoutDuplicate = current.filter((item) => item.title !== next.title || item.message !== next.message);
  return [next, ...withoutDuplicate].slice(0, MAX_VISIBLE_TOASTS);
}
