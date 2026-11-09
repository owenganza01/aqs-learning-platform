\pset pager off
\echo '== A. functions in public/private/authz: definer?, search_path pinned?, who may execute'
select n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')' as fn,
       p.prosecdef as definer,
       coalesce(p.proconfig @> array['search_path=""'], false) as sp_empty,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_x,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_x,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as svc_x
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public','private','authz') and p.prokind = 'f'
 order by 1;
\echo '== B. functions WITHOUT an empty search_path (any security mode)'
select n.nspname||'.'||p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private','authz') and not coalesce(p.proconfig @> array['search_path=""'], false);
\echo '== C. table/view privileges for client roles in public'
select c.relname, c.relkind, r.rol, string_agg(pr.p, ',' order by pr.p) privs
  from pg_class c cross join (values ('anon'),('authenticated'),('service_role')) r(rol)
  cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) pr(p)
 where c.relnamespace='public'::regnamespace and c.relkind in ('r','v','m','p')
   and has_table_privilege(r.rol, c.oid, pr.p)
 group by 1,2,3 order by 1,3;
\echo '== D. column-level write privileges for client roles (expect none)'
select c.relname, a.attname, r.rol, pr.p from pg_attribute a join pg_class c on c.oid=a.attrelid
 cross join (values ('anon'),('authenticated')) r(rol) cross join (values ('INSERT'),('UPDATE')) pr(p)
 where c.relnamespace='public'::regnamespace and a.attnum>0 and not a.attisdropped
   and has_column_privilege(r.rol, c.oid, a.attnum, pr.p) order by 1,2;
\echo '== E. RLS flags and policies'
select c.relname, c.relrowsecurity rls, c.relforcerowsecurity force_rls,
       (select string_agg(pol.polname||'['||array_to_string(array(select rolname from pg_roles where oid = any(pol.polroles)),',')||':'||pol.polcmd::text||']', ' ' order by pol.polname)
          from pg_policy pol where pol.polrelid=c.oid) policies
  from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') order by 1;
\echo '== F. views and their options'
select c.relname, c.reloptions, pg_get_userbyid(c.relowner) owner from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='v';
\echo '== G. private schema tables (counted outside the 22 public tables)'
select relname from pg_class where relnamespace='private'::regnamespace and relkind='r' order by 1;
\echo '== H. public table count'
select count(*) from pg_class where relnamespace='public'::regnamespace and relkind='r';
