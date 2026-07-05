import { createClient, SupabaseClient } from '@supabase/supabase-js';

// The publishable key is designed to be public; data access is protected by
// Row Level Security policies (see supabase/schema.sql), never by key secrecy.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

export const isCloudConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase: SupabaseClient | null = isCloudConfigured
  ? createClient(supabaseUrl!, supabaseKey!)
  : null;
