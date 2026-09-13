export type ReceiptSuggestions = {
  amount?: string;
  date?: string;
  eventName?: string;
};

const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function normalizeDate(value: string) {
  const numeric = value.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (numeric) {
    const [, day, month, yearValue] = numeric;
    const year = yearValue?.length === 2 ? `20${yearValue}` : yearValue;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const named = value.toLowerCase().match(/(\d{1,2})\s+([a-z]{3,9})\s+(\d{4})/);
  if (named) {
    const month = monthNames.findIndex((item) => named[2]?.startsWith(item));
    if (month >= 0) {
      return `${named[3]}-${String(month + 1).padStart(2, "0")}-${String(named[1]).padStart(2, "0")}`;
    }
  }
  return undefined;
}

export function parseReceiptText(text: string): ReceiptSuggestions {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const amountLines = lines.filter((line) => /total|amount|balance/i.test(line));
  const amountCandidates = [...amountLines, ...lines]
    .flatMap((line) => Array.from(line.matchAll(/(?:rs\.?|pkr|usd|eur|£|\$)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/gi)))
    .map((match) => Number(match[1]?.replace(/,/g, "")))
    .filter((value) => Number.isFinite(value) && value > 0 && value < 100000000);
  const amount = amountCandidates.length ? Math.max(...amountCandidates).toFixed(2) : undefined;
  const date = lines.map(normalizeDate).find(Boolean);
  const eventName = lines.find((line) => /[a-z]/i.test(line) && !/invoice|receipt|tax|total|amount/i.test(line))?.slice(0, 80);
  return { amount, date, eventName };
}
