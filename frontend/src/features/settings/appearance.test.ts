import { describe, expect, it } from "vitest";
import { APPEARANCE_OPTIONS, appearanceHint } from "./appearance";

describe("appearance picker copy", () => {
  it("offers Light, Dark and System in that order", () => {
    expect(APPEARANCE_OPTIONS.map((option) => option.key)).toEqual(["light", "dark", "system"]);
    expect(APPEARANCE_OPTIONS.map((option) => option.label)).toEqual(["Light", "Dark", "System"]);
    expect(APPEARANCE_OPTIONS.find((option) => option.key === "system")?.hint).toBe("Follows your phone's light or dark setting");
  });

  it("names the look the phone is showing when following the system", () => {
    expect(appearanceHint("system", "dark")).toEqual({ text: "Follows your phone — currently ", emphasis: "Dark" });
    expect(appearanceHint("system", "light")).toEqual({ text: "Follows your phone — currently ", emphasis: "Light" });
  });

  it("says a fixed look ignores the phone, whatever the phone shows", () => {
    for (const scheme of ["light", "dark"] as const) {
      expect(appearanceHint("light", scheme)).toEqual({ text: "Stays light, whatever your phone uses" });
      expect(appearanceHint("dark", scheme)).toEqual({ text: "Stays dark, whatever your phone uses" });
    }
  });
});
