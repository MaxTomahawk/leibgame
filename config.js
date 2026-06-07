// Supabase environment routing — see docs/DEVELOPMENT.md
// Localhost and Cursor Cloud agents use the DEV project by default.
// GitHub Pages / production hostname uses PROD.
// Override anytime: ?supabase=dev or ?supabase=prod

(function () {
  const PROJECTS = {
    dev: {
      // Leibgame-dev (playtests, agents, localhost)
      SUPABASE_URL: 'https://qriaaekzknwffqlflftx.supabase.co',
      SUPABASE_ANON_KEY: ''
    },
    prod: {
      // Leibgame (live players on GitHub Pages)
      SUPABASE_URL: 'https://hwpxsaamvtqabtxyndlm.supabase.co',
      SUPABASE_ANON_KEY: ''
    }
  };

  function pickEnvironment () {
    const host = window.location.hostname;
    const override = new URLSearchParams(window.location.search).get('supabase');
    if (override === 'dev' || override === 'prod') return override;
    if (host === 'localhost' || host === '127.0.0.1') return 'dev';
    // GitHub Pages and other deployed hosts
    if (host.includes('github.io')) return 'prod';
    return 'dev';
  }

  const envName = pickEnvironment();
  window.env = { ...PROJECTS[envName], SUPABASE_ENV: envName };
})();
