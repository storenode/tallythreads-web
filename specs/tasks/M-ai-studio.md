# M-ai-studio — AI Studio (Claude-Powered Content Generation)

**Status:** Draft — scope and role model only, not yet estimated or scheduled into the module roadmap
**Version:** 0.1.0
**Est:** Not yet estimated — gated on the open questions in §5 before this gets a module number (`constitution.md` §5)
**Tracking:** Not yet created — open a GitHub issue once this moves from design to a scheduled build (see Workflow in `specs/tasks/README.md`)
**Parent docs:** `constitution.md` v1.7.0 §2.VI/§3 (the amendment bringing this into scope), `M1b-Core-Tenancy-Schema.md` §1.3 (the Editor role mechanism this reuses), `docs/M-role-permission-model.md` §2–4 (the seeded roles/permissions this doc explains)

This is a starting sketch, not an implementation-ready spec the way `M1-franchise-model.md`
is — real open questions in §5 need answers before this gets hour-estimated and slotted
into the roadmap.

---

## 0. What this is

Constitution §2.VI names AI Studio as "Claude-powered descriptions, video scripts,
review summarization" — content generation and management for a store, done by a
platform-side team (not the store owner or their staff) on the store's behalf. Until
2026-08-26 this was an explicit v1 non-goal (constitution §3), named only so the role
mechanism (`platform_editor`/`platform_content_lead`) had a settled name when the day
came. It's now in scope per the constitution amendment logged in that file's §8 — but
"in scope" here means "worth designing," not "next module to build." §6 below is
explicit about what that does and doesn't imply for sequencing.

## 1. Scope

**In scope for this doc:**
- The role/workflow model: who creates content, who reviews it, who publishes it
- A first-pass data model sketch, for later refinement once the open questions in §5
  are answered
- What's already decided vs. what still needs a real decision

**Explicitly not in scope for this doc:**
- Any actual Claude API integration code
- UI/screens
- Billing model for AI Studio usage (constitution §1.3 of `M1b-Core-Tenancy-Schema.md` notes
  "per-video billing to a store is a separate future concern," not touched here)
- An hour estimate or roadmap slot — this needs the open questions in §5 answered
  first, the same discipline `M1-franchise-model.md` went through before
  `M1-task-plan.md` gave it hours

## 2. Role model (already seeded — see `docs/M-role-permission-model.md`)

Mechanically identical to a store-scoped staff row (`M1b-Core-Tenancy-Schema.md` §1.3): an
editor or content lead gets a `memberships` row with `store_id` set to whichever
store(s) they're assigned to, `organization_id` null. `resolveEntitlements` doesn't
special-case this — it's a store-scoped role like any other, just carrying a
different permission bundle.

| Role | Permissions | Workflow position |
|---|---|---|
| `platform_editor` | `content.create` | Drafts content for their assigned store(s) |
| `platform_content_lead` | `content.create`, `content.review`, `content.publish` | Reviews and publishes editors' drafts; can also draft directly |

Who assigns an editor to a store, and whether the store owner has any say in it, is
one of §5's open questions — drafted as "platform_content_lead assigns editors"
per `M1b-Core-Tenancy-Schema.md` §1's original note, not yet confirmed.

## 3. Data model — first sketch, not locked

```sql
-- Sketch only — content_type/status values and the exact shape of `payload` are
-- open questions (§5), not a final schema.
create table content_items (
  id                uuid primary key default gen_random_uuid(),
  store_id          uuid not null references stores(id),
  content_type      text not null check (content_type in ('product_description', 'video_script', 'review_summary')),
  status            text not null default 'draft'
                      check (status in ('draft', 'in_review', 'published', 'rejected')),
  payload           jsonb not null,        -- shape depends on content_type — open question
  created_by        uuid not null references members(id),
  reviewed_by        uuid references members(id),
  published_at      timestamptz,
  created_at        timestamptz not null default now(),
  last_modified_at  timestamptz not null default now(),
  deleted_at        timestamptz
);
```

Workflow: an editor with a `content.create` grant for a store inserts a `draft` row;
moving it to `in_review` and then `published`/`rejected` requires `content.review`/
`content.publish` respectively — the same shape RLS already enforces for
`store_invitations.status` transitions (`platform admins can update org-scoped
invitations`), just with `has_org_permission`-style checks once this table is real.

## 4. What Purchase-Trip's history suggests about doing this right

`M1-franchise-model.md` and `Store_model_master_plan.md` §5 both show the pattern
this project uses for new money- or content-generating logic: a worked example
against a real case, explicit open questions resolved *before* writing tests, not
after. AI Studio doesn't have a real case yet (no store has asked for generated
content) — which is itself worth naming as the reason this stays a sketch rather
than jumping straight to implementation, the same way Wholesale/Omnichannel stayed
explicitly deferred until a real customer need existed for Franchise.

## 5. Open questions (resolve before this gets an hour estimate)

1. **What actually consumes the Claude API, and where does the key live?** Server-side
   only (an Edge Function calling the Anthropic API with a service-held key), never
   client-side — consistent with how this project already treats all real secrets
   (`APP_JWT_SECRET`, service-role key).
2. **Who assigns an editor to a store** — `platform_content_lead`, `platform_admin`
   only, or does the store owner (`org_owner`) get any input/approval? Drafted as
   content_lead-assigns per `M1b-Core-Tenancy-Schema.md` §1, not confirmed.
3. **Does the store owner see drafts before publish, or only the final published
   content?** Affects whether `store_sales_staff`/`org_owner` need any `content.*`
   read grant at all — none is seeded right now.
4. **Billing** — per-item, per-store monthly, or bundled into the store's TallyThreads
   subscription? `M1b-Core-Tenancy-Schema.md` §1.3 flags this as unresolved.
5. **What happens to `content_items` if a store is deleted or unassigned from an
   editor?** Same soft-delete convention as everywhere else, but worth confirming
   published content doesn't just vanish from wherever it was published to (a
   marketplace listing, a store's public page) when the row is soft-deleted here.

## 6. Sequencing — this is a design pass, not a build slot

Being "in scope" per the constitution amendment means it's no longer forbidden to
work on — it does not jump the module roadmap's queue (`constitution.md` §5's
sequencing rule: M2 offline sync, not started, gates M3/M4/M5 in earnest; AI Studio
was never on that numbered list to begin with and needs its own hour estimate before
it is). The concrete result of this pass is: the role/permission model is seeded and
ready (`docs/M-role-permission-model.md`), and this doc exists so the next real design
session starts from these open questions instead of a blank page.

## Changelog

- **v0.1.0 (2026-08-26)** — Initial draft, written the same session AI Studio moved
  from a `constitution.md` §3 non-goal into scope. Seeds the role model only;
  real implementation design (data model, Claude API integration, billing) waits on
  §5's open questions.

## Notes

- This module has no linked GitHub issue and no hour estimate — per `specs/tasks/README.md`'s
  Workflow section, open one when this moves from a design pass to a scheduled build,
  and put this file's path in the issue body at that point.
