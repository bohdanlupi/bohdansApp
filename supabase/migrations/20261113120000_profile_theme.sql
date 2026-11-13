-- Colour scheme of the app per user: follow the operating system, or always light / dark.
-- Users change it in Einstellungen → Profil; guard_profile_update already allows it (only role, status and email are guarded).

alter table public.profiles
  add column theme text not null default 'system' check (theme in ('system', 'light', 'dark'));
