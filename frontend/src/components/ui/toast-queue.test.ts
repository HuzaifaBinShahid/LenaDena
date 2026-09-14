import { describe, expect, it } from "vitest";
import { enqueueToast, MAX_VISIBLE_TOASTS, toastDuration, type ToastRecord } from "./toast-queue";

const toast = (id: number, title = `Toast ${id}`, message?: string): ToastRecord => ({ id, title, message, tone: "info" });

describe("toast queue", () => {
  it("shows the newest toast first and caps the stack", () => {
    let queue: ToastRecord[] = [];
    for (let id = 1; id <= 5; id += 1) queue = enqueueToast(queue, toast(id));
    expect(queue.map((item) => item.id)).toEqual([5, 4, 3]);
    expect(queue).toHaveLength(MAX_VISIBLE_TOASTS);
  });

  it("replaces a repeated message instead of stacking copies", () => {
    const queue = enqueueToast([toast(1, "Saved"), toast(2, "Other")], toast(3, "Saved"));
    expect(queue.map((item) => item.id)).toEqual([3, 2]);
  });

  it("keeps errors, long messages and actionable toasts on screen longer", () => {
    expect(toastDuration({ tone: "error" })).toBeGreaterThan(toastDuration({ tone: "success" }));
    expect(toastDuration({ tone: "info", message: "x".repeat(80) })).toBeGreaterThan(toastDuration({ tone: "info" }));
    expect(toastDuration({ tone: "info", action: { label: "View", onPress: () => undefined } })).toBeGreaterThan(toastDuration({ tone: "info" }));
    expect(toastDuration({ tone: "error", duration: 900 })).toBe(900);
  });
});
