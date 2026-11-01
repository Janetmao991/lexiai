import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { IS_DEMO } from './demo';

// The publishable key is designed to be public; data access is protected by
// Row Level Security policies (see supabase/schema.sql), never by key secrecy.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

export const isCloudConfigured = Boolean(supabaseUrl && supabaseKey);

// Demo mode never creates a client, so it can't read or write anyone's account.
export const supabase: SupabaseClient | null = isCloudConfigured && !IS_DEMO
  ? createClient(supabaseUrl!, supabaseKey!)
  : null;
