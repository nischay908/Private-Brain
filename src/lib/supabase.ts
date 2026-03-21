import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://uuiycrrlbktfosmcnktv.supabase.co',      // from supabase dashboard
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1aXljcnJsYmt0Zm9zbWNua3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxMDgyNTEsImV4cCI6MjA4OTY4NDI1MX0.yvzsRP5nxl5uBkL2yBNS-HptEAlrLVjAnsALe5-_S9A'  // from supabase dashboard
);