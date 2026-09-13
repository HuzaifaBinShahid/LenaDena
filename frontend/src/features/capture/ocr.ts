import { parseReceiptText } from "@/features/capture/receipt-parser";

type OcrModule = {
  default?: { recognizeText: (uri: string) => Promise<{ text: string }> };
  recognizeText?: (uri: string) => Promise<{ text: string }>;
};

export async function recognizeReceipt(uri: string) {
  try {
    const module = await import("expo-mlkit-ocr") as OcrModule;
    const recognizer = module.default ?? module;
    if (!("recognizeText" in recognizer) || typeof recognizer.recognizeText !== "function") {
      return { available: false as const, text: "", suggestions: {} };
    }
    const result = await recognizer.recognizeText(uri);
    return { available: true as const, text: result.text, suggestions: parseReceiptText(result.text) };
  } catch {
    return { available: false as const, text: "", suggestions: {} };
  }
}
