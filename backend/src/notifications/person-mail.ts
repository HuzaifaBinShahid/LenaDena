import { cleanText } from "./format.js";
import { parseStatement } from "./statement.js";
import { renderStatementPdf, statementFileName } from "./statement-pdf.js";

/** Outbox event types that go to a saved person (an email address with no LenaDena account behind it). */
export const PERSON_EMAIL_EVENTS: ReadonlySet<string> = new Set(["person_statement", "person_entry", "person_reminder"]);

export type PersonMailExtras = {
  /** Replies go to the person who owns the account, not to the shared "from" address. */
  replyTo?: { name: string; address: string };
  attachments: Array<{ filename: string; content: Buffer; contentType: string }>;
};

const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;

/**
 * What the worker adds to a person email beyond the rendered message: the owner's address as Reply-To (so "just
 * reply to this email" is true), and for a statement the PDF. Events that are not person emails get nothing. A
 * missing or odd owner address only drops the Reply-To; the email still goes out.
 */
export async function personMailExtras(eventType: string, payload: Record<string, unknown>): Promise<PersonMailExtras> {
  if (!PERSON_EMAIL_EVENTS.has(eventType)) return { attachments: [] };
  const extras: PersonMailExtras = { attachments: [] };
  const address = cleanText(payload.ownerEmail, 254);
  if (address && EMAIL.test(address)) extras.replyTo = { name: cleanText(payload.ownerName, 80) ?? "", address };
  if (eventType === "person_statement") {
    const statement = parseStatement(payload);
    extras.attachments.push({ filename: statementFileName(statement), content: await renderStatementPdf(statement), contentType: "application/pdf" });
  }
  return extras;
}
