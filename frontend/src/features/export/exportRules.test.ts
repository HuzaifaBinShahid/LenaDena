import { describe, expect, it } from "vitest";
import { EXPORT_CHOICES, exportFileName, exportMimeType, isExportFileName } from "./exportRules";

describe("exportFileName", () => {
  it("names the file by the phone's own date and the format", () => {
    expect(exportFileName("csv", new Date(2026, 10, 17, 23, 59))).toBe("lenadena-export-2026-11-17.csv");
    expect(exportFileName("json", new Date(2026, 0, 2, 0, 5))).toBe("lenadena-export-2026-01-02.json");
  });

  it("pads single-digit months and days", () => {
    expect(exportFileName("csv", new Date(2026, 2, 5))).toBe("lenadena-export-2026-03-05.csv");
  });
});

describe("exportMimeType", () => {
  it("is text/csv for the spreadsheet and application/json for the full file", () => {
    expect(exportMimeType("csv")).toBe("text/csv");
    expect(exportMimeType("json")).toBe("application/json");
  });
});

describe("isExportFileName", () => {
  it("recognises only this feature's own files, so cleaning up never touches anything else", () => {
    expect(isExportFileName("lenadena-export-2026-11-17.csv")).toBe(true);
    expect(isExportFileName("lenadena-export-2026-11-17.json")).toBe(true);
    for (const other of ["receipt.jpg", "lenadena-export.csv", "lenadena-export-2026-11-17.csv.bak", "my-lenadena-export-2026-11-17.csv", "lenadena-export-2026-11-17.txt", ""]) {
      expect(isExportFileName(other)).toBe(false);
    }
  });
});

describe("the choices", () => {
  it("offers the spreadsheet first, then everything, and says what each holds", () => {
    expect(EXPORT_CHOICES.map((choice) => choice.format)).toEqual(["csv", "json"]);
    expect(EXPORT_CHOICES[0]!.detail).toMatch(/balances, group expenses and payments/);
    expect(EXPORT_CHOICES[1]!.detail).toMatch(/groups, saved people, activity and emails/);
  });
});
