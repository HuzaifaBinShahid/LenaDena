import { describe, expect, it } from "vitest";
import type { TabKey } from "@/features/ledger/types";
import { palettes } from "../../theme/palettes";
import { clearColor, homeChrome } from "./homeChrome";

const TABS: readonly TabKey[] = ["plan", "groups", "reviews", "activity"];

describe("homeChrome: light theme keeps today's chrome", () => {
  const light = palettes.light;

  it("Plan and Reviews sit on the canvas with dark status-bar content", () => {
    for (const tab of ["plan", "reviews"] as const) {
      expect(homeChrome(tab, light, false)).toEqual({ surface: "#F5F2FA", surfaceClear: "rgba(245, 242, 250, 0)", tone: "light", statusBar: "dark" });
    }
  });

  it("Groups uses the lavender wash", () => {
    expect(homeChrome("groups", light, false)).toEqual({ surface: "#F0ECFF", surfaceClear: "rgba(240, 236, 255, 0)", tone: "light", statusBar: "dark" });
  });

  it("Activity uses the dark shell with light status-bar content", () => {
    expect(homeChrome("activity", light, false)).toEqual({ surface: "#1A1037", surfaceClear: "rgba(26, 16, 55, 0)", tone: "dark", statusBar: "light" });
  });
});

describe("homeChrome: dark theme", () => {
  const dark = palettes.dark;

  it("follows the dark palette on every tab", () => {
    expect(homeChrome("plan", dark, true).surface).toBe(dark.canvas);
    expect(homeChrome("reviews", dark, true).surface).toBe(dark.canvas);
    expect(homeChrome("groups", dark, true).surface).toBe(dark.lavenderSoft);
    expect(homeChrome("activity", dark, true).surface).toBe(dark.shell);
  });

  it("shows light status-bar content on every tab", () => {
    for (const tab of TABS) expect(homeChrome(tab, dark, true).statusBar).toBe("light");
  });

  it("keeps Activity as the only dark-tone header", () => {
    expect(TABS.filter((tab) => homeChrome(tab, dark, true).tone === "dark")).toEqual(["activity"]);
  });
});

describe("homeChrome: scrim fade", () => {
  it("every top surface in both themes has a fully transparent twin of the same colour", () => {
    for (const scheme of ["light", "dark"] as const) {
      for (const tab of TABS) {
        const { surface, surfaceClear } = homeChrome(tab, palettes[scheme], scheme === "dark");
        expect(surface).toMatch(/^#[0-9A-F]{6}$/i);
        const r = parseInt(surface.slice(1, 3), 16);
        const g = parseInt(surface.slice(3, 5), 16);
        const b = parseInt(surface.slice(5, 7), 16);
        expect(surfaceClear).toBe(`rgba(${r}, ${g}, ${b}, 0)`);
      }
    }
  });
});

describe("clearColor", () => {
  it("reads 3-, 6- and 8-digit hex", () => {
    expect(clearColor("#fff")).toBe("rgba(255, 255, 255, 0)");
    expect(clearColor("#110B22")).toBe("rgba(17, 11, 34, 0)");
    expect(clearColor("#110B22CC")).toBe("rgba(17, 11, 34, 0)");
  });

  it("reads rgb() and rgba()", () => {
    expect(clearColor("rgb(3, 1, 10)")).toBe("rgba(3, 1, 10, 0)");
    expect(clearColor("rgba(3,1,10,0.62)")).toBe("rgba(3, 1, 10, 0)");
  });

  it("falls back to transparent for anything else", () => {
    expect(clearColor("violet")).toBe("transparent");
    expect(clearColor("#12345")).toBe("transparent");
    expect(clearColor("")).toBe("transparent");
  });
});
