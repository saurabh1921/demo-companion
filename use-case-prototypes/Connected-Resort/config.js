/* Public configuration for the online demo. The anon key is designed to be public;
   every live call also needs a signed-in user, checked by the edge function. */
window.CR_CONFIG = {
  "supabaseUrl": "https://kifvmxtmjmhorfmvfsgq.supabase.co",
  "anonKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpZnZteHRtam1ob3JmbXZmc2dxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIxMTgyOTYsImV4cCI6MjEwNzY5NDI5Nn0.XrPM5YKD_gMlqckKVqMOeYpIR61JOb8MWuw6zAoM908",
  "functionUrl": "https://kifvmxtmjmhorfmvfsgq.supabase.co/functions/v1/connected-resort"
};
