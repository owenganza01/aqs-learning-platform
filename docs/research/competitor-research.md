# AQS Learning Platform: competitor practice research (A12, brief Parts 2.3, 2.4 and 14)

Prepared by WS-RESEARCH, 23 November 2026. Read-only: no repository was changed.

## How to read this

- **Sources.** Each finding comes from the vendor's own help centre, documentation or product blog, fetched on 23 November 2026. A link follows every claim. Pages were read through a fetch tool that summarises them, so check the wording against the live page before you quote any of it outside AQS. Quotes are under 15 words, with at most one per source. Everything else is paraphrased.
- **Not covered.** Pricing, sales-led implementation services and public demos. None of the vendors publishes an interactive demo that could be reviewed without signing up.
- **Verdicts.** **ADOPT** means use the practice largely as it is. **ADAPT** means use the idea, cut down to fit AQS's model (D21 tenant isolation, the fixed roles of C3, owner-run onboarding, the approved scope). **SKIP** means it does not fit AQS's model or the current release.
- **AQS model used for the verdicts.** AQS hosts private workspaces where organisations train their own staff with content they create themselves. AQS does not sell a catalogue. Individual learners can also take open public courses. The roles are Platform Admin (the same role as Global Admin, C3), Organization Admin, Instructor (course staff) and Learner. There is no external instructional-designer role. The current UI is the design baseline (C1).
- **Mapping.** Additions are A1–A15 from `docs/decisions.md` D43: A2 chart library; A3 email delivery foundation; A4 form and workflow notifications; A5 organisation request upgrades; A6 automatic activation; A7 content visibility and dashboard consistency; A8 sign-up options check; A9 permission matrix and gap tests; A10 multi-document upload and optional thumbnail; A11 organisation certificate templates and automatic certificates; A12 research, page audit and terminology; A13 performance; A14 realistic development sample data.

Vendors: Docebo, LearnUpon, TalentLMS, Absorb LMS, 360Learning and Moodle Workplace. No seventh vendor was added: these six already cover every topic in the brief.

---

## 1. Organisation onboarding

