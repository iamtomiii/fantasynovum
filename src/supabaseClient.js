import { createClient } from "@supabase/supabase-js";

// Estas credenciales son públicas por diseño (la "anon key" de Supabase
// está pensada para usarse en el frontend). El control de acceso real
// para editar datos lo sigue haciendo el código de la app con el código
// de administrador (adminPasscode).
const SUPABASE_URL = "https://albmynulcyldroatxcbn.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsYm15bnVsY3lsZHJvYXR4Y2JuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1NDYyNjYsImV4cCI6MjEwMTEyMjI2Nn0.Sqmhe0jtCgLSFS8sCdwytJ0QO6N-X0M1oxEdKtkD0Rk";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Pequeña capa de compatibilidad para reemplazar window.storage
// (que solo existe dentro de los artifacts de Claude) por Supabase.
export const storage = {
  async get(key) {
    const { data, error } = await supabase
      .from("kv_store")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return { value: data.value };
  },
  async set(key, value) {
    const { error } = await supabase
      .from("kv_store")
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw error;
    return { value };
  },
};
