/**
 * A UUID identifying this physical browser/device — not a person. Generated once and
 * persisted in localStorage; survives sign-out (device enrollment/PIN state is
 * server-side, keyed on this id + member_id). See specs/tasks/M1a-identity-auth.md.
 */

const STORAGE_KEY = "sp_device_id";

export function getDeviceId(): string {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}
