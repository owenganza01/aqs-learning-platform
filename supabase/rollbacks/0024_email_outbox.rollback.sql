-- ROLLBACK for migration 0024 (email outbox). Prepared 23 November 2026 (WS-EMAIL); NOT a migration and
-- never run automatically. Run only with the owner's explicit authorisation, in one transaction, and only
-- if the migration is applied and must be undone. Unschedule the email-send job first (runbook step 8 undo),
-- and remember that migrations 0025/0026 call private.enqueue_email: roll those back before this one.
-- Verified in the sandbox: applying the migration and then this script gives the same catalog as never
-- applying it (scripts/db-sandbox/rollback-check.sh).
-- Dropping the outbox and its history removes them; export the rows first if any exist.
begin;
drop function public.invitation_email_status(uuid[]);
drop function public.queue_invitation_email(uuid);
drop function public.email_reconcile_held_events(interval);
drop function public.email_record_event(text, text, text, timestamptz, jsonb);
drop function private.email_apply_held_events(uuid, text);
drop function private.email_apply_event(uuid, text, text, timestamptz, jsonb);
drop function public.issue_invitation_token_for_email(uuid, bytea);
drop function public.email_release(uuid[]);
drop function public.email_mark_failed(uuid, text, boolean);
drop function public.email_mark_accepted(uuid, text);
drop function private.email_require_sending(uuid);
drop function public.email_claim_batch(integer);
drop function private.enqueue_email(text, text, jsonb, text, uuid);
drop function private.email_check_data(text, jsonb);
drop table private.email_held_events;
drop table private.email_events;
drop table private.email_outbox;
drop function private.email_backoff(integer);
drop function private.email_max_attempts();
drop function private.email_data_fields(text);
drop table private.email_settings;
drop function private.email_settings_guard();

-- Restore the 0004 guard exactly (token_hash never changes).
create or replace function private.invitations_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'AQS: invitations are never deleted; revoke instead';
  end if;
  if new.id is distinct from old.id or new.org_id is distinct from old.org_id
     or new.email is distinct from old.email or new.role is distinct from old.role
     or new.token_hash is distinct from old.token_hash or new.invited_by is distinct from old.invited_by
     or new.created_at is distinct from old.created_at or new.expires_at is distinct from old.expires_at then
    raise exception 'AQS: invitation details cannot be changed; revoke it and create a new one';
  end if;
  if new.status is distinct from old.status and old.status <> 'pending' then
    raise exception 'AQS: an invitation that is % cannot change status', old.status;
  end if;
  return new;
end;
$$;

-- Audit rows written by 0024 (email.settings_change, invitation.token_issued_for_email) stay in the
-- append-only organization audit as history.
do $$
begin
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    delete from supabase_migrations.schema_migrations where version = '20261123120000';
  end if;
end $$;
commit;
