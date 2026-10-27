import { DomainError } from "../domain/errors.js";

export type VoiceLanguage = "en" | "ur";

export type VoiceTranscribeInput = {
  audio: Uint8Array;
  contentType: string;
  language: VoiceLanguage;
  /** Names are hints only; Deepgram never receives account IDs or financial history. */
  vocabulary: string[];
};

export type VoiceTranscribeResult = { transcript: string };

export interface VoiceTranscriber {
  transcribe(input: VoiceTranscribeInput): Promise<VoiceTranscribeResult>;
}

type DeepgramResponse = {
  results?: {
    channels?: Array<{
      alternatives?: Array<{ transcript?: string }>;
    }>;
  };
};

/** The small part of a Fetch response the Deepgram adapter needs. Kept structural so server build environments that
 * provide a Node HTTP `Response` global do not shadow the web Fetch response type. */
type DeepgramFetchResponse = {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
};

type DeepgramFetcher = (url: URL, init: {
  method: "POST";
  headers: Record<string, string>;
  body: Uint8Array;
}) => Promise<DeepgramFetchResponse>;

const DEEPGRAM_URL = "https://api.deepgram.com/v1/listen";

/**
 * A deliberately tiny wrapper around Deepgram's pre-recorded REST endpoint. It receives an in-memory short voice
 * clip and immediately discards it after the upstream request completes. The mobile client never receives this key.
 */
export class DeepgramTranscriber implements VoiceTranscriber {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: DeepgramFetcher = fetch as unknown as DeepgramFetcher,
  ) {}

  async transcribe({ audio, contentType, language, vocabulary }: VoiceTranscribeInput): Promise<VoiceTranscribeResult> {
    const url = new URL(DEEPGRAM_URL);
    url.searchParams.set("model", "nova-3");
    url.searchParams.set("language", language);
    url.searchParams.set("smart_format", "true");
    // Financial amounts are interpreted again by our parser, but formatted numerals improve the review card.
    url.searchParams.set("numerals", "true");
    for (const term of vocabulary.slice(0, 100)) url.searchParams.append("keyterm", term);

    let response: DeepgramFetchResponse;
    try {
      response = await this.fetcher(url, {
        method: "POST",
        headers: {
          authorization: `Token ${this.apiKey}`,
          "content-type": contentType,
        },
        body: audio,
      });
    } catch {
      throw new DomainError("Voice transcription is unavailable. Check your connection and try again.", 503, "voice_unavailable");
    }
    if (!response.ok) {
      const status = response.status === 429 ? 429 : 503;
      throw new DomainError(
        status === 429 ? "Voice transcription is busy. Please try again shortly." : "Voice transcription is unavailable. Please try again.",
        status,
        status === 429 ? "voice_rate_limited" : "voice_unavailable",
      );
    }
    const payload = await response.json().catch(() => null) as DeepgramResponse | null;
    const transcript = payload?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim();
    if (!transcript) throw new DomainError("We couldn't hear a clear command. Please try again or type it instead.", 422, "voice_no_transcript");
    return { transcript };
  }
}
