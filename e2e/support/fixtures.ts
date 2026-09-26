import { test as base, expect, type Page } from "@playwright/test";
import {
  createDemoOrg,
  fetchOwnMember,
  hardDeleteOrg,
  issueDemoGrant,
  redeemDemoGrant,
  type DemoOrg,
  type MemberSession,
} from "./api";
import { jwtPayload, readEnv, runTag, type E2EEnv } from "./env";
import { signInWithSession } from "./session";

interface TestFixtures {
  /** Unique tag for this test's names/emails, e.g. "2609261422ab3f". */
  tag: string;
  /** Register an org id to hard-delete after the test (runs even when the test fails). */
  deleteOrgAfter: (orgId: string) => void;
  /** A page signed in as the platform admin (E2E_ADMIN_JWT). */
  adminPage: Page;
  /** A fresh `is_demo` chain org with an org_owner, deleted after the test. */
  demoOrg: DemoOrg;
  /** The demo org owner's real member session, via demo-login issue → redeem. */
  ownerSession: MemberSession;
  /** A page signed in as the demo org owner. */
  ownerPage: Page;
}

interface WorkerFixtures {
  env: E2EEnv;
  adminSession: MemberSession;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  env: [
    async ({}, use) => {
      await use(readEnv());
    },
    { scope: "worker" },
  ],

  adminSession: [
    async ({ env }, use) => {
      const { sub } = jwtPayload(env.adminJwt);
      if (!sub) throw new Error("E2E_ADMIN_JWT has no subject (member id)");
      const member = await fetchOwnMember(env, env.adminJwt, sub);
      await use({ jwt: env.adminJwt, member });
    },
    { scope: "worker" },
  ],

  tag: async ({}, use) => {
    await use(runTag());
  },

  deleteOrgAfter: async ({ env }, use) => {
    const orgIds: string[] = [];
    await use((id) => orgIds.push(id));
    const failures: string[] = [];
    for (const id of orgIds) {
      try {
        await hardDeleteOrg(env, id);
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err));
      }
    }
    if (failures.length) {
      throw new Error(`E2E cleanup left demo orgs behind:\n${failures.join("\n")}`);
    }
  },

  adminPage: async ({ page, adminSession }, use) => {
    await signInWithSession(page, adminSession);
    await use(page);
  },

  demoOrg: async ({ env, tag, deleteOrgAfter }, use, testInfo) => {
    const org = await createDemoOrg(env, tag, testInfo.title.slice(0, 24));
    deleteOrgAfter(org.id);
    await use(org);
  },

  ownerSession: async ({ env, demoOrg }, use) => {
    const grant = await issueDemoGrant(env, demoOrg.ownerMemberId);
    await use(await redeemDemoGrant(env, grant));
  },

  ownerPage: async ({ page, ownerSession }, use) => {
    await signInWithSession(page, ownerSession);
    await use(page);
  },
});

export { expect };
