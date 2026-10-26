import type { Person } from "@/features/ledger/types";

export type VoiceLanguage = "en" | "ur";

export type VoiceDraft = {
  transcript: string;
  amountMinor?: number;
  currency: string;
  kind: "expense" | "loan";
  direction?: "incoming" | "outgoing";
  counterparty?: string;
  eventDate: string;
  title?: string;
  /** Visible in the review sheet. An incomplete draft can only be edited, never saved. */
  missing: Array<"amount" | "direction" | "person" | "title">;
};

export type ParseVoiceDraftOptions = {
  people: readonly Pick<Person, "name">[];
  today: string;
  defaultCurrency: string;
};

function normalise(value: string) {
  return value.toLocaleLowerCase().replace(/[،,.!?;:]/g, " ").replace(/\s+/g, " ").trim();
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const numberWords: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

function wordsAmount(text: string) {
  let total = 0;
  let current = 0;
  let found = false;
  for (const word of text.split(" ")) {
    if (word === "and") continue;
    if (numberWords[word] !== undefined) { current += numberWords[word] ?? 0; found = true; }
    else if (word === "hundred") { current = Math.max(1, current) * 100; found = true; }
    else if (word === "thousand" || word === "hazaar" || word === "hazar") { total += Math.max(1, current) * 1000; current = 0; found = true; }
    else if (word === "lakh" || word === "lac") { total += Math.max(1, current) * 100000; current = 0; found = true; }
  }
  return found ? total + current : undefined;
}

function parseAmount(text: string) {
  const match = /(?:rs|rupees?|pkr|₨|\$)?\s*(\d[\d,]*(?:\.\d+)?)(?:\s*(k|thousand|hazaar|hazar|lakh|lac))?\b/i.exec(text);
  if (match) {
    const numeric = Number(match[1]?.replace(/,/g, ""));
    const suffix = match[2]?.toLowerCase();
    const multiplier = suffix === "k" || suffix === "thousand" || suffix === "hazaar" || suffix === "hazar" ? 1000 : suffix === "lakh" || suffix === "lac" ? 100000 : 1;
    if (Number.isFinite(numeric) && numeric > 0) return numeric * multiplier;
  }
  return wordsAmount(text);
}

function matchKnownPerson(text: string, people: readonly Pick<Person, "name">[]) {
  const normalised = normalise(text);
  return people
    .map((person) => ({ person, name: normalise(person.name) }))
    .filter(({ name }) => name && normalised.includes(name))
    .sort((left, right) => right.name.length - left.name.length)[0]?.person.name;
}

function extractedPerson(text: string) {
  const patterns = [
    /(?:i owe|owe|i lent|i gave|i paid for|borrowed from|borrow from|lent me|give)\s+([\p{L}][\p{L}\s'-]{0,78}?)(?=\s+(?:\d|rs|rupees?|pkr|for|today|yesterday|$))/iu,
    /(?:to|from|with)\s+([\p{L}][\p{L}\s'-]{0,78}?)(?=\s+(?:\d|rs|rupees?|pkr|for|today|yesterday|$))/iu,
    /^([\p{L}][\p{L}\s'-]{0,78}?)\s+(?:owes?|lent|paid)/iu,
  ];
  for (const pattern of patterns) {
    const name = pattern.exec(text)?.[1]?.trim().replace(/\s+(?:me|him|her|them)$/i, "");
    if (name && name.length <= 80) return name;
  }
  return undefined;
}

function directionOf(text: string): VoiceDraft["direction"] {
  if (/(?:i owe|i borrowed|borrowed from|lent me|he paid for me|she paid for me|mujhe .* dena hai|دینا ہے)/iu.test(text)) return "outgoing";
  if (/(?:owes me|i lent|i gave|i paid for|i covered|lena hai|لینا ہے)/iu.test(text)) return "incoming";
  return undefined;
}

function titleOf(text: string) {
  const title = /\bfor\s+(.+?)(?=\s+(?:today|yesterday|on)\b|$)/i.exec(text)?.[1]?.trim();
  return title && title.length <= 80 ? title.replace(/^(?:the|a)\s+/i, "") : undefined;
}

/** Conservative parser for short private-balance commands. It leaves uncertain fields blank rather than inventing them. */
export function parseVoiceDraft(transcript: string, options: ParseVoiceDraftOptions): VoiceDraft {
  const text = normalise(transcript);
  const amount = parseAmount(text);
  const counterparty = matchKnownPerson(text, options.people) ?? extractedPerson(text);
  const direction = directionOf(text);
  const title = titleOf(text);
  const missing: VoiceDraft["missing"] = [];
  if (!amount) missing.push("amount");
  if (!direction) missing.push("direction");
  if (!counterparty) missing.push("person");
  if (!title) missing.push("title");
  return {
    transcript: transcript.trim(),
    ...(amount ? { amountMinor: Math.round(amount * 100) } : {}),
    currency: /(?:rs|rupees?|pkr|₨)/i.test(text) ? "PKR" : options.defaultCurrency,
    kind: /\b(?:loan|lent|borrowed|cash)\b/i.test(text) ? "loan" : "expense",
    ...(direction ? { direction } : {}),
    ...(counterparty ? { counterparty } : {}),
    eventDate: /\byesterday\b/i.test(text) ? addDays(options.today, -1) : options.today,
    ...(title ? { title } : {}),
    missing,
  };
}

export function isCompleteVoiceDraft(draft: VoiceDraft): draft is VoiceDraft & Required<Pick<VoiceDraft, "amountMinor" | "direction" | "counterparty" | "title">> {
  return draft.missing.length === 0 && Boolean(draft.amountMinor && draft.direction && draft.counterparty && draft.title);
}
