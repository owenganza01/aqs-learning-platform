-- Rollback for 0021 (WP3: organization requests, their review, the organization profile).
-- Removes everything 0021 created and nothing else. Draft organizations created by approvals are
-- ordinary organizations and stay (organizations are never deleted, F8); their audit rows stay.
-- Requests and profiles are lost with their tables: take an export first if any exist.
-- Run in one transaction:  psql --single-transaction -f supabase/rollbacks/0021_organization_data.rollback.sql
drop function if exists public.set_organization_profile(uuid, text, text, text, text, text);
drop function if exists public.organization_profile(uuid);
drop function if exists public.approve_organization_request(uuid, text, text, text);
drop function if exists public.decline_organization_request(uuid, text);
drop function if exists public.start_organization_request_review(uuid);
drop function if exists public.organization_request_detail(uuid);
drop function if exists public.organization_requests(text);
drop function if exists public.submit_organization_request(jsonb, text);
drop function if exists private.require_platform_admin();
drop function if exists private.request_text(jsonb, text);
drop function if exists private.organization_request_reference(uuid);

drop trigger if exists organization_profiles_guard_truncate on private.organization_profiles;
drop trigger if exists organization_profiles_guard_delete on private.organization_profiles;
drop trigger if exists organization_profiles_guard_update on private.organization_profiles;
drop trigger if exists organization_requests_guard_truncate on private.organization_requests;
drop trigger if exists organization_requests_guard_delete on private.organization_requests;
drop trigger if exists organization_requests_guard_update on private.organization_requests;
drop table if exists private.organization_profiles;
drop table if exists private.organization_request_attempts;
drop table if exists private.organization_requests;
drop function if exists private.organization_profiles_guard();
drop function if exists private.organization_requests_guard();
