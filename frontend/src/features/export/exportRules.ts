/**
 * The pure parts of Settings -> Export my data: names and types of the files. The file itself is made by the API
 * (`GET /v1/me/export`); `exportFile.ts` saves and shares it.
 */
export type ExportFormat = "csv" | "json";

/** The two choices, and what each holds, in the words shown on screen. */
export const EXPORT_CHOICES: ReadonlyArray<{ format: ExportFormat; title: string; detail: string; icon: "file-text" | "download" }> = [
  { format: "csv", title: "Spreadsheet (CSV)", detail: "Your individual balances, group expenses and payments in one table. Opens in Excel, Numbers or Google Sheets.", icon: "file-text" },
  { format: "json", title: "Everything (JSON)", detail: "All of it, plus your groups, saved people, activity and emails. For keeping a full copy or moving elsewhere.", icon: "download" },
];

/** lenadena-export-2026-11-17.csv, by the phone's own date. */
export function exportFileName(format: ExportFormat, now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `lenadena-export-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.${format}`;
}

export function exportMimeType(format: ExportFormat): string {
  return format === "csv" ? "text/csv" : "application/json";
}

/** Old exports are personal data: any left in the cache from an earlier day is removed before a new one is made. */
export function isExportFileName(name: string): boolean {
  return /^lenadena-export-\d{4}-\d{2}-\d{2}\.(csv|json)$/.test(name);
}
