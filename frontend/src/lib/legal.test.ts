import { describe, expect, it } from "vitest";
import { legalPageUrl } from "./legal";

describe("legalPageUrl", () => {
  it("puts the page on the API's host", () => {
    expect(legalPageUrl("privacy", "https://lena-dena-backend.vercel.app")).toBe("https://lena-dena-backend.vercel.app/privacy");
    expect(legalPageUrl("delete-account", "https://lena-dena-backend.vercel.app")).toBe("https://lena-dena-backend.vercel.app/delete-account");
  });

  it("does not double the slash when the setting ends with one, or with spaces", () => {
    expect(legalPageUrl("privacy", " https://api.example.com/// ")).toBe("https://api.example.com/privacy");
  });

  it("falls back to the local API when nothing is set, like the rest of the app", () => {
    expect(legalPageUrl("privacy", undefined)).toBe("http://localhost:3000/privacy");
    expect(legalPageUrl("privacy", "   ")).toBe("http://localhost:3000/privacy");
  });
});
