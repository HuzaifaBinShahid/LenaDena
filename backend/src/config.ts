export type AppConfig = {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  corsOrigin: string;
  authMode: "demo" | "supabase";
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  supabaseSecretKey?: string;
};

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const authMode = overrides.authMode ?? (process.env.AUTH_MODE === "supabase" ? "supabase" : "demo");
  const supabaseUrl = overrides.supabaseUrl ?? process.env.SUPABASE_URL;
  const supabasePublishableKey = overrides.supabasePublishableKey ?? process.env.SUPABASE_PUBLISHABLE_KEY;
  const supabaseSecretKey = overrides.supabaseSecretKey ?? process.env.SUPABASE_SECRET_KEY;
  const config: AppConfig = {
    nodeEnv: overrides.nodeEnv ?? (process.env.NODE_ENV === "production" ? "production" : process.env.NODE_ENV === "test" ? "test" : "development"),
    host: overrides.host ?? process.env.HOST ?? "0.0.0.0",
    port: overrides.port ?? Number(process.env.PORT ?? 3000),
    corsOrigin: overrides.corsOrigin ?? process.env.CORS_ORIGIN ?? "*",
    authMode,
    ...(supabaseUrl ? { supabaseUrl } : {}),
    ...(supabasePublishableKey ? { supabasePublishableKey } : {}),
    ...(supabaseSecretKey ? { supabaseSecretKey } : {}),
  };
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  if (config.authMode === "supabase" && (!config.supabaseUrl || !config.supabaseSecretKey)) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY are required in supabase mode");
  }
  return config;
}
