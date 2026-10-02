import { Router } from "express";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { config } from "../config.js";
import { Readable } from "node:stream";

export const ttsRouter = Router();

ttsRouter.get("/", async (req, res) => {
  const text = (req.query.text as string | undefined)?.trim();
  const lang = (req.query.lang as string | undefined) || "en";

  if (!text) {
    res.status(400).json({ error: { code: "invalid_params", message: "text query parameter is required." } });
    return;
  }

  // Clean and sanitize text for SSML/XML (ampersands, angle brackets, markdown symbols)
  const cleanText = text
    .replace(/&/g, " and ")
    .replace(/</g, " ")
    .replace(/>/g, " ")
    .replace(/[*_~`#|]/g, " ")
    .replace(/\+/g, " plus ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);

  // 1. Try OpenAI TTS only if direct OpenAI API key is provided (not OpenRouter)
  const isDirectOpenAi = config.openaiApiKey && !config.openaiApiKey.startsWith("sk-or-") && !config.openaiBaseUrl?.includes("openrouter");
  if (isDirectOpenAi && config.ttsProvider === "openai") {
    try {
      const oaiRes = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "tts-1",
          voice: lang === "ur" ? "nova" : "nova", // nova is friendly, warm and female
          input: cleanText,
        }),
      });

      if (oaiRes.ok && oaiRes.body) {
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Cache-Control", "public, max-age=86400");
        Readable.fromWeb(oaiRes.body as import("node:stream/web").ReadableStream).pipe(res);
        return;
      }
    } catch (err) {
      console.warn("[tts] OpenAI TTS failed, falling back to Neural Edge TTS:", err);
    }
  }

  // 2. High-fidelity Neural Edge TTS (zero-cost, no key required, realistic human voice)
  try {
    const tts = new MsEdgeTTS();
    const voice = lang === "ur" ? "ur-PK-UzmaNeural" : "en-US-JennyNeural";
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const result = tts.toStream(cleanText);

    const chunks: Buffer[] = [];
    result.audioStream.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    result.audioStream.on("error", (err: Error) => {
      console.warn("[tts] audioStream error:", err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: { code: "tts_failed", message: "Failed to synthesize speech." } });
      }
    });

    result.audioStream.on("end", () => {
      const fullBuffer = Buffer.concat(chunks);
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Length", fullBuffer.byteLength);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.end(fullBuffer);
    });
  } catch (err) {
    console.error("[tts] Neural Edge TTS error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: { code: "tts_failed", message: "Failed to synthesize speech." } });
    }
  }
});

ttsRouter.post("/", async (req, res) => {
  const text = (req.body?.text as string | undefined)?.trim();
  const lang = (req.body?.lang as string | undefined) || "en";

  if (!text) {
    res.status(400).json({ error: { code: "invalid_params", message: "text in request body is required." } });
    return;
  }

  req.query.text = text;
  req.query.lang = lang;
  // Forward to GET handler
  // @ts-expect-error simple delegation
  ttsRouter.handle({ ...req, method: "GET" }, res);
});
