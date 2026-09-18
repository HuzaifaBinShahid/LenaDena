import { describe, expect, it } from "vitest";
import { cleanText, escapeHtml, formatEmailDate, formatMoney } from "./format.js";
import { loadEmailLogo } from "./logo.js";

const NBSP = String.fromCharCode(160);

describe("email formatting", () => {
  it("formats money like formatMoney in the app", () => {
    expect(formatMoney(240000, "PKR")).toBe(`Rs${NBSP}2,400`);
    expect(formatMoney("240000", " pkr ")).toBe(`Rs${NBSP}2,400`);
    expect(formatMoney(4550, "USD")).toBe("US$46");
    expect(formatMoney(0, "PKR")).toBe(`Rs${NBSP}0`);
  });

  it("returns nothing rather than a wrong amount", () => {
    expect(formatMoney(240000, undefined)).toBeUndefined();
    expect(formatMoney(240000, "")).toBeUndefined();
    expect(formatMoney(240000, "RUPEES")).toBeUndefined();
    expect(formatMoney(undefined, "PKR")).toBeUndefined();
    expect(formatMoney("12.50", "PKR")).toBeUndefined();
    expect(formatMoney(Number.NaN, "PKR")).toBeUndefined();
    expect(formatMoney(1.5, "PKR")).toBeUndefined();
  });

  it("formats dates day-first", () => {
    expect(formatEmailDate("2026-09-14")).toBe("14 September 2026");
    expect(formatEmailDate("2026-09-21T10:00:00.000Z")).toBe("21 September 2026");
    expect(formatEmailDate("soon")).toBeUndefined();
    expect(formatEmailDate(20260914)).toBeUndefined();
  });

  it("cleans payload text to one bounded line", () => {
    expect(cleanText("  Dinner\r\n at\tKolachi  ")).toBe("Dinner at Kolachi");
    expect(cleanText({ toString: () => "x" })).toBeUndefined();
    expect(cleanText("   ")).toBeUndefined();
    expect(cleanText("a".repeat(300), 10)).toBe(`${"a".repeat(9)}…`);
  });

  it("escapes HTML text and attributes", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });
});

describe("email logo", () => {
  it("embeds the bundled PNG as an inline attachment", () => {
    const logo = loadEmailLogo();
    expect(logo.src).toBe("cid:email-logo@lenadena");
    expect(logo.attachments).toHaveLength(1);
    expect(logo.attachments[0]?.cid).toBe("email-logo@lenadena");
    expect(logo.attachments[0]?.content.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });

  it("prefers a hosted logo URL", () => {
    expect(loadEmailLogo("https://cdn.example.com/logo.png")).toEqual({ src: "https://cdn.example.com/logo.png", attachments: [] });
  });
});
