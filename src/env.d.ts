/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. Missing = accounts and leaderboards are hidden. */
  readonly VITE_SUPABASE_URL?: string;
  /** The anon (publishable) key ONLY. Never the service_role or a secret key: this ships in the bundle. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
