// Reference only — the repo’s config.js is already filled in.
// Use this when forking or rotating keys (Supabase → Project Settings → API).

(function () {
  const PROJECTS = {
    dev: {
      SUPABASE_URL: 'https://qriaaekzknwffqlflftx.supabase.co',
      SUPABASE_ANON_KEY: 'YOUR_DEV_ANON_KEY'
    },
    prod: {
      SUPABASE_URL: 'https://hwpxsaamvtqabtxyndlm.supabase.co',
      SUPABASE_ANON_KEY: 'YOUR_PROD_ANON_KEY'
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
