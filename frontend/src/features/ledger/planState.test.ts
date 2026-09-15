import { describe, expect, it } from "vitest";
import type { Plan } from "@/features/ledger/types";
import { demoPlan } from "./demo-data";
import { getPlanState, isNewAccount } from "./planState";

const placeholder: Plan = {
  user: { id: "loading", name: "Friend", email: "" },
  totals: [],
  groups: [],
  reviews: [],
  claims: [],
  activity: [],
  transactions: [],
};

const brandNew: Plan = {
  ...placeholder,
  user: { id: "user-1", name: "Anna Khan", email: "anna@example.com", createdAt: "2026-09-13T09:00:00.000Z" },
  totals: [{ currency: "PKR", oweMinor: 0, owedMinor: 0 }],
};

describe("getPlanState", () => {
  it("is loading while the placeholder plan shows, unless the connection failed", () => {
    expect(getPlanState(placeholder, "loading")).toBe("loading");
    expect(getPlanState(placeholder, "live")).toBe("loading");
    expect(getPlanState(placeholder, "demo")).toBe("loading");
    expect(getPlanState(placeholder, "error")).toBe("offline");
  });

  it("is empty for a loaded account with nothing in it, including zero totals", () => {
    expect(getPlanState(brandNew, "live")).toBe("empty");
    expect(getPlanState({ ...brandNew, totals: [] }, "live")).toBe("empty");
  });

  it("ignores the activity feed when deciding emptiness", () => {
    const withActivity: Plan = {
      ...brandNew,
      activity: [{ id: "a", icon: "users", title: "Welcome", detail: "", createdAt: "2026-09-13T09:00:00.000Z", tone: "neutral" }],
    };
    expect(getPlanState(withActivity, "live")).toBe("empty");
  });

  it("is ready as soon as any money data exists", () => {
    expect(getPlanState(demoPlan, "demo")).toBe("ready");
    expect(getPlanState({ ...brandNew, groups: demoPlan.groups.slice(0, 1) }, "live")).toBe("ready");
    expect(getPlanState({ ...brandNew, transactions: demoPlan.transactions.slice(0, 1) }, "live")).toBe("ready");
    expect(getPlanState({ ...brandNew, reviews: demoPlan.reviews }, "live")).toBe("ready");
    expect(getPlanState({ ...brandNew, claims: demoPlan.reviews }, "live")).toBe("ready");
    expect(getPlanState({ ...brandNew, totals: [{ currency: "USD", oweMinor: 500, owedMinor: 0 }] }, "live")).toBe("ready");
    expect(getPlanState({ ...brandNew, totals: [{ currency: "USD", oweMinor: 0, owedMinor: 900 }] }, "live")).toBe("ready");
  });

  it("keeps a loaded plan ready or empty when a refresh fails", () => {
    expect(getPlanState(demoPlan, "error")).toBe("ready");
    expect(getPlanState(brandNew, "error")).toBe("empty");
  });
});

describe("isNewAccount", () => {
  const now = new Date("2026-09-14T09:00:00.000Z").getTime();

  it("is new when createdAt is missing or unreadable", () => {
    expect(isNewAccount(placeholder, now)).toBe(true);
    expect(isNewAccount({ ...brandNew, user: { ...brandNew.user, createdAt: "garbage" } }, now)).toBe(true);
  });

  it("is new for accounts younger than seven days", () => {
    expect(isNewAccount(brandNew, now)).toBe(true);
    expect(isNewAccount({ ...brandNew, user: { ...brandNew.user, createdAt: "2026-09-07T09:00:00.001Z" } }, now)).toBe(true);
  });

  it("is not new from seven days on", () => {
    expect(isNewAccount({ ...brandNew, user: { ...brandNew.user, createdAt: "2026-09-07T09:00:00.000Z" } }, now)).toBe(false);
    expect(isNewAccount(demoPlan, new Date("2026-10-01T00:00:00.000Z").getTime())).toBe(false);
  });

  it("defaults now to the current time", () => {
    expect(isNewAccount({ ...brandNew, user: { ...brandNew.user, createdAt: new Date().toISOString() } })).toBe(true);
    expect(isNewAccount({ ...brandNew, user: { ...brandNew.user, createdAt: "2020-01-01T00:00:00.000Z" } })).toBe(false);
  });
});
