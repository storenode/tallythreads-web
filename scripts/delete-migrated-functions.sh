#!/usr/bin/env bash
# Removes the 5 Edge Functions that were replaced by direct PostgREST calls
# (see supabase/migrations/20260826000000_roles_entitlements_rls_policies.sql
# and supabase/config.toml). Run this from the repo root:
#   chmod +x scripts/delete-migrated-functions.sh
#   ./scripts/delete-migrated-functions.sh
#
# mint-member-session, set-pin, and verify-pin are intentionally NOT touched —
# they mint credentials (bcrypt PIN hashing, APP_JWT_SECRET signing) and stay
# as Edge Functions.

set -euo pipefail

FUNCTIONS=(
  get-entitlements
  admin-list-roles
  admin-create-role
  admin-patch-role
  admin-delete-role
)

echo "==> Deleting remote Edge Functions from the linked Supabase project"
for fn in "${FUNCTIONS[@]}"; do
  echo "  - $fn"
  supabase functions delete "$fn"
done

echo "==> Removing local function source"
for fn in "${FUNCTIONS[@]}"; do
  rm -rf "supabase/functions/$fn"
done
rm -f supabase/functions/_shared/authz.ts

echo "==> Done. Verifying nothing local references the removed functions or authz.ts:"
if grep -rn "get-entitlements\|admin-list-roles\|admin-create-role\|admin-patch-role\|admin-delete-role\|_shared/authz" src supabase --include="*.ts" --include="*.tsx" --include="*.toml" 2>/dev/null; then
  echo "  ^ found leftover references above — check them."
else
  echo "  none found."
fi

echo "==> Remote functions remaining:"
supabase functions list
