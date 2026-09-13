export function formatMoney(minor: number, currency = "PKR") {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(minor / 100);
}

export function formatShortDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function formatLongDate(value: string) {
  const date = dateFromIso(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" }).formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const year = parts.find((part) => part.type === "year")?.value;
  return day && month && year ? `${day} ${month} ${year}` : value;
}

export function dateFromIso(value: string) {
  return new Date(`${value}T12:00:00`);
}

export function dateToIso(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toMinorUnits(value: string) {
  const amount = Number(value.replace(/,/g, ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

export function todayDate() {
  return dateToIso(new Date());
}
