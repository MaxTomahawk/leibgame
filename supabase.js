import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

let supabaseClient = null;

export function isSupabaseConfigured () {
  const url = window.env?.SUPABASE_URL;
  const key = window.env?.SUPABASE_ANON_KEY;
  return Boolean(url && key && !url.includes('YOUR_PROJECT') && key !== 'YOUR_ANON_KEY');
}

export function getSupabase () {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Copy config.example.js to config.js and add your project keys.');
  }
  if (!supabaseClient) {
    supabaseClient = createClient(window.env.SUPABASE_URL, window.env.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }
  return supabaseClient;
}

export async function initSupabase (onSessionReady) {
  const supabase = getSupabase();
  let ready = false;

  const notify = async (user) => {
    if (!user || ready) return;
    ready = true;
    await onSessionReady(user, supabase);
  };

  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) await notify(session.user);
  });

  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Supabase session error:', error);
    throw error;
  }

  if (session?.user) {
    await notify(session.user);
  } else {
    const { error: anonError } = await supabase.auth.signInAnonymously();
    if (anonError) {
      console.error('Anonymous sign-in failed:', anonError);
      throw anonError;
    }
  }

  return { supabase, unsubscribe: () => subscription.unsubscribe() };
}

export async function linkAnonymousAccountToEmail (email, password) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.updateUser({ email, password });
  if (error) throw error;
  return data.user;
}

export async function loginWithEmail (email, password) {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function logout () {
  const supabase = getSupabase();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  window.location.reload();
}
