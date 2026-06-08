// Supabase routing — see docs/DEVELOPMENT.md
// localhost / agents → dev · github.io → prod · override ?supabase=dev|prod

(function () {
  const PROJECTS = {
    dev: {
      SUPABASE_URL: 'https://qriaaekzknwffqlflftx.supabase.co',
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyaWFhZWt6a253ZmZxbGZsZnR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NDA5NTksImV4cCI6MjA5NjQxNjk1OX0.C7G1K9LZ-s1pCK84QX4CfHLCOnddtAcSaQT4ASaM7As'
    },
    prod: {
      SUPABASE_URL: 'https://hwpxsaamvtqabtxyndlm.supabase.co',
      SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cHhzYWFtdnRxYWJ0eHluZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg0MzMsImV4cCI6MjA5NjQxNDQzM30.9bfmYqljrYR5Rbd9G6Mzw4MfKKwBmOqqibTakmtW1DU'
    }
  };

  function isPrivateOrLocalHost (host) {
    if (!host || host === 'localhost' || host === '[::1]') return true;
    if (host.endsWith('.local')) return true;
    const parts = host.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // Tailscale CGNAT
    if (a === 127) return true;
    return false;
  }

  function pickEnvironment () {
    const host = window.location.hostname;
    const override = new URLSearchParams(window.location.search).get('supabase');
    if (override === 'dev' || override === 'prod') return override;
    if (isPrivateOrLocalHost(host)) return 'dev';
    if (host.includes('github.io')) return 'prod';
    return 'dev';
  }

  const envName = pickEnvironment();
  window.env = { ...PROJECTS[envName], SUPABASE_ENV: envName };
})();
