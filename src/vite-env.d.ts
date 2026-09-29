/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV: "development" | "production";
  readonly VITE_SUPABASE_PROJECT_ID: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_META_APP_ID: string;
  readonly VITE_META_WHATSAPP_CONFIG_ID: string;
  readonly VITE_WHATSAPP_API_ENABLED: "true" | "false";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
