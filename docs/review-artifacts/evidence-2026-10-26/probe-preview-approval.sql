-- PROBE (not a test file): can the course's PUBLICATION PROPOSER approve a preview that
-- someone else requested? P2: previews are approved by the course's publishing approver,
-- never by the proposer.
begin;
insert into auth.users (id, email) values
 ('00000000-0000-4000-8000-00000000e001','pa@example.test'),('00000000-0000-4000-8000-00000000e002','adm@example.test'),
 ('00000000-0000-4000-8000-00000000e003','ins@example.test');
select private.grant_platform_admin('00000000-0000-4000-8000-00000000e001','probe','probe');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000e001","role":"authenticated"}',true);
select set_config('t.org', public.create_organization('Probe','probe-org')::text, true);
select public.set_organization_status(current_setting('t.org')::uuid,'active');
select public.grant_org_role(current_setting('t.org')::uuid,'00000000-0000-4000-8000-00000000e002','org_admin');
select public.grant_org_role(current_setting('t.org')::uuid,'00000000-0000-4000-8000-00000000e003','instructor');
-- the org admin creates the course; an instructor added as staff requests the preview
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000e002","role":"authenticated"}',true);
select set_config('t.c', public.create_course(current_setting('t.org')::uuid,'Probe course','probe-course')::text, true);
select public.update_course_details(current_setting('t.c')::uuid,'Probe course','','public','open');
select public.add_course_staff(current_setting('t.c')::uuid,'00000000-0000-4000-8000-00000000e003');
select set_config('t.m', public.add_course_module(current_setting('t.c')::uuid,'M')::text, true);
select set_config('t.l', public.add_lesson(current_setting('t.m')::uuid,'L','reading')::text, true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000e003","role":"authenticated"}',true);
select public.request_lesson_preview(current_setting('t.l')::uuid);
-- the org admin proposes the course for publication, then approves the preview
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-00000000e002","role":"authenticated"}',true);
select public.request_course_publication(current_setting('t.c')::uuid);
select public.approve_lesson_preview(current_setting('t.l')::uuid);
reset role;
select 'RESULT: preview approved by the publication proposer = ' ||
       (select (preview_approved_by = '00000000-0000-4000-8000-00000000e002')::text from public.lessons where id = current_setting('t.l')::uuid) as probe_p2;
rollback;
