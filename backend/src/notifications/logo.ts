import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const EMAIL_LOGO_CID = "email-logo@lenadena";

export type InlineAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
  cid: string;
  contentDisposition: "inline";
};

export type EmailLogo = {
  /** Value for the <img src>; undefined means the header shows only the "LenaDena" wordmark. */
  src?: string;
  attachments: InlineAttachment[];
};

/**
 * The PNG lives in src/notifications/assets. tsx runs this module from src/, the compiled worker
 * from dist/notifications/ (the build script copies the assets there; the second candidate
 * reaches back into src/ when a build skipped that step).
 */
export function findEmailLogoFile(): string | undefined {
  const candidates = [new URL("./assets/email-logo.png", import.meta.url), new URL("../../src/notifications/assets/email-logo.png", import.meta.url)];
  return candidates.map((candidate) => fileURLToPath(candidate)).find((path) => existsSync(path));
}

/** A hosted logo URL wins; otherwise the bundled PNG is embedded as an inline CID attachment. */
export function loadEmailLogo(logoUrl?: string): EmailLogo {
  if (logoUrl) return { src: logoUrl, attachments: [] };
  const path = findEmailLogoFile();
  if (!path) return { attachments: [] };
  return {
    src: `cid:${EMAIL_LOGO_CID}`,
    attachments: [{ filename: "lenadena-logo.png", content: readFileSync(path), contentType: "image/png", cid: EMAIL_LOGO_CID, contentDisposition: "inline" }],
  };
}
