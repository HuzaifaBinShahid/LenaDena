import { Platform } from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { apiText } from "@/lib/api";
import { exportFileName, exportMimeType, isExportFileName, type ExportFormat } from "./exportRules";

/** "shared": the share sheet was opened. "downloaded": the browser saved it. "unavailable": this device cannot share files. */
export type ExportResult = "shared" | "downloaded" | "unavailable";

function downloadInBrowser(name: string, text: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${mimeType};charset=utf-8` }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Removes earlier exports from the cache. Best effort: a file that will not go is not worth failing for. */
function removeOldExports() {
  try {
    for (const entry of Paths.cache.list()) {
      if (entry instanceof File && isExportFileName(entry.uri.split("/").pop() ?? "")) entry.delete();
    }
  } catch {
    // The cache is cleared by the system anyway.
  }
}

/**
 * Fetches the person's records from the API as a file and hands it over: the share sheet on a phone (save to Files or
 * Drive, send by email), a download in the browser. Rejects with the API's own message (for example when the server
 * has not been updated yet).
 */
export async function exportMyData(format: ExportFormat): Promise<ExportResult> {
  const text = await apiText(`/v1/me/export?format=${format}`);
  const name = exportFileName(format);
  const mimeType = exportMimeType(format);
  if (Platform.OS === "web") {
    downloadInBrowser(name, text, mimeType);
    return "downloaded";
  }
  removeOldExports();
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(text);
  if (!(await Sharing.isAvailableAsync())) return "unavailable";
  await Sharing.shareAsync(file.uri, {
    mimeType,
    dialogTitle: "Your LenaDena records",
    UTI: format === "csv" ? "public.comma-separated-values-text" : "public.json",
  });
  return "shared";
}
