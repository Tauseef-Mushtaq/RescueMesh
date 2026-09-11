-- RescueMesh AI — Restore service_role table privileges (M02 fix)
--
-- Root cause of "permission denied for table incidents" on the
-- service-role INSERT path:
--
-- The initial schema migration (00000000000001) creates tables and
-- enables row level security, but never grants baseline table
-- privileges to `service_role`. In a standard hosted Supabase project
-- this is normally covered by project-level default privileges set up
-- outside migration files; when it isn't present (e.g. a project/
-- environment where those defaults were never applied, or a fresh
-- database bootstrapped purely from these migrations), `service_role`
-- has no GRANT on the tables at all. That is a plain Postgres
-- table-privilege error, NOT a row-level-security violation — RLS
-- failures raise "new row violates row-level security policy", while
-- this is "permission denied for table incidents". service_role is
-- still expected to bypass RLS once it can reach the table.
--
-- This migration is additive and narrowly scoped: it grants full
-- table access on the `public` schema to `service_role` only (the
-- trusted backend role used exclusively by server-side route
-- handlers), and sets the equivalent default privileges so any future
-- tables in `public` are covered automatically. It does NOT touch
-- `anon` or `authenticated`, does NOT disable RLS, and does NOT add
-- any anonymous INSERT policy.

grant usage on schema public to service_role;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges in schema public
  grant usage, select on sequences to service_role;
