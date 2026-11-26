-- ROLLBACK for migration 0026 (certificates, A11). Prepared 23 November 2026 (WS-CERT); NOT a
-- migration and never run automatically. Run only with the owner's explicit authorisation, in one
-- transaction, and only if the migration is applied and must be undone.
--
-- DATA WARNING. Rolling back DELETES every certificate template record and every certificate record
-- (codes stop verifying). It does NOT delete: the two Storage buckets (certificate-templates,
-- certificates) or any object in them (remove them in the Storage dashboard if wanted), the audit rows
-- written by 0026's functions (append-only), or certificate_issued emails already queued in the 0024
-- outbox. Stop the certificate-generate schedule before running it.
begin;
drop trigger enrollments_queue_certificate on public.enrollments;
drop policy aqs_certificate_templates_insert on storage.objects;

drop function public.verify_certificate(text);
drop function public.record_certificate_result(uuid, boolean, text);
drop function public.claim_certificates(integer);
drop function public.certificate_file_access(text, uuid);
drop function public.org_certificates(uuid);
drop function public.my_certificates();
drop function public.deactivate_certificate_template(uuid);
drop function public.activate_certificate_template(uuid);
drop function public.update_certificate_template(uuid, text, jsonb, text, numeric, numeric);
drop function public.create_certificate_template(uuid, text, text, text, numeric, numeric);
drop function public.certificate_templates(uuid);
drop function authz.can_upload_certificate_template(text);
drop function private.enrollment_certificate_trigger();
drop function private.queue_certificate(uuid);

drop table public.certificates;
drop table public.certificate_templates;

drop function private.caller_manages_certificates(uuid);
drop function private.new_certificate_code();
drop function private.default_certificate_placements();
drop function private.certificate_placements_error(jsonb);
commit;
