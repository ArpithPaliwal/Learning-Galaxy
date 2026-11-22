/* Public app config. Safe to commit: the Supabase anon key is public by design (row-level security
 * keeps each user's rows private). Leave the Supabase values empty to set them per device in ⚡ App → Cloud sync. */
window.LG_CONFIG = {
  repo: 'ArpithPaliwal/Learning-Galaxy',
  branch: 'main',
  supabaseUrl: '',
  supabaseAnonKey: '',
};
window.LG_VERSION = 'dev';
