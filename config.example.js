// Copy to config.js and paste your anon keys from Supabase → Project Settings → API.
// Enable Auth → Providers → Anonymous sign-ins on BOTH projects.
//
// Keys are not secrets in the browser (RLS protects data), but keep prod key out of
// public forks if you prefer — dev key is enough for local playtests.

(function () {
  const PROJECTS = {
    dev: {
      SUPABASE_URL: 'https://qriaaekzknwffqlflftx.supabase.co',
      SUPABASE_ANON_KEY: 'PASTE_LEIBGAME_DEV_ANON_KEY'
    },
    prod: {
      SUPABASE_URL: 'https://hwpxsaamvtqabtxyndlm.supabase.co',
      SUPABASE_ANON_KEY: 'PASTE_LEIBGAME_PROD_ANON_KEY'
    }
  };

  function pickEnvironment () {
    const host = window.location.hostname;
    const override = new URLSearchParams(window.location.search).get('supabase');
    if (override === 'dev' || override === 'prod') return override;
    if (host === 'localhost' || host === '127.0.0.1') return 'dev';
    if (host.includes('github.io')) return 'prod';
    return 'dev';
  }

  const envName = pickEnvironment();
  window.env = { ...PROJECTS[envName], SUPABASE_ENV: envName };
})();
