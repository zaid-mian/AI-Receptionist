import "dotenv/config";

function num(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: num("PORT", 8787),
  businessTimezone: process.env.BUSINESS_TIMEZONE || "Asia/Karachi",
  dataDir: process.env.DATA_DIR || "./data",
  openaiApiKey: process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || (process.env.OPENROUTER_API_KEY ? "openai/gpt-4o-mini" : "gpt-4o-mini"),
  openaiBaseUrl: process.env.OPENAI_BASE_URL || (process.env.OPENROUTER_API_KEY ? "https://openrouter.ai/api/v1" : ""),
  openaiMaxTokens: num("OPENAI_MAX_TOKENS", 250),
  ttsProvider: process.env.TTS_PROVIDER || "edge",
  jwtSecret: process.env.JWT_SECRET || "faisal_receptionist_jwt_secret_fallback_key_2026",
  adminEmail: process.env.ADMIN_EMAIL || "admin@faisalhospital.pk",
  adminDefaultPassword: process.env.ADMIN_DEFAULT_PASSWORD || "Admin@Faisal2026",
  version: "0.1.0",
} as const;

export const engineName = config.openaiApiKey ? "openai" : "demo-brain";
