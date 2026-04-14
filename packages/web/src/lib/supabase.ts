/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL ?? '') as string
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '') as string

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables not set. Running in demo mode.')
}

export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
)
