# Package: second Platform Admin on staging (P1, F6, D18-B, D36)

**Status:** prepared in CM1, 3 November 2026. Not performed. The owner performs it; the agent
never grants Platform Admin (F6: owner-run, audited SQL only).

**Why:** P1 says a Platform Admin approves a platform course's publication and never the person
who proposed it, so publishing platform courses needs two Platform Admins. Staging has one
(verified 3 Nov, read-only count). Without a second, platform-course publishing and
corrections cannot be tested on staging (CM4) and production blocker RB6 stays open.

**Owner decision needed first:** who the second Platform Admin is. It must be a real AQS person
with their own Google account, not a shared or test-only identity, because the same procedure
will be repeated in production (CM5). For staging, a dedicated test Google account is
acceptable if you prefer to keep real staff accounts out of staging; say which.

## Target

- Project: `aqs-staging` (`txpaszokduxewyojrnmq`) only. Never `eeoofujuouquhnxkpffs`.
- Effect: one row in `public.platform_admins`, one grant row in `private.platform_admin_audit`
  (who, whom, when, why). Nothing else changes.

## Steps (owner)

1. The chosen person signs in once at `https://aqs-learning-staging.onrender.com/sign-in`
   with Google. This creates their profile with no role (F1).
2. In the Supabase dashboard for `aqs-staging` → SQL editor (runs as `postgres`), replace the
   placeholders and run:

   ```sql
   select private.grant_platform_admin(
     (select id from auth.users where lower(email) = lower('<their email>')),
     '<your name, as operator>',
     'Second Platform Admin for P1 (CM1 package)');
   ```

   The function refuses a user without an active profile (an error, nothing changes). A user
   who is already a Platform Admin is refused by the table's key, also changing nothing.

## Verification (read-only; shows no email addresses)

```sql
select count(*) as platform_admins from public.platform_admins;          -- expect 2
select action, operator, reason, occurred_at
  from private.platform_admin_audit
 where action = 'grant'
 order by occurred_at desc limit 1;                                        -- expect the new grant row
```

Then the agent (with the owner present) checks in the app that the new account sees `/admin`
and that the original Platform Admin can approve a platform course proposed by the new one
(CM4 test).

## Rollback

```sql
select private.revoke_platform_admin(
  (select id from auth.users where lower(email) = lower('<their email>')),
  '<your name>', 'Rollback of CM1 package');
```

The revocation is audited too; the audit history is never deleted (F8).