**What vendors do**
- **LearnUpon.** A top-level admin creates each client or department as a sub-portal. A new sub-portal takes the login-screen customisation, SSO settings and dynamic rules from its parent. An optional copy step also brings over general settings, email templates, categories, terms and custom fields, but not logos or banners. [LearnUpon: sub-portals](https://support.learnupon.com/hc/en-us/articles/360004045417)
- **Docebo.** A Superadmin creates an "extended enterprise" client by naming it, choosing a URL type and linking one branch. Anything the admin does not customise falls back to the main platform's settings. [Docebo: extended enterprise](https://help.docebo.com/hc/en-us/articles/360020124899)
- **TalentLMS.** An admin creates a branch, which gets a URL generated from its name. Users, courses and learning paths are then added to the branch from its page. [TalentLMS: branches](https://help.talentlms.com/hc/en-us/articles/10730422769436-How-to-work-with-branches)
- None of the official pages reviewed describes a public "apply for a workspace" form. Onboarding is something an operator does.

**Where AQS stands.** A public request form exists at `/request-workspace`, with review by a Platform Admin at `/admin/requests`. Approval activates the workspace and invites the proposed admins (C2; WS-ONBOARD, migration 0025).

**Verdict: ADAPT (A5, A6).** AQS's request-then-approve flow already matches what vendors do, with an operator in control. The useful lesson is "inherit sensible defaults": a new organisation should start with working defaults (email templates from A3, a certificate template from A11) rather than empty settings. **SKIP** settings-copy tooling, because AQS has very few per-organisation settings.

## 2. Multi-tenancy and sub-portals

**What vendors do**
- **Moodle Workplace.** Moodle Workplace (not standard Moodle) runs separate tenants. Each tenant has its own branding, users, roles, reports and courses. A user has one main tenant and can belong to several secondary tenants, and learners in more than one tenant see all their learning in one place. [Moodle docs: Multitenancy](https://docs.moodle.org/en/Multitenancy)
- **Moodle Workplace.** Tenant admins can manage that tenant's users, roles, authentication and branding. Tenants can be archived, and archiving suspends the tenant's users. [Moodle docs: Multi-tenancy configuration](https://docs.moodle.org/en/Multi-tenancy_Configuration)
- **LearnUpon.** Users, groups and authored content are separate in each sub-portal. Courses move between portals only through licences, which can cap enrolments or limit time. LearnUpon calls a main portal plus its sub-portals a "realm" (the page's own definition: "A main portal with sub-portals connected to it are called a realm."). [LearnUpon: sub-portals](https://support.learnupon.com/hc/en-us/articles/360004045417)
- **TalentLMS.** Each branch has its own URL, theme, logo, signup method and terms. Members can be blocked from signing in through the main domain. [TalentLMS: branches](https://help.talentlms.com/hc/en-us/articles/10730422769436-How-to-work-with-branches)

**Where AQS stands.** Each organisation has a workspace under `/o/:slug`, isolated by row-level security (D21). A person can belong to several organisations and switch between them with the workspace switcher (`src/live/session-context.ts` `workspacesFor`). The organisation's name and initials are the only branding. Suspension hides the organisation (P11). There is no course sharing between organisations (P18).

**Verdict**
- **ADOPT, already in place:** explicit membership in several organisations, with one sign-in (the Moodle model).
- **ADAPT, new (owner scope decision):** a per-organisation logo, shown in its workspace header and on its certificates. Every vendor reviewed offers branding per tenant. For AQS, a logo is the useful minimum; A11 certificate templates will need an organisation logo anyway.
- **SKIP:** a subdomain or custom domain per organisation, and licensing courses between tenants. Both conflict with P18 and add cost.

## 3. Delegated administration

**What vendors do**
- **Docebo.** "Power users" receive reusable permission profiles, up to 10 each. Those permissions work only on the users, branches, courses and catalogues assigned to them, so a power user needs both the permission and the resource to act. [Docebo: power users](https://help.docebo.com/hc/en-us/articles/360020081500)
- **LearnUpon.** Managers act only within the groups they are assigned. "Manager permissions apply to learners within the manager's groups only." They can create or invite learners, set due dates, run progress reports and, as an option, enrol learners. [LearnUpon: managers](https://support.learnupon.com/hc/en-us/articles/6962553042845-User-types-and-permissions-managers)
- **Absorb.** Admin roles are built from area-by-area View and Modify permissions. Each admin's user-management setting limits whose data they can see. [Absorb: roles and permissions](https://support.absorblms.com/hc/en-us/articles/360053227673-Admin-Roles-Permissions)

**Where AQS stands.** The Organization Admin is a fixed role scoped to one organisation. Only Platform Admins grant `org_admin` (F3, D18). An Organization Admin can invite Learners and Instructors only (`src/live/pages/manage/LiveOrgInvitations.tsx`, role options).

**Verdict: ADAPT (A9).** The underlying principle, that a permission applies only to resources in your scope, is what AQS's row-level security already enforces per organisation. A9's permission matrix should document it role by role. **SKIP** configurable permission profiles and manager-of-a-group roles: C3 fixes the roles. An organisation-level "manager" would also need a groups or departments model, which AQS does not have.

## 4. User invitations and employee management

**What vendors do**
- **LearnUpon.** Admins either create a user directly or invite by email. Invitees accept and set a password, and they show in a Pending Users list until then. The invitation sets the user type, but a learner can only be put in a group after accepting. "A new user's account requires an email as their unique identifier." [LearnUpon: create or invite users](https://support.learnupon.com/hc/en-us/articles/360002489518)
- **LearnUpon.** Only admins can bulk-upload users. Managers add learners one at a time. (Same source.)
- **Absorb.** Automatic enrolment rules are evaluated again whenever profile data, group membership or user fields change, including after bulk imports. [Absorb: automatic enrolment rules](https://support.absorblms.com/hc/en-us/articles/360053094693-Automatic-Enrollment-Rules)

**Where AQS stands.** Email invitations expire after seven days and can be revoked (D18). The Invitations page lists them by status (`LiveOrgInvitations.tsx`). A verified domain admits learners automatically (D40, `DomainsCard.tsx`). Members can be suspended or removed, and their records are kept (`LiveOrgMembers.tsx`).

**Verdict**
- **ADOPT, already in place:** invitation by email, a list of pending invitations, and the role fixed at the time of invitation.
- **ADAPT, new (owner scope decision):** inviting several people at once by pasting a list of addresses into the existing form. This is cheap and fits AQS's flow. **SKIP** CSV import with custom fields, and creating accounts directly with admin-set passwords. Admin-set passwords conflict with D33's verified-identity rule for invitations.

## 5. Training assignment

**What vendors do**
- **LearnUpon.** A due date can be set at course level (days after enrolment, or a fixed date), when enrolling a group, or for one person. "After the due date passes, learners can still access the course." Hard cut-offs are a separate setting called "valid periods". [LearnUpon: date limits](https://support.learnupon.com/hc/en-us/articles/360004040977)
- **Absorb.** An enrolment rule on a course enrols everyone, current and future, who matches profile or group criteria. Optionally, the rule also removes people who stop matching, provided they have not started the course. [Absorb: automatic enrolment rules](https://support.absorblms.com/hc/en-us/articles/360053094693-Automatic-Enrollment-Rules)

**Where AQS stands.** An Organization Admin assigns a published organisation course to **one member at a time**, with an optional due date, from the Teaching Studio course page (`src/live/pages/teach/CoursePanels.tsx`, `AssignPanel`, lines 395–434). Overdue status shows to learners and on the Organization Admin dashboard. Due dates are advisory, as at LearnUpon.

**Verdict**
- **ADOPT, already in place:** advisory due dates that do not lock the learner out.
- **ADAPT, new (owner scope decision, high value):** assign to several members at once, plus an "all current learners" option, from the Organization Workspace instead of only inside the Teaching Studio. Assigning one person at a time does not scale to an organisation training its staff, and every vendor reviewed supports group or rule-based enrolment.
- **SKIP:** a rule engine. AQS holds no department or job-title data, so there is nothing for rules to match on.

## 6. Course and material management

**What vendors do**
- **LearnUpon.** Word, PowerPoint and PDF files up to 100 MB become document modules. Video, audio and SCORM have their own module types. Resources and assignments accept common office formats, and uploads sit in a library for reuse across courses. [LearnUpon: build courses from existing files](https://support.learnupon.com/hc/en-us/articles/360002466737)
- **LearnUpon.** "Anyone can build courses in LearnUpon." The page names admins and course authors as publishers and describes no review step. [LearnUpon: course building](https://support.learnupon.com/hc/en-us/articles/360004022717)

**Where AQS stands.** Courses contain modules with video, reading and quiz lessons. Downloadable files depend on a flag (D20, L7). Publication needs a second person's approval (P22). Published courses have a corrections workflow (`CorrectionsPanel.tsx`). Uploads are moving to several documents per lesson with an optional thumbnail (A10, WS-UPLOAD).

**Verdict**
- **ADOPT (A10):** let organisations upload the documents they already have (PDF, Word, PowerPoint) as lesson resources. This matches the "organisations bring their own material" model directly.
- **ADAPT:** keep AQS's second-person publication approval. It is stricter than LearnUpon and it suits tenant-private content.
- **SKIP:** SCORM/xAPI packages and a reusable content library for now. Both are large features, and the brief does not ask for them.

## 7. External content contributors and collaborative authoring

**What vendors do**
- **360Learning.** Learning teams invite subject-matter experts to co-author courses. Collaborators leave private notes and suggestions before learners see the course, and learner "reactions" flag courses that need updating. [360Learning: authoring tool](https://360learning.com/blog/product-authoring-tool/)
- **TalentLMS.** A user whose type includes Instructor permissions can be switched between Learner and Instructor on a single course. "you can change a user's role in a specific course." [TalentLMS: change a user's role](https://help.talentlms.com/hc/en-us/articles/9652335763996-How-to-change-a-user-s-role-across-your-portal-or-on-a-single-course)
- **Docebo.** A content-manager permission profile limits a power user to the courses assigned to them. [Docebo: power users](https://help.docebo.com/hc/en-us/articles/360020081500)

**Where AQS stands.** Each course has "course staff": members who may edit it while it is a draft (`CoursePanels.tsx`, `StaffPanel`). An organisation that hires an outside instructional designer can invite that person as an Instructor of the organisation.

**Verdict**
- **ADAPT (A9):** document in the permission matrix that an outside designer joins as an Instructor of that one organisation and can be removed when the work ends. This uses the existing role and respects C3.
- **SKIP:** a separate contributor or designer role (C3), and learner reactions.

## 8. Certificates (custom templates)

**What vendors do**
- **Docebo.** Admins design templates with background images, static text and dynamic tags for user, course and date. A course has one default template and may have extra templates targeted at branches or groups. "A learning plan can be associated with only one certificate template." Editing a template does not change certificates already issued; they must be reissued. Each certificate carries a unique code. [Docebo: certificates](https://help.docebo.com/hc/en-us/articles/360020084280-Creating-and-managing-certificates)
- **Moodle Workplace.** "Certificate templates act as blueprints for Certificates when they are issued." Templates are scoped to a course category, which is in effect a tenant. Each certificate gets a unique verification code, which can be shown as a QR code and checked on a verification page. Expiry dates can be shown on the certificate. [Moodle docs: certificate templates](https://docs.moodle.org/en/Certificate_templates)
- **TalentLMS.** Four built-in templates can be edited and cloned. Smart tags such as a first-name placeholder, a custom background image, validity periods and recertification are supported, and certificates are awarded automatically on course completion. [TalentLMS: certifications](https://help.talentlms.com/hc/en-us/articles/9651316373148-How-to-work-with-certifications)

**Where AQS stands.** The completion page has no certificate yet (`src/live/pages/learner/LiveCompletion.tsx`). A11, owned by WS-CERT with migration 0026, adds organisation templates and automatic issue. A11 supersedes "certificates deferred" (P21, D30).

**Verdict: ADOPT the core, ADAPT the scope (A11)**
- Templates belong to an organisation (the Moodle category-per-tenant model). Each organisation sees and uses only its own templates, plus an AQS default.
- Use a fixed set of placeholders: learner name, course title, organisation name, completion date and certificate ID.
- Each certificate gets a unique verification ID. A public verification page should show only the minimum (valid or not, course, date). That page is a tenant-isolation and privacy decision for the owner.
- Issue automatically when the server records completion. Issued certificates do not change when the template is edited (Docebo's rule). This protects records.
- **SKIP for now:** several templates per course targeted by group, expiry and recertification, and digital signatures.

## 9. Completion tracking

**What vendors do**
- **Absorb.** The course activity report shows each learner's status (Not Started, In Progress, Complete, Failed and others), progress percentage, score, enrolment, access, completion and due dates, an "is overdue" flag and certificate dates. The documented way to find overdue learners who have not finished is to filter on status plus "Is Overdue". [Absorb: course activity report](https://support.absorblms.com/hc/en-us/articles/360063832253-Course-Activity-Report)

**Where AQS stands.** Lesson completion is recorded on the server (P8). Quiz attempts and pass marks are recorded. Instructors see progress and quiz results per course (`src/live/pages/teach/LiveTeachLearners.tsx`, with an "Overdue only" filter). Organization Admins see completion and overdue charts (`LiveOrgAdminDashboard.tsx`, from the 0023 summaries).

**Verdict: ADOPT, already in place.** The core fields (status, progress, due date, overdue, completion date) match. **ADAPT (A11):** add "certificate issued" and its date to the learner rows once A11 lands.

## 10. Reporting and dashboards

**What vendors do**
- **Absorb.** Reports have row actions (message, enrol, unenrol) and bulk actions. Exporting to Excel or CSV needs its own permission. [Absorb: course activity report](https://support.absorblms.com/hc/en-us/articles/360063832253-Course-Activity-Report)
- **LearnUpon.** A multi-portal report covers course and learner progress across a main portal and its sub-portals. [LearnUpon: sub-portals](https://support.learnupon.com/hc/en-us/articles/360004045417)
- **LearnUpon.** Managers run course-progress reports for their own groups only. [LearnUpon: managers](https://support.learnupon.com/hc/en-us/articles/6962553042845-User-types-and-permissions-managers)

**Where AQS stands.** The Platform Admin report is limited by design to counts (P19). It never includes learning records, unlike LearnUpon's cross-portal progress report. Organization Admin and Instructor dashboards have charts, which A2 moves to one chart library.

**Verdict**
- **ADOPT (A2, A7):** the same chart style on every dashboard, each with a table alternative (already required by D1 and Q-8).
- **ADAPT, new (owner scope decision):** a CSV export of the Organization Admin's own progress data. Organisations commonly need it for compliance evidence. It must stay scoped to that organisation.
- **SKIP:** cross-tenant progress reporting for Platform Admins. It conflicts with P19 and L11.

## 11. Roles and permissions

**What vendors do**
- **TalentLMS.** There are four default user types, and admins can build custom types from a nested permission checklist. "Each user profile can have only one user type." Users whose type combines several roles can switch between them. [TalentLMS: user types](https://help.talentlms.com/hc/en-us/articles/9652280520092-A-guide-to-TalentLMS-user-types)
- **LearnUpon.** There are four user types (Learner, Instructor, Manager, Admin), and each account has one. [LearnUpon: user types overview](https://support.learnupon.com/hc/en-us/articles/360002353437-User-types-and-permissions-overview)
- **Absorb.** There are default roles (System Admin, Admin, Instructor, Reporter and others). Custom roles can be made by duplicating a default role, and Absorb recommends them for tighter control. [Absorb: roles and permissions](https://support.absorblms.com/hc/en-us/articles/360053227673-Admin-Roles-Permissions)

**Where AQS stands.** There are four fixed roles. A person can hold different roles in different organisations, and the workspace switcher lists every workspace they can open (`workspacesFor`). This is more flexible than TalentLMS and LearnUpon, where each account has one type.

**Verdict: ADAPT (A9).** Keep fixed roles (C3) and publish the permission matrix. Name the "role per organisation" model plainly in the UI, for example in the switcher labels. **SKIP** custom role builders.

## 12. Content visibility

**What vendors do**
- **Docebo.** Catalogues are assigned to groups, branches or users. A course appears in a catalogue only if its own enrolment settings allow it. Separate public catalogues can show courses to anonymous visitors. "Catalogs let you provide learners with collections of content that they can browse through." [Docebo: catalogs](https://help.docebo.com/hc/en-us/articles/360020125439)

**Where AQS stands.** Visibility is set separately from how learners join: "Who can find it" (organisation members only, or the public catalogue) and "How learners join" (assigned by an Organization Admin, or open enrolment) in `CoursePanels.tsx`. Signed-out visitors see public courses only. Signed-in members also see their organisations' courses (`src/live/pages/learner/LiveCatalog.tsx`).

**Verdict: ADOPT, already in place (A7).** This matches Docebo's separation of visibility from enrolment policy. A7 should check that every page states the visibility in the same words. See `copy-changes.md`.

## 13. Mobile usability

**What vendors do**
- **TalentLMS.** A free iOS and Android app plays text, video, audio and some tests offline, but many content types work online only or not at all. [TalentLMS: mobile content types](https://help.talentlms.com/hc/en-us/articles/9651766450716-Which-content-types-are-supported-by-the-TalentLMS-mobile-app)
- **Docebo.** The Go.Learn app supports most course types and offline downloads, but a whole-course download times out after 60 seconds and several content types do not work offline. Purchases must be made on desktop. [Docebo: Go.Learn requirements](https://help.docebo.com/hc/en-us/articles/360020124279)

**Where AQS stands.** AQS is a responsive web app. Public and learner screens target desktop and mobile; staff screens are desktop-first (D9). Offline is deferred (D7).

**Verdict: ADAPT (A13).** Native apps and offline mode carry heavy limitations even at large vendors. AQS should instead make the responsive learner journey fast on low bandwidth: lesson player, quiz, completion page and certificate download at 390 px. **SKIP** native apps and offline mode (D7).

## 14. Email notifications

**What vendors do**
- **TalentLMS.** Notifications are triggered by events: user lifecycle, course assignment, completion and expiry, certificate awarded or expiring, and more. Each can be delayed by a set number of hours, for example as a reminder, and templates use smart tags. "A single filtering rule can be applied to each notification." [TalentLMS: notifications](https://help.talentlms.com/hc/en-us/articles/9651467334044-How-to-work-with-notifications-in-TalentLMS)
- **LearnUpon.** Sub-portals can take copies of the main portal's email templates. [LearnUpon: sub-portals](https://support.learnupon.com/hc/en-us/articles/360004045417)

**Where AQS stands.** Today only invitation emails are sent (P21). A3 (WS-EMAIL, migration 0024) adds an outbox with dedupe and a fixed list of event types: request received, more information needed, declined, workspace activated, Org Admin invitation, certificate issued and invitation.

**Verdict**
- **ADOPT (A3, A4):** a fixed event list with fixed templates, sent once each (dedupe). Do not add a template editor per organisation.
- **ADAPT, new (owner scope decision):** two events organisations will expect next, built on A3: "course assigned to you", and a reminder a set number of days before a due date.
- **SKIP:** admin-configurable notification rules.

---

## Ranked recommendations

Ranked by likely value to organisations training staff, against effort and risk.

| # | Recommendation | Verdict | Evidence | Maps to |
|---|---|---|---|---|
| 1 | Organisation-scoped certificate templates with fixed placeholders, automatic issue on server-recorded completion, a unique verification ID, and issued certificates that never change when the template is edited | ADOPT core | Docebo, Moodle Workplace, TalentLMS (§8) | **A11** |
| 2 | Event-driven transactional email with one send per event (outbox, dedupe) and fixed templates for the onboarding and certificate events | ADOPT | TalentLMS, LearnUpon (§14) | **A3, A4** |
| 3 | Assign a course to several members, or to all current learners, with a due date, from the Organization Workspace | ADAPT | LearnUpon group enrolment, Absorb rules (§5) | **New: owner scope decision** |
| 4 | "Course assigned" email and a reminder before the due date | ADAPT | TalentLMS hours-before and hours-after triggers (§14) | **New: owner scope decision** (builds on A3) |
| 5 | One chart style, with table alternatives, on every dashboard, and consistent visibility wording on every page | ADOPT | Absorb, Docebo (§10, §12) | **A2, A7** |
| 6 | Permission matrix that documents role per organisation, the resource-scoped principle, and how an outside designer joins as an organisation Instructor | ADAPT | Docebo, Absorb, TalentLMS, 360Learning (§3, §7, §11) | **A9** |
| 7 | Upload of existing documents (PDF, Word, PowerPoint) as lesson resources | ADOPT | LearnUpon (§6) | **A10** |
| 8 | New organisations start with working defaults (email templates, a default certificate template), not empty settings | ADAPT | LearnUpon, Docebo (§1) | **A5, A6, A11** |
| 9 | Organization Admin CSV export of their own organisation's progress and completion data | ADAPT | Absorb (§10) | **New: owner scope decision** |
| 10 | Organisation logo shown in the workspace header and on certificates | ADAPT | TalentLMS, LearnUpon, Moodle (§2) | **New: owner scope decision** (partly A11) |
| 11 | Invite several addresses at once from the existing invitation form | ADAPT | LearnUpon (§4) | **New: owner scope decision** |
| 12 | Make the responsive learner journey fast on low bandwidth at 390 px instead of building a native app | ADAPT | TalentLMS and Docebo app limits (§13) | **A13** |
| 13 | Terminology and copy that present AQS as a workspace where organisations train their staff, not as a course seller | ADOPT | Product model; see `page-audit.md` and `copy-changes.md` | **A12** |

**Explicitly skipped** (each conflicts with an approved decision or is out of scope):
- custom roles and permission profiles (C3)
- an external designer role (C3)
- course licensing or sharing between organisations (P18)
- cross-tenant learning reports for Platform Admins (P19, L11)
- custom domains per organisation
- SCORM/xAPI
- native apps and offline mode (D7)
- rule-based enrolment (AQS holds no attribute data)
- admin-set passwords (D33)
