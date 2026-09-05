# Foundation sprint — status tracker

Update this after every prompt-file run. `Result` is PASS, FAIL (link the
failure slug), or — (not yet run). Run 01→10 in this order the first time
through — each builds on data the earlier ones create. `09` deletes the demo
orgs, so it must run last.

| # | Prompt file | Area | Last run | Result | Failure slug(s) |
|---|---|---|---|---|---|
| 01 | `01-org-creation-independent.prompt.md` | Org creation — independent | 2026-09-03 | PASS | |
| 02 | `02-org-creation-chain-multistore.prompt.md` | Org creation — chain, multi-store | — | — | |
| 03 | `03-org-creation-franchise.prompt.md` | Org creation — franchise | — | — | |
| 04 | `04-org-level-member-invite-and-activation.prompt.md` | Org-level invite + placeholder activation | — | — | |
| 05 | `05-store-level-member-invite-direct.prompt.md` | Store-level direct invite | — | — | |
| 06 | `06-login-routing-single-org.prompt.md` | Login routing — single org/store | — | — | |
| 07 | `07-login-routing-multi-org.prompt.md` | Login routing — multi-org/multi-role (highest priority) | — | — | |
| 08 | `08-store-archive-restore-harddelete.prompt.md` | Store archive / restore / hard-delete | — | — | |
| 09 | `09-org-soft-hard-delete-recreate.prompt.md` | Org disable / hard-delete / recreate — **run last** | — | — | |
| 10 | `10-mobile-375px-check.prompt.md` | 375px mobile viewport pass | — | — | |

The foundation sprint is done when every row reads PASS. After the first
full pass, re-running an individual file to retest one fix doesn't require
re-running the others — unless it's `09` (which wipes the demo data every
other file depends on), in which case start over from `01`.
