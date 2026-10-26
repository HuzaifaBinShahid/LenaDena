import { afterEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../app.js";
import type { VoiceTranscriber } from "../voice/DeepgramTranscriber.js";

const openApps: FastifyInstance[] = [];

function audioPayload() {
  const boundary = "voice-command-boundary";
  return {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "x-user-id": "demo-user" },
    payload: `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="voice-command.m4a"\r\nContent-Type: audio/m4a\r\n\r\nshort-audio\r\n--${boundary}--\r\n`,
  };
}

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

describe("voice transcription route", () => {
  it("does not accept voice uploads until the backend has a Deepgram key", async () => {
    const { app } = await buildApp({ config: { nodeEnv: "test", authMode: "demo" } });
    openApps.push(app);

    const response = await app.inject({ method: "POST", url: "/v1/voice/transcribe?language=en", ...audioPayload() });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: "voice_unavailable" });
  });

  it("returns text only and passes a short audio clip to the configured provider", async () => {
    const transcribe = vi.fn<VoiceTranscriber["transcribe"]>().mockResolvedValue({ transcript: "I owe Ali 500 rupees for chai" });
    const { app } = await buildApp({ config: { nodeEnv: "test", authMode: "demo" }, voiceTranscriber: { transcribe } });
    openApps.push(app);

    const response = await app.inject({ method: "POST", url: "/v1/voice/transcribe?language=ur", ...audioPayload() });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ transcript: "I owe Ali 500 rupees for chai", provider: "deepgram", language: "ur" });
    expect(transcribe).toHaveBeenCalledWith(expect.objectContaining({ contentType: "audio/m4a", language: "ur" }));
    expect(new TextDecoder().decode(transcribe.mock.calls[0]?.[0].audio)).toBe("short-audio");
  });
});
