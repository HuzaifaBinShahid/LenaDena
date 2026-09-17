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

type AmountCandidate = { value: number; score: number };

function readAmounts(line: string) {
  return Array.from(line.matchAll(/(?:rs\.?|pkr|usd|eur|gbp|£|\$)?\s*([0-9][0-9,]*(?:\.\d{1,2})?)/gi))
    .map((match) => Number(match[1]?.replace(/,/g, "")))
    .filter((value) => Number.isFinite(value) && value > 0 && value < 100000000);
}

/**
 * Receipt labels are more trustworthy than the largest number on a photo: a bill can contain a phone
 * number, invoice number, tax, discount and subtotal. Users still review every suggested value.
 */
function amountScore(line: string) {
  const normalized = line.toLowerCase().replace(/\s+/g, " ");
  if (/grand\s*total|total\s*(amount|due|payable)?|amount\s*(due|payable)|net\s*amount/.test(normalized)) return 100;
  if (/\bbalance\b/.test(normalized)) return 70;
  if (/\bamount\b/.test(normalized)) return 60;
  if (/subtotal|sub-total|tax|vat|gst|service\s*charge|discount|change|cash|tendered/.test(normalized)) return 10;
  return 20;
}

export function parseReceiptText(text: string): ReceiptSuggestions {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const amountCandidates: AmountCandidate[] = lines.flatMap((line) => readAmounts(line).map((value) => ({ value, score: amountScore(line) })));
  const bestAmount = amountCandidates.sort((a, b) => b.score - a.score || b.value - a.value)[0];
  const amount = bestAmount?.value.toFixed(2);
  const date = lines.map(normalizeDate).find(Boolean);
  const eventName = lines.find((line) =>
    /[a-z]/i.test(line) &&
    !/invoice|receipt|tax|total|amount|balance|cash|change|phone|tel/i.test(line) &&
    !normalizeDate(line),
  )?.slice(0, 80);
  return { amount, date, eventName };
}
