import { describe, expect, it } from "vitest";
import { darkPalette } from "../../theme/palettes";
import { colors } from "../../theme/tokens";
import { groupSkin, groupSkinTone } from "./groupSkin";

/** WCAG 2 contrast ratio between two "#RRGGBB" colours. */
function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const channel = (offset: number) => {
      const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

const SEED_ACCENTS = ["#6657E8", "#168AAD", "#16A77E", "#E88B3D", "#EC6075"];

describe("groupSkin: seed accents", () => {
  it("#6657E8 is the violet skin", () => {
    expect(groupSkin("#6657E8")).toEqual({ key: "violet", name: "Lavender", disc: colors.lavender, discOpacity: 0.9, tint: colors.violetSoft, icon: colors.violet });
  });

  it("#168AAD is the indigo skin", () => {
    expect(groupSkin("#168AAD")).toEqual({ key: "indigo", name: "Violet", disc: colors.violet, discOpacity: 0.95, tint: colors.lavenderSoft, icon: colors.violetStrong });
  });

  it("#16A77E is the mint skin", () => {
    expect(groupSkin("#16A77E")).toEqual({ key: "mint", name: "Mint", disc: colors.lime, discOpacity: 0.85, tint: colors.limeSoft, icon: colors.mint });
  });

  it("#E88B3D is the gold skin", () => {
    expect(groupSkin("#E88B3D")).toEqual({ key: "gold", name: "Gold", disc: colors.goldBright, discOpacity: 0.85, tint: colors.goldSoft, icon: colors.gold });
  });

  it("#EC6075 is the rose skin", () => {
    expect(groupSkin("#EC6075")).toEqual({ key: "rose", name: "Rose", disc: colors.coralBright, discOpacity: 0.8, tint: colors.coralSoft, icon: colors.coral });
  });

  it("accepts lowercase, short and hashless hex", () => {
    expect(groupSkin("#16a77e").key).toBe("mint");
    expect(groupSkin(" 16A77E ").key).toBe("mint");
    expect(groupSkin("#F80").key).toBe("gold");
  });

  it("returns a stable object per skin", () => {
    expect(groupSkin("#6657E8")).toBe(groupSkin(undefined));
  });
});

describe("groupSkin: fallbacks", () => {
  it("uses violet for missing or invalid accents", () => {
    expect(groupSkin().key).toBe("violet");
    expect(groupSkin(null).key).toBe("violet");
    expect(groupSkin("").key).toBe("violet");
    expect(groupSkin("#12345").key).toBe("violet");
    expect(groupSkin("#GGGGGG").key).toBe("violet");
    expect(groupSkin("teal").key).toBe("violet");
    expect(groupSkin("rgb(22, 167, 126)").key).toBe("violet");
  });

  it("uses violet for greys and near-greys", () => {
    expect(groupSkin("#888888").key).toBe("violet");
    expect(groupSkin("#000000").key).toBe("violet");
    expect(groupSkin("#FFFFFF").key).toBe("violet");
    expect(groupSkin("#8A8580").key).toBe("violet"); // saturation ≈ .04
    expect(groupSkin("#927F6C").key).toBe("violet"); // saturation ≈ .1496, just under .15
  });

  it("keeps the real hue once saturation reaches .15", () => {
    expect(groupSkin("#937F6C").key).toBe("gold"); // saturation ≈ .1529, hue ≈ 29
    expect(groupSkin("#9C7A6E").key).toBe("rose"); // saturation ≈ .19, hue ≈ 16
  });
});

describe("groupSkin: hue boundaries", () => {
  // Every colour below has an exact hue, so the lower bound of each bucket is inclusive.
  it("235 starts violet, just below is indigo", () => {
    expect(groupSkin("#0014F0").key).toBe("violet"); // 235
    expect(groupSkin("#0018F0").key).toBe("indigo"); // 234
  });

  it("170 starts indigo, just below is mint", () => {
    expect(groupSkin("#00F0C8").key).toBe("indigo"); // 170
    expect(groupSkin("#00F0C4").key).toBe("mint"); // 169
  });

  it("70 starts mint, just below is gold", () => {
    expect(groupSkin("#C8F000").key).toBe("mint"); // 70
    expect(groupSkin("#CCF000").key).toBe("gold"); // 69
  });

  it("20 starts gold, just below is rose", () => {
    expect(groupSkin("#F05000").key).toBe("gold"); // 20
    expect(groupSkin("#F04C00").key).toBe("rose"); // 19
  });

  it("330 starts rose, just below is violet, and rose wraps through red", () => {
    expect(groupSkin("#F00078").key).toBe("rose"); // 330
    expect(groupSkin("#F0007C").key).toBe("violet"); // 329
    expect(groupSkin("#FF0000").key).toBe("rose"); // 0
    expect(groupSkin("#FF0004").key).toBe("rose"); // 359
  });
});

describe("groupSkinTone", () => {
  it("light is the skin's own tint and icon, unchanged", () => {
    for (const accent of SEED_ACCENTS) {
      const skin = groupSkin(accent);
      expect(groupSkinTone(skin, "light")).toEqual({ tint: skin.tint, icon: skin.icon });
    }
  });

  it("dark never uses a light pastel tint", () => {
    const pastels = new Set<string>([colors.violetSoft, colors.lavenderSoft, colors.limeSoft, colors.goldSoft, colors.coralSoft]);
    const darkTints = new Set<string>([darkPalette.violetSoft, darkPalette.lavenderSoft, darkPalette.limeSoft, darkPalette.goldSoft, darkPalette.coralSoft]);
    for (const accent of SEED_ACCENTS) {
      const { tint } = groupSkinTone(groupSkin(accent), "dark");
      expect(pastels.has(tint)).toBe(false);
      expect(darkTints.has(tint)).toBe(true);
    }
  });

  it("dark icons keep at least 3:1 against their tile and against the dark canvas", () => {
    for (const accent of SEED_ACCENTS) {
      const { tint, icon } = groupSkinTone(groupSkin(accent), "dark");
      expect(contrast(icon, tint)).toBeGreaterThanOrEqual(3);
      expect(contrast(icon, darkPalette.canvas)).toBeGreaterThanOrEqual(3);
    }
  });

  it("returns a stable object per skin and scheme", () => {
    expect(groupSkinTone(groupSkin("#6657E8"), "dark")).toBe(groupSkinTone(groupSkin(undefined), "dark"));
    expect(groupSkinTone(groupSkin("#16A77E"), "light")).toBe(groupSkinTone(groupSkin("#16a77e"), "light"));
  });
});
