import { describe, expect, it } from "vitest";
import { buildInviteMessage, cleanDownloadUrl, inviteShareTitle } from "./invite";

const LINK = "https://i.loadly.io/lenadena";

describe("buildInviteMessage", () => {
  it("builds a structured message with first names and the download link", () => {
    expect(buildInviteMessage({ personName: "  Mani Ahmed ", inviterName: "Huzaifa Bin Shahid", downloadUrl: LINK })).toBe(
      "Hi Mani! 👋\n\n"
        + "Huzaifa invited you to LenaDena — the app we use to keep track of what we owe each other. It never moves money; it just keeps the tab clear for both of us.\n\n"
        + `📲 Get the Android app: ${LINK}\n\n`
        + "See you there!",
    );
  });

  it("asks for the link from the inviter when there is none", () => {
    for (const downloadUrl of [undefined, "", "  ", "http://i.loadly.io/x", "javascript:alert(1)"]) {
      const message = buildInviteMessage({ personName: "Mani", inviterName: "Huzaifa", downloadUrl });
      expect(message).toContain("📲 Ask Huzaifa for the app link.");
      expect(message).not.toContain("Get the Android app");
      expect(message).not.toContain("undefined");
    }
  });

  it("reads naturally without names", () => {
    const message = buildInviteMessage({ personName: "", inviterName: undefined, downloadUrl: undefined });
    expect(message.startsWith("Hi! 👋\n\nYou're invited to LenaDena — ")).toBe(true);
    expect(message).toContain("📲 Ask me for the app link.");
    expect(message).not.toMatch(/undefined|null/);
  });

  it("keeps paragraphs separated by one blank line", () => {
    const message = buildInviteMessage({ personName: "Mani", inviterName: "Huzaifa", downloadUrl: LINK });
    expect(message.split("\n\n")).toHaveLength(4);
    expect(message).not.toMatch(/\n{3,}/);
  });
});

describe("invite helpers", () => {
  it("titles the share with the inviter's first name", () => {
    expect(inviteShareTitle("Huzaifa Bin Shahid")).toBe("Huzaifa invited you to LenaDena");
    expect(inviteShareTitle("")).toBe("You're invited to LenaDena");
  });

  it("accepts only plain https download links", () => {
    expect(cleanDownloadUrl(` ${LINK} `)).toBe(LINK);
    for (const value of [undefined, null, "", "http://i.loadly.io/x", "https://", "https://a b", `https://x.io/${"a".repeat(2000)}`]) {
      expect(cleanDownloadUrl(value)).toBeUndefined();
    }
  });
});
