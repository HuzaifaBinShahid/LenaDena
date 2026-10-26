import type { FastifyPluginAsyncTypebox } from "@fastify/type-provider-typebox";
import type { AppConfig } from "../config.js";
import { DomainError } from "../domain/errors.js";
import { ErrorSchema, VoiceTranscribeQuerySchema, VoiceTranscribeResponseSchema } from "../http/schemas.js";
import { DeepgramTranscriber, type VoiceTranscriber } from "../voice/DeepgramTranscriber.js";

type VoiceRoutesOptions = {
  config: Pick<AppConfig, "deepgramApiKey">;
  transcriber?: VoiceTranscriber;
};

const AUDIO_TYPES = new Set(["audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp4", "audio/m4a", "audio/aac", "audio/ogg", "audio/webm"]);
const errorResponses = { 400: ErrorSchema, 401: ErrorSchema, 413: ErrorSchema, 422: ErrorSchema, 429: ErrorSchema, 503: ErrorSchema };

/**
 * Transcribes a short, private voice command. This endpoint creates no ledger record: it returns text only, and the
 * app turns that text into a reviewable draft before its ordinary idempotent write path is ever called.
 */
export const voiceRoutes: FastifyPluginAsyncTypebox<VoiceRoutesOptions> = async (fastify, { config, transcriber }) => {
  const provider = transcriber ?? (config.deepgramApiKey ? new DeepgramTranscriber(config.deepgramApiKey) : undefined);

  fastify.post("/voice/transcribe", {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    schema: {
      tags: ["voice"],
      security: [{ bearerAuth: [] }],
      querystring: VoiceTranscribeQuerySchema,
      consumes: ["multipart/form-data"],
      response: { 200: VoiceTranscribeResponseSchema, ...errorResponses },
    },
  }, async (request) => {
    if (!provider) throw new DomainError("Voice transcription is not configured. Add DEEPGRAM_API_KEY to the backend environment and restart the server.", 503, "voice_unavailable");
    const upload = await request.file();
    if (!upload) throw new DomainError("Attach a short voice recording and try again.", 400, "voice_audio_missing");
    if (!AUDIO_TYPES.has(upload.mimetype)) throw new DomainError("That recording format isn't supported. Please try recording again.", 400, "voice_audio_type");
    const audio = await upload.toBuffer();
    if (!audio.byteLength) throw new DomainError("We couldn't hear a clear command. Please try again.", 422, "voice_no_audio");

    const plan = await fastify.ledger.getPlan(request.authUser.id);
    const vocabulary = Array.from(new Set([
      ...plan.people.map((person) => person.name),
      ...plan.groups.flatMap((group) => [group.name, ...group.members.map((member) => member.name)]),
    ].map((value) => value.trim()).filter(Boolean)));
    const result = await provider.transcribe({
      audio,
      contentType: upload.mimetype,
      language: request.query.language,
      vocabulary,
    });
    return { transcript: result.transcript, provider: "deepgram" as const, language: request.query.language };
  });
};
