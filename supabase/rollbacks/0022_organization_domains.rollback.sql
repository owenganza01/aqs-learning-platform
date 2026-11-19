-- ROLLBACK for migration 0022 (organisation email domains and company-email admission; D40).
-- Prepared 18 November 2026; NOT a migration and never run automatically. Run only with the
-- owner's explicit authorisation, in one transaction, and only if the migration is applied and
-- must be undone:   psql --single-transaction -f supabase/rollbacks/0022_organization_domains.rollback.sql
--
-- DATA WARNING. Rolling back DROPS every organisation domain (names, verification tokens and
-- results) and the admission-attempt counters. Take an export first if any domain exists.
-- What stays: memberships created by admission are ordinary memberships (never deleted, F8),
-- with their Learner role; and every audit row (domain.add, domain.verify, domain.enable,
-- domain.disable, domain.pause, domain.resume, domain.remove, domain.admission), which is
-- append-only. Nothing that existed before 0022 is changed by 0022, so nothing is restored.
begin;

drop function if exists public.claim_domain_membership();
drop function if exists public.set_domain_admission_paused(uuid, boolean);
drop function if exists public.organization_domains(uuid);
drop function if exists public.record_domain_verification(uuid, uuid, text, boolean, jsonb);
drop function if exists public.domain_verification_target(uuid);
drop function if exists public.disable_domain_admission(uuid);
drop function if exists public.remove_organization_domain(uuid);
drop function if exists public.add_organization_domain(uuid, text);

drop table if exists private.domain_admission_attempts;
drop table if exists private.organization_domains;

drop function if exists private.org_audit_as(uuid, text, uuid, uuid, jsonb);
drop function if exists private.organization_domains_guard();
drop function if exists private.is_public_email_domain(text);
drop function if exists private.normalize_domain(text);

commit;
