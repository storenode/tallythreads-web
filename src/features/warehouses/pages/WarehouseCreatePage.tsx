import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { SingleSelect } from "@/components/ui/SingleSelect";
import { PageHeading } from "@/components/ui/PageHeading";
import { useMember } from "@/features/auth/useMember";
import { useEntitlements, hasPermission } from "@/features/auth/entitlements";
import { useStoresByOrg } from "@/features/stores/stores";
import type { WarehouseType } from "@/db";
import { createWarehouse, attachStore } from "../data";
import { WAREHOUSE_TYPES, WAREHOUSE_TYPE_META } from "../ui";

/** Create an org-level stock room and optionally attach it to stores. Owner/manager only. */
export default function WarehouseCreatePage() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const listTo = `/org/${orgId}/stores`;
  const { member } = useMember();
  const { data: entitlements } = useEntitlements(member?.id);
  const { data: stores } = useStoresByOrg(orgId);

  const [name, setName] = useState("");
  const [type, setType] = useState<WarehouseType>("stockroom");
  const [note, setNote] = useState("");
  const [attached, setAttached] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!orgId) return null;

  const canDesign = hasPermission(entitlements, "store.edit", {
    organizationId: orgId,
  });
  if (!canDesign) {
    return (
      <p className="text-sm text-fg-muted">
        You don&apos;t have permission to create stock rooms in this organization.
      </p>
    );
  }

  const toggle = (id: string) =>
    setAttached((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    setError(null);
    if (!name.trim()) {
      setError("A name is required.");
      return;
    }
    setSaving(true);
    try {
      const wh = await createWarehouse({
        organization_id: orgId,
        name: name.trim(),
        warehouse_type: type,
        note: note.trim() || null,
        sort_order: 0,
      });
      if (wh.id) {
        for (const storeId of attached) await attachStore(wh.id, storeId);
        navigate(`/org/${orgId}/stock-rooms/${wh.id}/edit`);
      } else {
        navigate(listTo);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the stock room.");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeading
        action={
          <Link
            to={listTo}
            className="text-sm font-medium text-fg-muted hover:text-fg"
          >
            ← Back
          </Link>
        }
      >
        New stock room
      </PageHeading>

      <Card
        title="Stock room"
        desc="A storage space — backyard, stockroom, or godown — that holds stock off the selling floor."
      >
        <div className="space-y-4">
          <Input
            label="Name"
            placeholder="Central Godown"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <SingleSelect
            label="Type"
            placeholder={null}
            value={type}
            onChange={(e) => setType(e.target.value as WarehouseType)}
            options={WAREHOUSE_TYPES.map((t) => ({
              value: t,
              label: WAREHOUSE_TYPE_META[t].label,
            }))}
          />
          <Input
            label="Note (optional)"
            placeholder="Under the stairs, left of the counter"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </Card>

      <Card
        title="Attach to stores"
        desc="Which stores draw stock from this stock room. Leave all unchecked for an org-wide room you attach later."
      >
        {(stores?.length ?? 0) === 0 ? (
          <p className="text-sm text-fg-muted">No stores in this org yet.</p>
        ) : (
          <div className="space-y-2">
            {stores!.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={attached.has(s.id)}
                  onChange={() => toggle(s.id)}
                />
                <span className="text-fg">{s.name}</span>
                {s.store_code && (
                  <span className="text-xs text-fg-muted">{s.store_code}</span>
                )}
              </label>
            ))}
          </div>
        )}
      </Card>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={() => navigate(listTo)}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Creating…" : "Create stock room"}
        </Button>
      </div>
    </div>
  );
}
