-- DRAFT pgTAP test for T4: the pg_graphql extension is not installed. The HTTP-level
-- check (the /graphql/v1 endpoint is unavailable) is in the 0006 API test draft.
begin;
create extension if not exists pgtap with schema extensions;
select plan(2);
select hasnt_extension('pg_graphql', 'T4: pg_graphql is not installed');
select hasnt_schema('graphql', 'T4: no graphql schema exists');
select * from finish();
rollback;
