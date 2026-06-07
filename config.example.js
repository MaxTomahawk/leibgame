// Copy to config.js and fill in both environments.
// Create two projects in Supabase: Leibgame (prod) + Leibgame-dev (dev).

const SUPABASE = {
  dev: {
    SUPABASE_URL: 'https://YOUR_DEV_REF.supabase.co',
    SUPABASE_ANON_KEY: 'YOUR_DEV_ANON_KEY'
  },
  prod: {
    SUPABASE_URL: 'https://YOUR_PROD_REF.supabase.co',
    SUPABASE_ANON_KEY: 'YOUR_PROD_ANON_KEY'
  }
};

function pickSupabaseEnv () {
  const host = window.location.hostname;
  const params = new URLSearchParams(window.location.search);
  if (params.get('supabase') === 'prod') return 'prod';
  if (params.get('supabase') === 'dev') return 'dev';
  if (host === 'localhost' || host === '127.0.0.1') return 'dev';
  return 'prod';
}

window.env = SUPABASE[pickSupabaseEnv()];
