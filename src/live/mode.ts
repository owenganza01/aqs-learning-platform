import { supabase } from '../lib/supabase'

/*
 * Live mode: the app talks to Supabase with real accounts and data. It is on whenever the
 * Supabase URL and publishable key are configured, unless VITE_DATA_MODE=sample asks for the
 * development previews with sample data (the default when no Supabase settings exist, which
 * is how the design-preview tests run). Production builds contain no sample pages at all.
 */
export const LIVE_MODE: boolean = supabase !== null && import.meta.env.VITE_DATA_MODE !== 'sample'
