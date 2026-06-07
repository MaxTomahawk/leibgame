// Supabase: localhost → dev project, everything else → production.
// See SUPABASE.md and config.example.js.

const SUPABASE = {
  dev: {
    SUPABASE_URL: 'https://qriaaekzknwffqlflftx.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFyaWFhZWt6a253ZmZxbGZsZnR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NDA5NTksImV4cCI6MjA5NjQxNjk1OX0.C7G1K9LZ-s1pCK84QX4CfHLCOnddtAcSaQT4ASaM7As'
  },
  prod: {
    SUPABASE_URL: 'https://hwpxsaamvtqabtxyndlm.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3cHhzYWFtdnRxYWJ0eHluZGxtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mzg0MzMsImV4cCI6MjA5NjQxNDQzM30.9bfmYqljrYR5Rbd9G6Mzw4MfKKwBmOqqibTakmtW1DU'
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
