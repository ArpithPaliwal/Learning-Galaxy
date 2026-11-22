/* Public app config. Safe to commit: the Supabase anon key is public by design (row-level security
 * keeps each user's rows private). Leave the Supabase values empty to set them per device in ⚡ App → Cloud sync. */
window.LG_CONFIG = {
  repo: 'ArpithPaliwal/Learning-Galaxy',
  branch: 'main',
  supabaseUrl: 'https://aqkiczctlqpkbhzucxmp.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxa2ljemN0bHFwa2JoenVjeG1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUzMzMyODgsImV4cCI6MjExMDkwOTI4OH0.JNb9YR4hZB3GJlBtqwG6xK3RylzeVJLQ3seMZ1Ckoeg',
};
window.LG_VERSION = 'dev';
