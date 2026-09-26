import { expect, type Page } from "@playwright/test";
import type { MemberSession } from "./api";

/**
 * The app keeps the signed-in member (and their JWT) in its Dexie DB, not in cookies or
 * localStorage (src/lib/memberSession.ts). Google OAuth + PIN can't be automated, so tests
 * sign in by writing that same cached-member row — exactly what cacheActiveMember() writes
 * after a real Google/PIN/demo-launch sign-in.
 */

const DB_NAME = "tallythreads";

/** Opens the app so it creates its Dexie schema, then caches `session` as the active member. */
export async function signInWithSession(page: Page, session: MemberSession): Promise<void> {
  await page.goto("/");
  // main.tsx mounts SyncManager, which opens Dexie on load — wait for the members store.
  await expect
    .poll(
      () =>
        page.evaluate(
          (name) =>
            new Promise<boolean>((resolve) => {
              const req = indexedDB.open(name);
              req.onsuccess = () => {
                const ok = req.result.objectStoreNames.contains("members");
                req.result.close();
                resolve(ok);
              };
              req.onerror = () => resolve(false);
            }),
          DB_NAME,
        ),
      { message: "the app should create its Dexie database" },
    )
    .toBe(true);

  await page.evaluate(
    ({ name, row }) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open(name);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const idb = req.result;
          const tx = idb.transaction("members", "readwrite");
          const store = tx.objectStore("members");
          // Same "switch user" semantics as cacheActiveMember(): one active row.
          const all = store.getAll();
          all.onsuccess = () => {
            for (const m of all.result as { is_active: number }[]) {
              if (m.is_active === 1) store.put({ ...m, is_active: 0 });
            }
            store.put(row);
          };
          tx.oncomplete = () => {
            idb.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    {
      name: DB_NAME,
      row: {
        ...session.member,
        jwt: session.jwt,
        is_active: 1,
        cached_at: new Date().toISOString(),
      },
    },
  );
}

/**
 * Client-side (react-router) navigation without a page reload. Needed offline: a full
 * `page.goto` would have to fetch the app shell from the network.
 */
export async function clientNavigate(page: Page, path: string): Promise<void> {
  await page.evaluate((to) => {
    window.history.pushState({}, "", to);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

/** Reads rows from one of the app's Dexie tables (offline-first local state). */
export async function readLocalRows<T>(page: Page, table: string): Promise<T[]> {
  return page.evaluate(
    ({ name, table }) =>
      new Promise<T[]>((resolve, reject) => {
        const req = indexedDB.open(name);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const idb = req.result;
          const get = idb.transaction(table, "readonly").objectStore(table).getAll();
          get.onsuccess = () => {
            idb.close();
            resolve(get.result as T[]);
          };
          get.onerror = () => reject(get.error);
        };
      }),
    { name: DB_NAME, table },
  );
}
