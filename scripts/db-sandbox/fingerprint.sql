-- Catalog fingerprint used by rollback-check.sh (functions with definition, security, search_path,
-- owner and ACL; tables, column grants, policies). Output is sorted so two runs can be diffed.
select 'fn|'||n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')|secdef='||p.prosecdef||'|cfg='||coalesce(array_to_string(p.proconfig,','),'')||'|owner='||pg_get_userbyid(p.proowner)||'|acl='||coalesce(p.proacl::text,'')||'|md5='||md5(pg_get_functiondef(p.oid))
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private','authz','storage','auth') and p.prokind='f'
   and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
union all
select 'rel|'||n.nspname||'.'||c.relname||'|kind='||c.relkind::text||'|rls='||c.relrowsecurity||'|force='||c.relforcerowsecurity||'|owner='||pg_get_userbyid(c.relowner)||'|acl='||coalesce(c.relacl::text,'')
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname in ('public','private','authz','storage') and c.relkind in ('r','v','m','p','f')
union all
select 'col|'||table_schema||'.'||table_name||'.'||column_name||'|'||grantee||'|'||privilege_type
  from information_schema.column_privileges where table_schema in ('public','private','storage')
union all
select 'pol|'||schemaname||'.'||tablename||'.'||policyname||'|'||cmd||'|'||array_to_string(roles,',')||'|'||md5(coalesce(qual,'')||'/'||coalesce(with_check,''))
  from pg_policies where schemaname in ('public','private','storage')
order by 1;
