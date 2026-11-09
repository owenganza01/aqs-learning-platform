-- =============================================================================
-- 0015: read the Google Workspace hd claim where Supabase Auth stores it (DF8).
--
-- Found during A8 Stage 1 (2 November 2026) on staging: for a real Google Workspace
-- account, Supabase Auth stores Google's `hd` claim under
-- auth.identities.identity_data -> 'custom_claims' -> 'hd', not at the top level of
-- identity_data. Migration 0006 read only identity_data ->> 'hd' (assumption A2 in the
-- 0006 draft), so every Workspace invitee was refused, contrary to D33, which makes
-- Workspace accounts whose hd claim equals the email domain eligible.
--
-- The rule itself does not change (D33). Only where the claim is read:
--   * hd is taken from identity_data ->> 'hd', or else from
--     identity_data -> 'custom_claims' ->> 'hd';
--   * if both are present they must agree, otherwise the evidence is contradictory and
--     the identity is refused (D33 strict);
--   * a non-string hd (object, array, number, boolean) is refused.
-- auth.identities.identity_data is written by Supabase Auth from the provider's data at
-- sign-in; clients cannot change it (updateUser writes user metadata, not identities).
--
-- All other D33 rules are unchanged and copied from 0006 verbatim. Function name,
-- signature, owner rights and grants are unchanged (clients still cannot call it).
-- =============================================================================

create or replace function private.caller_verified_google_email()
returns text
language sql
stable
set search_path = ''
as $$
  select lower(i.identity_data ->> 'email')
    from auth.identities i
    join auth.users u on u.id = i.user_id
   where i.user_id = (select auth.uid())
     and i.provider = 'google'
     -- A1: the JSON boolean true only. The string "true" is refused.
     and i.identity_data -> 'email_verified' = 'true'::jsonb
     -- The identity's email must equal the current account email (case-insensitive only).
     and lower(i.identity_data ->> 'email') = lower(u.email)
     -- D33: gmail.com, or Workspace whose hd claim equals the email domain exactly (A2).
     -- 0015: hd may sit at the top level or under custom_claims (where Supabase Auth
     -- puts it); a non-string hd, or two hd values that disagree, is refused.
     and (
       split_part(lower(u.email), '@', 2) = 'gmail.com'
       or (
         jsonb_typeof(coalesce(i.identity_data -> 'hd', 'null'::jsonb)) in ('string', 'null')
         and jsonb_typeof(coalesce(i.identity_data -> 'custom_claims' -> 'hd', 'null'::jsonb)) in ('string', 'null')
         and coalesce(i.identity_data ->> 'hd', i.identity_data -> 'custom_claims' ->> 'hd') is not null
         and (
           i.identity_data ->> 'hd' is null
           or i.identity_data -> 'custom_claims' ->> 'hd' is null
           or lower(i.identity_data ->> 'hd') = lower(i.identity_data -> 'custom_claims' ->> 'hd')
         )
         and lower(coalesce(i.identity_data ->> 'hd', i.identity_data -> 'custom_claims' ->> 'hd'))
             = split_part(lower(u.email), '@', 2)
       )
     )
     -- D33 strict: any other Google identity of this account that is unverified or
     -- carries a different email blocks access.
     and not exists (
       select 1
         from auth.identities c
        where c.user_id = i.user_id
          and c.provider = 'google'
          and (
            c.identity_data -> 'email_verified' is distinct from 'true'::jsonb
            or lower(c.identity_data ->> 'email') is distinct from lower(u.email)
          )
     )
     -- Any identity from another provider (for example an email/password identity
     -- created earlier for the same address) blocks access. Fail closed.
     and not exists (
       select 1
         from auth.identities x
        where x.user_id = i.user_id
          and x.provider <> 'google'
     )
   limit 1;
$$;
comment on function private.caller_verified_google_email() is
  'D33: the caller''s verified Google email (Gmail, or Workspace with matching hd, read from the top level or custom_claims; 0015), or no row. Fail closed. Not callable by client roles.';

revoke execute on function private.caller_verified_google_email()
  from public, anon, authenticated, service_role;
