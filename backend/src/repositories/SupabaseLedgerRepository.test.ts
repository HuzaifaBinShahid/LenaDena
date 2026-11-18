import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import type { Person } from "../domain/types.js";
import { SupabaseLedgerRepository } from "./SupabaseLedgerRepository.js";

const USER = "8a1f5c2e-4b3d-4e6f-8a7b-9c0d1e2f3a4b";
const ALI = "5d1c9a7e-3b2f-4e8a-9c6d-2f7b8e4a1c03";
const BILAL = "6e2d0b8f-4c3a-4f9b-8d7e-3a8c9f5b2d14";

type Reply = { status: number; body?: unknown };
type RpcHandler = (args: Record<string, unknown>) => Reply;
type JsonBody = Record<string, unknown> & { paths?: string[]; prefixes?: string[] };

const raised = (message: string): Reply => ({ status: 400, body: { code: "P0001", details: null, hint: null, message } });

/** Speaks just enough PostgREST and Storage HTTP for the real supabase-js client. Unknown RPCs answer like PostgREST does. */
class FakeSupabase {
  readonly rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  readonly signRequests: string[][] = [];
  readonly removed: string[][] = [];
  /** Every storage removal by bucket, and every call in the order it arrived (for the account-deletion order). */
  readonly removedByBucket: Record<string, string[][]> = {};
  readonly events: string[] = [];
  /** Buckets whose removals fail, and what deleting a sign-in answers. */
  failStorageFor: string | undefined;
  adminDeleteReply: Reply = { status: 200, body: {} };
  url = "";
  private readonly server: Server;

  constructor(private readonly handlers: Record<string, RpcHandler>) {
    this.server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk as Buffer);
      const text = Buffer.concat(chunks).toString("utf8");
      const reply = this.route(request.method ?? "GET", new URL(request.url ?? "/", "http://fake").pathname, text ? JSON.parse(text) as JsonBody : {});
      response.statusCode = reply.status;
      if (reply.body === undefined) {
        response.end();
        return;
      }
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(reply.body));
    });
  }

  async start() {
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    return this;
  }

  stop() {
    return new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  signed(path: string) {
    return `${this.url}/storage/v1/object/sign/avatars/${path}?token=signed`;
  }

  private route(method: string, path: string, body: JsonBody): Reply {
    const rpc = /^\/rest\/v1\/rpc\/(\w+)$/.exec(path)?.[1];
    if (method === "POST" && rpc) {
      this.events.push(`rpc:${rpc}`);
      this.rpcCalls.push({ name: rpc, args: body });
      const handler = this.handlers[rpc];
      if (handler) return handler(body);
      return { status: 404, body: { code: "PGRST202", details: null, hint: null, message: `Could not find the function public.${rpc} in the schema cache` } };
    }
    if (method === "POST" && path === "/storage/v1/object/sign/avatars") {
      const paths = body.paths ?? [];
      this.signRequests.push(paths);
      return { status: 200, body: paths.map((item) => ({ error: null, path: item, signedURL: `/object/sign/avatars/${item}?token=signed` })) };
    }
    const receiptToSign = /^\/storage\/v1\/object\/sign\/receipts\/(.+)$/.exec(path)?.[1];
    if (method === "POST" && receiptToSign) {
      this.events.push(`sign:receipts:${decodeURIComponent(receiptToSign)}`);
      return { status: 200, body: { signedURL: `/object/sign/receipts/${receiptToSign}?token=signed` } };
    }
    const bucket = /^\/storage\/v1\/object\/(avatars|receipts)$/.exec(path)?.[1];
    if (method === "DELETE" && bucket) {
      this.events.push(`storage:${bucket}`);
      (this.removedByBucket[bucket] ??= []).push(body.prefixes ?? []);
      if (bucket === "avatars") this.removed.push(body.prefixes ?? []);
      if (this.failStorageFor === bucket) return { status: 500, body: { message: "storage is down" } };
      return { status: 200, body: [] };
    }
    const adminUser = /^\/auth\/v1\/admin\/users\/([\w-]+)$/.exec(path)?.[1];
    if (method === "DELETE" && adminUser) {
      this.events.push(`auth:delete:${adminUser}`);
      return this.adminDeleteReply;
    }
    return { status: 500, body: { message: `unexpected ${method} ${path}` } };
  }
}

const planHandlers: Record<string, RpcHandler> = {
  app_touch_profile: () => ({ status: 204 }),
  app_get_plan: () => ({ status: 200, body: { user: { id: USER, name: "Huzaifa", email: "h@example.com", avatarUrl: `${USER}/me.jpg` }, totals: [], groups: [], reviews: [], claims: [], activity: [] } }),
  app_get_transactions: () => ({ status: 200, body: [{ id: "entry-1", source: "personal", title: "Lunch", eventDate: "2026-09-18", amountMinor: 1000, currency: "PKR", direction: "outgoing", kind: "expense", counterparty: "Ali", personId: ALI, status: "open", createdAt: "2026-09-18T08:00:00+00:00" }] }),
};

const running: Array<{ stop: () => Promise<unknown> }> = [];

async function setup(handlers: Record<string, RpcHandler>) {
  const fake = await new FakeSupabase(handlers).start();
  const warnings: string[] = [];
  const client = createClient(fake.url, "test-secret", { auth: { autoRefreshToken: false, persistSession: false } });
  const repository = new SupabaseLedgerRepository(client, { warn: (message) => warnings.push(message) });
  running.push(fake);
  return { fake, repository, warnings };
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((item) => item.stop()));
});

describe("SupabaseLedgerRepository people", () => {
  it("sends selected personal entries to the bulk settlement RPC", async () => {
    const { fake, repository } = await setup({ app_settle_personal_transactions: () => ({ status: 204 }) });
    await repository.settlePersonalTransactions(USER, [ALI, BILAL], "bulk-settle-key-0001");
    expect(fake.rpcCalls.at(-1)).toEqual({
      name: "app_settle_personal_transactions",
      args: { p_actor: USER, p_transactions: [ALI, BILAL], p_idempotency_key: "bulk-settle-key-0001" },
    });
  });

  it("serves people with the plan and signs every photo in one storage request", async () => {
    const people: Person[] = [
      { id: ALI, name: "Ali", avatarPath: `${USER}/ali.jpg`, emailUpdates: true, reminderFrequency: "off", createdAt: "2026-09-08T17:45:00+00:00" },
      { id: BILAL, name: "Bilal", email: "bilal@example.com", emailUpdates: true, reminderFrequency: "off", createdAt: "2026-09-09T10:00:00+00:00" },
    ];
    const { fake, repository } = await setup({ ...planHandlers, app_get_people: () => ({ status: 200, body: people }) });
    const plan = await repository.getPlan(USER);
    expect(fake.signRequests).toEqual([[`${USER}/me.jpg`, `${USER}/ali.jpg`]]);
    expect(plan.user.avatarUrl).toBe(fake.signed(`${USER}/me.jpg`));
    expect(plan.people).toEqual([{ ...people[0], avatarUrl: fake.signed(`${USER}/ali.jpg`) }, people[1]]);
    expect(plan.transactions[0]).toMatchObject({ personId: ALI });
  });

  it("keeps plans working before the People migration, warns once, and answers 503 for people writes", async () => {
    const { fake, repository, warnings } = await setup({ ...planHandlers, app_create_personal_transaction: () => ({ status: 200, body: "3b9c2f4e-8a1d-4c5b-9e6f-7a8b9c0d1e2f" }) });
    const { app } = await buildApp({ config: { nodeEnv: "test", authMode: "demo" }, repository });
    running.push({ stop: () => app.close() });
    const headers = { "x-user-id": USER };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const plan = await app.inject({ method: "GET", url: "/v1/me/plan", headers });
      expect(plan.statusCode).toBe(200);
      expect(plan.json().people).toEqual([]);
    }
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("202609180007");

    const unavailable = { code: "people_unavailable", message: "People needs the latest database update (migration 202609180007)." };
    const created = await app.inject({ method: "POST", url: "/v1/people", headers, payload: { name: "Ali" } });
    expect(created.statusCode).toBe(503);
    expect(created.json()).toMatchObject(unavailable);
    const renamed = await app.inject({ method: "PATCH", url: `/v1/people/${ALI}`, headers, payload: { name: "Ali Raza" } });
    expect(renamed.statusCode).toBe(503);
    expect(renamed.json()).toMatchObject(unavailable);
    const deleted = await app.inject({ method: "DELETE", url: `/v1/people/${ALI}`, headers });
    expect(deleted.statusCode).toBe(503);
    expect(deleted.json()).toMatchObject(unavailable);

    // personId rides inside p_payload, so the pre-People RPC (same signature) simply ignores it.
    const entry = await app.inject({
      method: "POST",
      url: "/v1/personal-transactions",
      headers: { ...headers, "idempotency-key": "entry-before-migration" },
      payload: { title: "Lunch", eventDate: "2026-09-18", amountMinor: 1000, currency: "PKR", kind: "expense", direction: "outgoing", counterparty: "Ali", personId: ALI },
    });
    expect(entry.statusCode).toBe(201);
    const call = fake.rpcCalls.find((item) => item.name === "app_create_personal_transaction");
    expect(Object.keys(call?.args ?? {}).sort()).toEqual(["p_actor", "p_idempotency_key", "p_payload"]);
    expect(call?.args.p_payload).toMatchObject({ counterparty: "Ali", personId: ALI });
  });

  it("maps the errors the People RPCs raise and validates before calling the database", async () => {
    const { fake, repository } = await setup({
      app_create_person: () => raised("person_exists"),
      app_update_person: () => raised("person_not_found"),
      app_create_personal_transaction: () => raised("person_not_found"),
    });
    await expect(repository.createPerson(USER, { name: "Ali" })).rejects.toMatchObject({ statusCode: 409, code: "person_exists" });
    await expect(repository.updatePerson(USER, ALI, { name: "Ali Raza" })).rejects.toMatchObject({ statusCode: 404, code: "person_not_found" });
    await expect(repository.createPersonalTransaction(USER, { title: "Lunch", eventDate: "2026-09-18", amountMinor: 1000, currency: "PKR", kind: "expense", direction: "outgoing", counterparty: "Ali", personId: ALI }, "entry-key-0001"))
      .rejects.toMatchObject({ statusCode: 404, code: "person_not_found" });

    const callsBefore = fake.rpcCalls.length;
    await expect(repository.createPerson(USER, { name: "Ali", avatarPath: "someone-else/ali.jpg" })).rejects.toMatchObject({ statusCode: 400, code: "invalid_avatar_path" });
    await expect(repository.updatePerson(USER, ALI, { email: "not-an-email" })).rejects.toMatchObject({ statusCode: 400, code: "invalid_email" });
    await expect(repository.deletePerson(USER, "not-a-uuid")).rejects.toMatchObject({ statusCode: 404, code: "person_not_found" });
    expect(fake.rpcCalls.length).toBe(callsBefore);
  });

  it("removes a replaced or deleted photo, and sends explicit presence flags", async () => {
    const people: Person[] = [{ id: ALI, name: "Ali", email: "ali@example.com", avatarPath: `${USER}/old.jpg`, emailUpdates: true, reminderFrequency: "off", createdAt: "2026-09-08T17:45:00+00:00" }];
    const { fake, repository } = await setup({
      app_get_people: () => ({ status: 200, body: people }),
      app_update_person: ({ p_payload: payload }) => {
        const changes = payload as { updateName: boolean; name: string | null; updateAvatar: boolean; avatarPath: string | null };
        const person = people[0]!;
        if (changes.updateName && changes.name) person.name = changes.name;
        if (changes.updateAvatar) {
          if (changes.avatarPath) person.avatarPath = changes.avatarPath;
          else delete person.avatarPath;
        }
        return { status: 204 };
      },
      app_delete_person: () => {
        people.splice(0, 1);
        return { status: 204 };
      },
    });

    const replaced = await repository.updatePerson(USER, ALI, { avatarPath: `${USER}/new.jpg` });
    expect(replaced).toEqual({ id: ALI, name: "Ali", email: "ali@example.com", avatarPath: `${USER}/new.jpg`, avatarUrl: fake.signed(`${USER}/new.jpg`), emailUpdates: true, reminderFrequency: "off", createdAt: "2026-09-08T17:45:00+00:00" });
    expect(fake.rpcCalls.find((item) => item.name === "app_update_person")?.args.p_payload)
      .toEqual({ updateName: false, name: null, updateEmail: false, email: null, updateAvatar: true, avatarPath: `${USER}/new.jpg`, updateEmailUpdates: false, emailUpdates: null, updateReminderFrequency: false, reminderFrequency: null });
    expect(fake.removed).toEqual([[`${USER}/old.jpg`]]);

    await repository.updatePerson(USER, ALI, { name: "Ali Raza" });
    expect(fake.removed).toHaveLength(1);

    await repository.deletePerson(USER, ALI);
    expect(fake.removed).toEqual([[`${USER}/old.jpg`], [`${USER}/new.jpg`]]);
  });

  it("queues person invites through app_invite_person and maps its errors", async () => {
    const { fake, repository } = await setup({ app_invite_person: () => ({ status: 200, body: "2026-09-18T08:00:00.123456+00:00" }) });
    await expect(repository.invitePerson(USER, ALI, "https://i.loadly.io/lenadena")).resolves.toEqual({ queuedAt: "2026-09-18T08:00:00.123Z" });
    expect(fake.rpcCalls.at(-1)).toEqual({ name: "app_invite_person", args: { p_actor: USER, p_person: ALI, p_download_url: "https://i.loadly.io/lenadena" } });
    await repository.invitePerson(USER, ALI, null);
    expect(fake.rpcCalls.at(-1)?.args.p_download_url).toBeNull();
    await expect(repository.invitePerson(USER, "not-a-uuid", null)).rejects.toMatchObject({ statusCode: 404, code: "person_not_found" });
    expect(fake.rpcCalls).toHaveLength(2);

    for (const [message, statusCode, code] of [
      ["person_not_found", 404, "person_not_found"],
      ["person_has_no_email", 400, "person_has_no_email"],
      ["invite_recently_sent", 429, "invite_recently_sent"],
    ] as const) {
      const failing = await setup({ app_invite_person: () => raised(message) });
      await expect(failing.repository.invitePerson(USER, ALI, null)).rejects.toMatchObject({ statusCode, code });
    }
    const missing = await setup({});
    await expect(missing.repository.invitePerson(USER, ALI, null)).rejects.toMatchObject({ statusCode: 503, code: "people_unavailable" });
  });
});

const ENTRY = "7f3e1c9a-5d4b-4a0c-9e8f-4b9d0a6c3e25";
const entryInput = { title: "Lunch", eventDate: "2026-11-10", amountMinor: 50000, currency: "PKR", kind: "expense", direction: "outgoing", counterparty: "Ali", personId: ALI } as const;

describe("SupabaseLedgerRepository person emails", () => {
  it("fills in the email settings for rows from a database without migration 202611100010", async () => {
    const { repository } = await setup({ ...planHandlers, app_get_people: () => ({ status: 200, body: [{ id: ALI, name: "Ali", createdAt: "2026-09-08T17:45:00+00:00" }] }) });
    const plan = await repository.getPlan(USER);
    expect(plan.people[0]).toMatchObject({ emailUpdates: true, reminderFrequency: "off" });
  });

  it("saving an entry sends no email and does not even ask the database to decide", async () => {
    const created = await setup({ app_create_personal_transaction: () => ({ status: 200, body: ENTRY }), app_notify_new_entry: () => ({ status: 200, body: { action: "sent" } }) });
    await expect(created.repository.createPersonalTransaction(USER, entryInput, "entry-key-0001")).resolves.toEqual({ id: ENTRY });
    expect(created.fake.rpcCalls.map((call) => call.name)).toEqual(["app_create_personal_transaction"]);
    expect(created.fake.rpcCalls.some((call) => call.name === "app_notify_new_entry" || call.name === "app_queue_person_email")).toBe(false);
  });

  it("sends the new settings with explicit flags and rejects an unknown reminder schedule", async () => {
    const people: Person[] = [{ id: ALI, name: "Ali", email: "ali@example.com", ...{ emailUpdates: false, reminderFrequency: "weekly" as const }, createdAt: "2026-09-08T17:45:00+00:00" }];
    const { fake, repository } = await setup({ app_get_people: () => ({ status: 200, body: people }), app_update_person: () => ({ status: 204 }) });
    const updated = await repository.updatePerson(USER, ALI, { emailUpdates: false, reminderFrequency: "weekly" });
    expect(updated).toMatchObject({ emailUpdates: false, reminderFrequency: "weekly" });
    expect(fake.rpcCalls.find((item) => item.name === "app_update_person")?.args.p_payload)
      .toMatchObject({ updateEmailUpdates: true, emailUpdates: false, updateReminderFrequency: true, reminderFrequency: "weekly", updateName: false });
    await expect(repository.updatePerson(USER, ALI, { reminderFrequency: "daily" as never })).rejects.toMatchObject({ statusCode: 400, code: "invalid_reminder_frequency" });
  });

  it("adding or changing an address sends nothing: no statement is queued", async () => {
    const withEmail: Person = { id: ALI, name: "Ali", email: "ali@example.com", emailUpdates: true, reminderFrequency: "off", createdAt: "2026-09-08T17:45:00+00:00" };
    const { fake, repository } = await setup({
      // The person as the database holds them after the edit.
      app_get_people: () => ({ status: 200, body: [withEmail] }),
      app_update_person: () => ({ status: 204 }),
      app_queue_person_email: () => ({ status: 200, body: "2026-11-10T09:00:00+00:00" }),
    });
    const result = await repository.updatePerson(USER, ALI, { email: "ali@example.com" });
    expect(result).toMatchObject({ id: ALI, email: "ali@example.com" });
    expect(result).not.toHaveProperty("statementQueued");
    expect(fake.rpcCalls.some((item) => item.name === "app_queue_person_email" || item.name === "app_notify_new_entry")).toBe(false);
  });

  it("emails a statement through app_queue_person_email and maps its errors", async () => {
    const { fake, repository } = await setup({ app_queue_person_email: () => ({ status: 200, body: "2026-11-10T09:00:00.123456+00:00" }) });
    await expect(repository.emailPerson(USER, ALI)).resolves.toEqual({ queuedAt: "2026-11-10T09:00:00.123Z" });
    expect(fake.rpcCalls.at(-1)).toEqual({ name: "app_queue_person_email", args: { p_actor: USER, p_person: ALI, p_kind: "statement", p_transaction: null } });
    await expect(repository.emailPerson(USER, "not-a-uuid")).rejects.toMatchObject({ statusCode: 404, code: "person_not_found" });
    expect(fake.rpcCalls).toHaveLength(1);

    for (const [message, statusCode, code] of [
      ["person_not_found", 404, "person_not_found"],
      ["person_has_no_email", 400, "person_has_no_email"],
      ["email_recently_sent", 429, "email_recently_sent"],
      ["email_limit_reached", 429, "email_limit_reached"],
      ["no_entries", 400, "no_entries"],
    ] as const) {
      const failing = await setup({ app_queue_person_email: () => raised(message) });
      await expect(failing.repository.emailPerson(USER, ALI)).rejects.toMatchObject({ statusCode, code });
    }
    const missing = await setup({});
    await expect(missing.repository.emailPerson(USER, ALI)).rejects.toMatchObject({ statusCode: 503, code: "email_unavailable" });
  });
});

describe("SupabaseLedgerRepository account deletion", () => {
  const paths = { avatars: [`${USER}/me.jpg`, `${USER}/ali.jpg`], receipts: [`${USER}/receipt-1.jpg`] };
  const handlers = (): Record<string, RpcHandler> => ({
    app_account_storage_paths: () => ({ status: 200, body: paths }),
    app_delete_account: () => ({ status: 204 }),
  });

  it("removes the files, then the data, then the sign-in, in that order", async () => {
    const { fake, repository } = await setup(handlers());
    await expect(repository.deleteAccount(USER)).resolves.toBeUndefined();
    expect(fake.events).toEqual([
      "rpc:app_account_storage_paths", "storage:avatars", "storage:receipts", "rpc:app_delete_account", `auth:delete:${USER}`,
    ]);
    expect(fake.removedByBucket.avatars).toEqual([paths.avatars]);
    expect(fake.removedByBucket.receipts).toEqual([paths.receipts]);
    expect(fake.rpcCalls.find((call) => call.name === "app_delete_account")?.args).toEqual({ p_actor: USER });
  });

  it("never asks storage to remove a file outside the person's own folder", async () => {
    const sneaky = { avatars: [`${USER}/me.jpg`, `${BILAL}/theirs.jpg`, `${USER}/../${BILAL}/theirs.jpg`], receipts: [`${BILAL}/theirs.jpg`] };
    const { fake, repository } = await setup({ ...handlers(), app_account_storage_paths: () => ({ status: 200, body: sneaky }) });
    await repository.deleteAccount(USER);
    expect(fake.removedByBucket.avatars).toEqual([[`${USER}/me.jpg`]]);
    expect(fake.removedByBucket.receipts).toBeUndefined();
  });

  it("skips storage entirely when there is nothing to remove", async () => {
    const { fake, repository } = await setup({ ...handlers(), app_account_storage_paths: () => ({ status: 200, body: { avatars: [], receipts: [] } }) });
    await repository.deleteAccount(USER);
    expect(fake.events).toEqual(["rpc:app_account_storage_paths", "rpc:app_delete_account", `auth:delete:${USER}`]);
  });

  it("stops before changing any data when a file cannot be removed", async () => {
    const { fake, repository, warnings } = await setup(handlers());
    fake.failStorageFor = "receipts";
    await expect(repository.deleteAccount(USER)).rejects.toMatchObject({ statusCode: 500, code: "account_deletion_failed" });
    expect(fake.events).not.toContain("rpc:app_delete_account");
    expect(fake.events.some((event) => event.startsWith("auth:delete"))).toBe(false);
    expect(warnings.some((message) => message.includes("receipts"))).toBe(true);
  });

  it("keeps the sign-in until the data is deleted, so a failed attempt can be retried", async () => {
    const { fake, repository } = await setup({ ...handlers(), app_delete_account: () => raised("boom") });
    await expect(repository.deleteAccount(USER)).rejects.toMatchObject({ statusCode: 500, code: "account_deletion_failed" });
    expect(fake.events.some((event) => event.startsWith("auth:delete"))).toBe(false);
  });

  it("says the database needs the update when the functions are missing", async () => {
    const { repository } = await setup({});
    await expect(repository.deleteAccount(USER)).rejects.toMatchObject({ statusCode: 503, code: "account_deletion_unavailable" });
    const half = await setup({ app_account_storage_paths: () => ({ status: 200, body: { avatars: [], receipts: [] } }) });
    await expect(half.repository.deleteAccount(USER)).rejects.toMatchObject({ statusCode: 503, code: "account_deletion_unavailable" });
  });

  it("counts a sign-in that is already gone as done, but reports any other failure", async () => {
    const gone = await setup(handlers());
    gone.fake.adminDeleteReply = { status: 404, body: { code: 404, error_code: "user_not_found", msg: "User not found" } };
    await expect(gone.repository.deleteAccount(USER)).resolves.toBeUndefined();

    const broken = await setup(handlers());
    broken.fake.adminDeleteReply = { status: 500, body: { code: 500, error_code: "unexpected_failure", msg: "boom" } };
    await expect(broken.repository.deleteAccount(USER)).rejects.toMatchObject({ statusCode: 500, code: "account_deletion_failed" });
    expect(broken.fake.events).toContain("rpc:app_delete_account");
  });
});

describe("SupabaseLedgerRepository editing and deleting", () => {
  const EXPENSE = "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f";
  const ENTRY = "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
  const OLD_PHOTO = `${USER}/old-receipt.jpg`;
  const NEW_PHOTO = `${USER}/new-receipt.jpg`;
  const body = { eventName: "Dinner", eventDate: "2026-11-04", amountMinor: 1000, splitMethod: "equal" as const, shares: [{ memberId: USER, amountMinor: 1000 }] };
  const entryBody = { title: "Lunch", eventDate: "2026-11-04", amountMinor: 1000, currency: "PKR", kind: "expense" as const, direction: "outgoing" as const, counterparty: "Ali" };
  const payloadOf = (fake: FakeSupabase) => fake.rpcCalls.at(-1)!.args.p_payload as Record<string, unknown>;

  it("reads one expense and signs its photo for the preview, only when it has one", async () => {
    const withPhoto = await setup({ app_get_expense: () => ({ status: 200, body: { id: EXPENSE, receiptPath: OLD_PHOTO, canEdit: true, canDelete: true } }) });
    const detail = await withPhoto.repository.getExpense(USER, EXPENSE);
    expect(withPhoto.fake.rpcCalls.at(-1)).toEqual({ name: "app_get_expense", args: { p_actor: USER, p_expense: EXPENSE } });
    expect(detail.receiptUrl).toContain(`/object/sign/receipts/${OLD_PHOTO}`);
    expect(detail.receiptPath).toBe(OLD_PHOTO);

    const without = await setup({ app_get_expense: () => ({ status: 200, body: { id: EXPENSE, canEdit: false, editBlockedReason: "not_yours", canDelete: false } }) });
    expect(await without.repository.getExpense(USER, EXPENSE)).toMatchObject({ canEdit: false, editBlockedReason: "not_yours" });
    expect(without.fake.events.filter((event) => event.startsWith("sign:"))).toEqual([]);
  });

  it("treats a malformed id as 'not found' without asking the database", async () => {
    const { fake, repository } = await setup({});
    await expect(repository.getExpense(USER, "not-a-uuid")).rejects.toMatchObject({ statusCode: 404, code: "not_found" });
    await expect(repository.updateExpense(USER, "../x", body, "edit-key-0001")).rejects.toMatchObject({ statusCode: 404 });
    await expect(repository.deleteExpense(USER, "1; drop table")).rejects.toMatchObject({ statusCode: 404 });
    await expect(repository.updatePersonalTransaction(USER, "nope", entryBody)).rejects.toMatchObject({ statusCode: 404 });
    await expect(repository.deletePersonalTransaction(USER, "nope")).rejects.toMatchObject({ statusCode: 404 });
    expect(fake.rpcCalls).toEqual([]);
  });

  it("sends the receipt change exactly as chosen: absent keeps, null or empty removes, a path replaces", async () => {
    const { fake, repository } = await setup({ app_update_expense: () => ({ status: 200, body: { id: EXPENSE, previousReceiptPath: null } }) });
    await repository.updateExpense(USER, EXPENSE, body, "edit-key-0001");
    expect(Object.hasOwn(payloadOf(fake), "receiptUri")).toBe(false);
    expect(fake.rpcCalls.at(-1)!.args).toMatchObject({ p_actor: USER, p_expense: EXPENSE, p_idempotency_key: "edit-key-0001" });
    await repository.updateExpense(USER, EXPENSE, { ...body, receiptUri: null }, "edit-key-0002");
    expect(payloadOf(fake).receiptUri).toBeNull();
    await repository.updateExpense(USER, EXPENSE, { ...body, receiptUri: "" }, "edit-key-0003");
    expect(payloadOf(fake).receiptUri).toBeNull();
    await repository.updateExpense(USER, EXPENSE, { ...body, receiptUri: NEW_PHOTO }, "edit-key-0004");
    expect(payloadOf(fake).receiptUri).toBe(NEW_PHOTO);
    expect(fake.removedByBucket.receipts).toBeUndefined();
  });

  it("removes the replaced photo from storage after the edit, and only the one the database names", async () => {
    const { fake, repository } = await setup({ app_update_expense: () => ({ status: 200, body: { id: EXPENSE, previousReceiptPath: OLD_PHOTO } }) });
    expect(await repository.updateExpense(USER, EXPENSE, { ...body, receiptUri: NEW_PHOTO }, "edit-key-0005")).toEqual({ id: EXPENSE });
    expect(fake.removedByBucket.receipts).toEqual([[OLD_PHOTO]]);
    expect(fake.events.indexOf("rpc:app_update_expense")).toBeLessThan(fake.events.indexOf("storage:receipts"));
  });

  it("never fails an edit that already succeeded because an old photo could not be removed", async () => {
    const { fake, repository, warnings } = await setup({ app_update_expense: () => ({ status: 200, body: { id: EXPENSE, previousReceiptPath: OLD_PHOTO } }) });
    fake.failStorageFor = "receipts";
    await expect(repository.updateExpense(USER, EXPENSE, { ...body, receiptUri: null }, "edit-key-0006")).resolves.toEqual({ id: EXPENSE });
    expect(warnings.some((message) => message.includes("replaced receipt photo"))).toBe(true);
  });

  it("deleting removes the photo the database hands back, for expenses and for individual balances", async () => {
    const expense = await setup({ app_delete_expense: () => ({ status: 200, body: { receiptPath: OLD_PHOTO } }) });
    await expense.repository.deleteExpense(USER, EXPENSE);
    expect(expense.fake.rpcCalls.at(-1)).toEqual({ name: "app_delete_expense", args: { p_actor: USER, p_expense: EXPENSE } });
    expect(expense.fake.removedByBucket.receipts).toEqual([[OLD_PHOTO]]);

    const entry = await setup({ app_delete_personal_transaction: () => ({ status: 200, body: { receiptPath: null } }) });
    await entry.repository.deletePersonalTransaction(USER, ENTRY);
    expect(entry.fake.rpcCalls.at(-1)).toEqual({ name: "app_delete_personal_transaction", args: { p_actor: USER, p_id: ENTRY } });
    expect(entry.fake.removedByBucket.receipts).toBeUndefined();
  });

  it("changes an individual balance and removes its replaced photo", async () => {
    const { fake, repository } = await setup({ app_update_personal_transaction: () => ({ status: 200, body: { id: ENTRY, previousReceiptPath: OLD_PHOTO } }) });
    expect(await repository.updatePersonalTransaction(USER, ENTRY, { ...entryBody, personId: ALI, receiptUri: null })).toEqual({ id: ENTRY });
    expect(fake.rpcCalls.at(-1)!.args).toMatchObject({ p_actor: USER, p_id: ENTRY, p_payload: { ...entryBody, personId: ALI, receiptUri: null } });
    expect(fake.removedByBucket.receipts).toEqual([[OLD_PHOTO]]);
  });

  it("maps what the database raises to clear errors", async () => {
    const raiseOn = (rpc: string, message: string) => ({ [rpc]: () => raised(message) });
    const cases: Array<[string, string, (repository: SupabaseLedgerRepository) => Promise<unknown>, Record<string, unknown>]> = [
      ["app_get_expense", "expense_not_found", (r) => r.getExpense(USER, EXPENSE), { statusCode: 404, code: "not_found" }],
      ["app_update_expense", "not_allowed", (r) => r.updateExpense(USER, EXPENSE, body, "edit-key-0007"), { statusCode: 403, code: "forbidden" }],
      ["app_delete_expense", "not_allowed", (r) => r.deleteExpense(USER, EXPENSE), { statusCode: 403, code: "forbidden" }],
      ["app_update_expense", "participant_left", (r) => r.updateExpense(USER, EXPENSE, body, "edit-key-0008"), { statusCode: 409, code: "participant_left" }],
      ["app_update_expense", "shares must equal amount", (r) => r.updateExpense(USER, EXPENSE, body, "edit-key-0009"), { statusCode: 400, code: "database_error", message: "shares must equal amount" }],
      ["app_update_expense", "invalid_receipt_path", (r) => r.updateExpense(USER, EXPENSE, body, "edit-key-0010"), { statusCode: 400, code: "invalid_receipt" }],
      ["app_update_personal_transaction", "entry_not_found", (r) => r.updatePersonalTransaction(USER, ENTRY, entryBody), { statusCode: 404, code: "not_found" }],
      ["app_update_personal_transaction", "entry_has_payments", (r) => r.updatePersonalTransaction(USER, ENTRY, entryBody), { statusCode: 409, code: "entry_has_payments" }],
      ["app_update_personal_transaction", "entry_settled", (r) => r.updatePersonalTransaction(USER, ENTRY, entryBody), { statusCode: 409, code: "entry_settled" }],
      ["app_update_personal_transaction", "amount_below_paid", (r) => r.updatePersonalTransaction(USER, ENTRY, entryBody), { statusCode: 409, code: "amount_below_paid" }],
      ["app_update_personal_transaction", "invalid_amount", (r) => r.updatePersonalTransaction(USER, ENTRY, entryBody), { statusCode: 400, code: "invalid_amount" }],
      ["app_update_personal_transaction", "person_not_found", (r) => r.updatePersonalTransaction(USER, ENTRY, entryBody), { code: "person_not_found" }],
      ["app_delete_personal_transaction", "entry_not_found", (r) => r.deletePersonalTransaction(USER, ENTRY), { statusCode: 404 }],
    ];
    for (const [rpc, message, call, expected] of cases) {
      const { repository } = await setup(raiseOn(rpc, message));
      await expect(call(repository)).rejects.toMatchObject(expected);
    }
  });

  it("says editing is not switched on yet when the database has not been updated", async () => {
    const { repository } = await setup({});
    const unavailable = { statusCode: 503, code: "edit_unavailable" };
    await expect(repository.getExpense(USER, EXPENSE)).rejects.toMatchObject(unavailable);
    await expect(repository.updateExpense(USER, EXPENSE, body, "edit-key-0011")).rejects.toMatchObject(unavailable);
    await expect(repository.deleteExpense(USER, EXPENSE)).rejects.toMatchObject(unavailable);
    await expect(repository.updatePersonalTransaction(USER, ENTRY, entryBody)).rejects.toMatchObject(unavailable);
    await expect(repository.deletePersonalTransaction(USER, ENTRY)).rejects.toMatchObject(unavailable);
  });

  it("keeps canEdit, canDelete and editedAt on the plan the app receives (the response schema must not strip them)", async () => {
    const rows = [
      { id: "a", source: "personal", title: "Lunch", eventDate: "2026-09-18", amountMinor: 1000, currency: "PKR", direction: "outgoing", kind: "expense", canEdit: true, canDelete: true, createdAt: "2026-09-18T10:00:00+00:00" },
      { id: "b", source: "group", groupId: "g", groupName: "Crew", title: "Dinner", eventDate: "2026-09-18", amountMinor: 1000, currency: "PKR", direction: "incoming", kind: "expense", canEdit: true, canDelete: true, editedAt: "2026-09-19T10:00:00+00:00", createdAt: "2026-09-18T09:00:00+00:00" },
      { id: "c", source: "group", groupId: "g", groupName: "Crew", title: "Payment completed", eventDate: "2026-09-18", amountMinor: 500, currency: "PKR", direction: "incoming", kind: "payment", canEdit: false, canDelete: false, createdAt: "2026-09-18T08:00:00+00:00" },
    ];
    const { repository } = await setup({ ...planHandlers, app_get_transactions: () => ({ status: 200, body: rows }), app_get_people: () => ({ status: 200, body: [] }) });
    const { app } = await buildApp({ config: { nodeEnv: "test", authMode: "demo" }, repository });
    running.push({ stop: () => app.close() });
    const response = await app.inject({ method: "GET", url: "/v1/me/plan", headers: { "x-user-id": USER } });
    expect(response.statusCode).toBe(200);
    const byId = Object.fromEntries((response.json().transactions as Array<Record<string, unknown>>).map((row) => [row.id, row]));
    expect(byId.a).toMatchObject({ canEdit: true, canDelete: true });
    expect(byId.b).toMatchObject({ canEdit: true, canDelete: true, editedAt: "2026-09-19T10:00:00+00:00" });
    expect(byId.c).toMatchObject({ canEdit: false, canDelete: false });
  });
});

describe("SupabaseLedgerRepository export", () => {
  const document = { format: "lenadena-export", version: 1, exportedAt: "2026-11-17T10:00:00Z", account: { name: "Huzaifa", email: "h@example.com", createdAt: "2026-09-01T00:00:00Z" }, groups: [], expenses: [], payments: [], individualBalances: [], people: [], activity: [], emails: [] };

  it("asks the database for the person's own document and passes it through", async () => {
    const { fake, repository } = await setup({ app_export_data: () => ({ status: 200, body: document }) });
    expect(await repository.exportData(USER)).toEqual(document);
    expect(fake.rpcCalls.at(-1)).toEqual({ name: "app_export_data", args: { p_actor: USER } });
  });

  it("says export is not switched on yet when the database has not been updated", async () => {
    const { repository } = await setup({});
    await expect(repository.exportData(USER)).rejects.toMatchObject({ statusCode: 503, code: "export_unavailable" });
  });

  it("maps a missing profile to 'not found' and any other failure to a database error", async () => {
    const missing = await setup({ app_export_data: () => raised("profile_not_found") });
    await expect(missing.repository.exportData(USER)).rejects.toMatchObject({ statusCode: 404, code: "not_found" });
    const broken = await setup({ app_export_data: () => raised("something else broke") });
    await expect(broken.repository.exportData(USER)).rejects.toMatchObject({ statusCode: 500, code: "database_error" });
  });
});

describe("SupabaseLedgerRepository group management", () => {
  const GROUP = "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d";
  const INVITE = "2c3d4e5f-6071-4b8c-9d0e-1f2a3b4c5d6e";
  const OTHER = "3d4e5f60-7182-4c9d-8e1f-2a3b4c5d6e7f";

  it("invites by email through the database function and returns its link", async () => {
    const { fake, repository } = await setup({ app_invite_member: () => ({ status: 200, body: { url: "lenadena://invite/abc", expiresAt: "2026-11-24T10:00:00Z" } }) });
    expect(await repository.inviteMember(USER, GROUP, "friend@example.com")).toEqual({ url: "lenadena://invite/abc", expiresAt: "2026-11-24T10:00:00Z" });
    expect(fake.rpcCalls.at(-1)).toEqual({ name: "app_invite_member", args: { p_actor: USER, p_group: GROUP, p_email: "friend@example.com" } });
  });

  it("lists open invitations, and accepting one returns the group", async () => {
    const invitations = [{ id: INVITE, groupId: GROUP, groupName: "Crew", invitedBy: "Sara", createdAt: "2026-11-17T10:00:00Z", expiresAt: "2026-11-24T10:00:00Z" }];
    const { fake, repository } = await setup({
      ...planHandlers,
      app_get_plan: () => ({ status: 200, body: { user: { id: USER, name: "Huzaifa", email: "h@example.com" }, totals: [], groups: [{ id: GROUP, name: "Crew", currency: "PKR", accent: "#6848E6", balanceMinor: 0, role: "member", members: [] }], reviews: [], claims: [], activity: [] } }),
      app_list_invitations: () => ({ status: 200, body: invitations }),
      app_accept_invitation: () => ({ status: 200, body: GROUP }),
      app_get_people: () => ({ status: 200, body: [] }),
    });
    expect(await repository.listInvitations(USER)).toEqual(invitations);
    const group = await repository.acceptInvitation(USER, INVITE);
    expect(group).toMatchObject({ id: GROUP, name: "Crew" });
    expect(fake.rpcCalls.find((call) => call.name === "app_accept_invitation")!.args).toEqual({ p_actor: USER, p_invite: INVITE });
  });

  it("declines, leaves, removes and renames through their functions", async () => {
    const ok = () => ({ status: 204 });
    const { fake, repository } = await setup({ app_decline_invitation: ok, app_leave_group: ok, app_remove_member: ok, app_rename_group: ok });
    await repository.declineInvitation(USER, INVITE);
    await repository.leaveGroup(USER, GROUP);
    await repository.removeMember(USER, GROUP, OTHER);
    await repository.renameGroup(USER, GROUP, "New name");
    expect(fake.rpcCalls.map((call) => [call.name, call.args])).toEqual([
      ["app_decline_invitation", { p_actor: USER, p_invite: INVITE }],
      ["app_leave_group", { p_actor: USER, p_group: GROUP }],
      ["app_remove_member", { p_actor: USER, p_group: GROUP, p_member: OTHER }],
      ["app_rename_group", { p_actor: USER, p_group: GROUP, p_name: "New name" }],
    ]);
  });

  it("serves the member list with photos signed, and never the storage path", async () => {
    const people = { canManage: true, members: [{ id: USER, name: "Huzaifa", avatarPath: `${USER}/me.jpg`, role: "owner", settled: true, joinedAt: "2026-09-01T00:00:00Z" }, { id: OTHER, name: "Sara", role: "member", settled: false, joinedAt: "2026-09-02T00:00:00Z" }], invitations: [] };
    const { fake, repository } = await setup({ app_get_group_people: () => ({ status: 200, body: people }) });
    const result = await repository.getGroupPeople(USER, GROUP);
    expect(result.members[0]).toMatchObject({ name: "Huzaifa", avatarUrl: fake.signed(`${USER}/me.jpg`) });
    expect(JSON.stringify(result)).not.toContain("avatarPath");
    expect(result.members[1]).not.toHaveProperty("avatarUrl");
    expect(result.canManage).toBe(true);
  });

  it("treats malformed ids as 'not found' without asking the database", async () => {
    const { fake, repository } = await setup({});
    await expect(repository.inviteMember(USER, "nope", "a@example.com")).rejects.toMatchObject({ statusCode: 404 });
    await expect(repository.acceptInvitation(USER, "nope")).rejects.toMatchObject({ statusCode: 404, code: "not_found" });
    await expect(repository.declineInvitation(USER, "nope")).rejects.toMatchObject({ statusCode: 404 });
    await expect(repository.getGroupPeople(USER, "../x")).rejects.toMatchObject({ statusCode: 404 });
    await expect(repository.leaveGroup(USER, "1; drop")).rejects.toMatchObject({ statusCode: 404 });
    await expect(repository.removeMember(USER, GROUP, "nope")).rejects.toMatchObject({ statusCode: 404 });
    await expect(repository.renameGroup(USER, "nope", "Name")).rejects.toMatchObject({ statusCode: 404 });
    expect(fake.rpcCalls).toEqual([]);
  });

  it("maps what the database raises to clear errors", async () => {
    const cases: Array<[string, string, (repository: SupabaseLedgerRepository) => Promise<unknown>, Record<string, unknown>]> = [
      ["app_invite_member", "already_member", (r) => r.inviteMember(USER, GROUP, "a@example.com"), { statusCode: 409 }],
      ["app_invite_member", "already_invited", (r) => r.inviteMember(USER, GROUP, "a@example.com"), { statusCode: 409, code: "already_invited" }],
      ["app_invite_member", "invite_limit_reached", (r) => r.inviteMember(USER, GROUP, "a@example.com"), { statusCode: 429, code: "invite_limit_reached" }],
      ["app_invite_member", "invalid_email", (r) => r.inviteMember(USER, GROUP, "x"), { statusCode: 400, code: "invalid_email" }],
      ["app_invite_member", "group membership required", (r) => r.inviteMember(USER, GROUP, "a@example.com"), { statusCode: 404 }],
      ["app_accept_invitation", "invitation_not_found", (r) => r.acceptInvitation(USER, INVITE), { statusCode: 404 }],
      ["app_leave_group", "not_settled", (r) => r.leaveGroup(USER, GROUP), { statusCode: 409, code: "not_settled" }],
      ["app_leave_group", "owner_cannot_leave", (r) => r.leaveGroup(USER, GROUP), { statusCode: 409, code: "owner_cannot_leave" }],
      ["app_remove_member", "not_allowed", (r) => r.removeMember(USER, GROUP, OTHER), { statusCode: 403 }],
      ["app_remove_member", "cannot_remove_owner", (r) => r.removeMember(USER, GROUP, OTHER), { statusCode: 409, code: "cannot_remove_owner" }],
      ["app_remove_member", "use_leave", (r) => r.removeMember(USER, GROUP, OTHER), { statusCode: 400, code: "use_leave" }],
      ["app_remove_member", "member_not_found", (r) => r.removeMember(USER, GROUP, OTHER), { statusCode: 404 }],
      ["app_rename_group", "invalid_group_name", (r) => r.renameGroup(USER, GROUP, "x"), { statusCode: 400, code: "invalid_group_name" }],
      ["app_get_group_people", "group_not_found", (r) => r.getGroupPeople(USER, GROUP), { statusCode: 404 }],
    ];
    for (const [rpc, message, call, expected] of cases) {
      const { repository } = await setup({ [rpc]: () => raised(message) });
      await expect(call(repository)).rejects.toMatchObject(expected);
    }
  });

  it("says group management is not switched on yet when the database has not been updated", async () => {
    const { repository } = await setup({});
    const unavailable = { statusCode: 503, code: "groups_unavailable" };
    await expect(repository.inviteMember(USER, GROUP, "a@example.com")).rejects.toMatchObject(unavailable);
    await expect(repository.listInvitations(USER)).rejects.toMatchObject(unavailable);
    await expect(repository.acceptInvitation(USER, INVITE)).rejects.toMatchObject(unavailable);
    await expect(repository.declineInvitation(USER, INVITE)).rejects.toMatchObject(unavailable);
    await expect(repository.getGroupPeople(USER, GROUP)).rejects.toMatchObject(unavailable);
    await expect(repository.leaveGroup(USER, GROUP)).rejects.toMatchObject(unavailable);
    await expect(repository.removeMember(USER, GROUP, OTHER)).rejects.toMatchObject(unavailable);
    await expect(repository.renameGroup(USER, GROUP, "Name")).rejects.toMatchObject(unavailable);
  });
});

describe("SupabaseLedgerRepository push notifications", () => {
  const GROUP = "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d";
  const OTHER = "3d4e5f60-7182-4c9d-8e1f-2a3b4c5d6e7f";
  const NUDGE = "4e5f6071-8293-4dae-9f20-3b4c5d6e7f80";
  const TOKEN = "device-token-aaaaaaaaaaaaaaaa";
  const ok = () => ({ status: 204 });
  const delivery = { nudgeId: NUDGE, senderName: "Huzaifa", recipientName: "Hamza", amountMinor: "30000", currency: "PKR", groupId: GROUP, groupName: "Crew", tokens: [TOKEN] };

  it("registers, removes and drops tokens through their functions", async () => {
    const { fake, repository } = await setup({ app_register_push_token: ok, app_remove_push_token: ok, app_drop_push_tokens: ok });
    await repository.registerPushToken(USER, TOKEN, "android");
    await repository.removePushToken(USER, TOKEN);
    await repository.dropPushTokens([TOKEN, "other-token-aaaaaaaaaaaaaaaaaa"]);
    await repository.dropPushTokens([]);
    expect(fake.rpcCalls.map((call) => [call.name, call.args])).toEqual([
      ["app_register_push_token", { p_actor: USER, p_token: TOKEN, p_platform: "android" }],
      ["app_remove_push_token", { p_actor: USER, p_token: TOKEN }],
      ["app_drop_push_tokens", { p_tokens: [TOKEN, "other-token-aaaaaaaaaaaaaaaaaa"] }],
    ]);
  });

  it("creates a reminder and hands back what is needed to send it, with the amount as a number", async () => {
    const { fake, repository } = await setup({ app_create_nudge: () => ({ status: 200, body: delivery }) });
    expect(await repository.createNudge(USER, GROUP, OTHER)).toEqual({ ...delivery, amountMinor: 30000 });
    expect(fake.rpcCalls.at(-1)).toEqual({ name: "app_create_nudge", args: { p_actor: USER, p_group: GROUP, p_member: OTHER } });
  });

  it("treats a missing token list as none", async () => {
    const { repository } = await setup({ app_create_nudge: () => ({ status: 200, body: { ...delivery, nudgeId: null, tokens: null } }) });
    expect(await repository.createNudge(USER, GROUP, OTHER)).toMatchObject({ nudgeId: null, tokens: [] });
  });

  it("undoes a reminder, and asks the database for an invitation's push target", async () => {
    const target = { tokens: [TOKEN], inviterName: "Huzaifa", groupName: "Crew", groupId: GROUP };
    const { fake, repository } = await setup({ app_undo_nudge: ok, app_get_invitation_push_target: () => ({ status: 200, body: target }) });
    await repository.undoNudge(USER, NUDGE);
    expect(await repository.getInvitationPushTarget(USER, GROUP, "sara@example.com")).toEqual(target);
    expect(fake.rpcCalls.map((call) => [call.name, call.args])).toEqual([
      ["app_undo_nudge", { p_actor: USER, p_nudge: NUDGE }],
      ["app_get_invitation_push_target", { p_actor: USER, p_group: GROUP, p_email: "sara@example.com" }],
    ]);
  });

  it("answers null when there is nobody to push", async () => {
    const { repository } = await setup({ app_get_invitation_push_target: () => ({ status: 200, body: null }) });
    expect(await repository.getInvitationPushTarget(USER, GROUP, "nobody@example.com")).toBeNull();
  });

  it("does not ask the database about ids that cannot be ids", async () => {
    const { fake, repository } = await setup({});
    await expect(repository.createNudge(USER, "not-a-uuid", OTHER)).rejects.toMatchObject({ statusCode: 404 });
    await expect(repository.createNudge(USER, GROUP, "not-a-uuid")).rejects.toMatchObject({ statusCode: 404 });
    await repository.undoNudge(USER, "not-a-uuid");
    expect(await repository.getInvitationPushTarget(USER, "not-a-uuid", "a@example.com")).toBeNull();
    expect(fake.rpcCalls).toEqual([]);
  });

  it("turns what the database raises into clear errors", async () => {
    const cases: Array<[string, string, (r: Awaited<ReturnType<typeof setup>>["repository"]) => Promise<unknown>, Record<string, unknown>]> = [
      ["app_create_nudge", "group_not_found", (r) => r.createNudge(USER, GROUP, OTHER), { statusCode: 404 }],
      ["app_create_nudge", "member_not_found", (r) => r.createNudge(USER, GROUP, OTHER), { statusCode: 404 }],
      ["app_create_nudge", "cannot_nudge_yourself", (r) => r.createNudge(USER, GROUP, OTHER), { statusCode: 400, code: "cannot_nudge_yourself" }],
      ["app_create_nudge", "nothing_owed", (r) => r.createNudge(USER, GROUP, OTHER), { statusCode: 409, code: "nothing_owed" }],
      ["app_create_nudge", "nudge_cooldown", (r) => r.createNudge(USER, GROUP, OTHER), { statusCode: 429, code: "nudge_cooldown" }],
      ["app_create_nudge", "nudge_limit_reached", (r) => r.createNudge(USER, GROUP, OTHER), { statusCode: 429, code: "nudge_limit_reached" }],
      ["app_register_push_token", "invalid_platform", (r) => r.registerPushToken(USER, TOKEN, "android"), { statusCode: 400, code: "invalid_platform" }],
      ["app_register_push_token", "invalid_token", (r) => r.registerPushToken(USER, TOKEN, "android"), { statusCode: 400, code: "invalid_token" }],
      ["app_register_push_token", "profile_not_found", (r) => r.registerPushToken(USER, TOKEN, "android"), { statusCode: 404 }],
    ];
    for (const [rpc, message, call, expected] of cases) {
      const { repository } = await setup({ [rpc]: () => raised(message) });
      await expect(call(repository)).rejects.toMatchObject(expected);
    }
  });

  it("says notifications are not switched on yet when the database has not been updated", async () => {
    const { repository } = await setup({});
    const unavailable = { statusCode: 503, code: "push_unavailable" };
    await expect(repository.registerPushToken(USER, TOKEN, "android")).rejects.toMatchObject(unavailable);
    await expect(repository.removePushToken(USER, TOKEN)).rejects.toMatchObject(unavailable);
    await expect(repository.dropPushTokens([TOKEN])).rejects.toMatchObject(unavailable);
    await expect(repository.createNudge(USER, GROUP, OTHER)).rejects.toMatchObject(unavailable);
    await expect(repository.undoNudge(USER, NUDGE)).rejects.toMatchObject(unavailable);
    await expect(repository.getInvitationPushTarget(USER, GROUP, "a@example.com")).rejects.toMatchObject(unavailable);
  });
});

describe("SupabaseLedgerRepository: payment notifications and the health check", () => {
  const SETTLEMENT = "7f8091a2-b3c4-4d5e-8f60-718293a4b5c6";
  const GROUP = "2c3d4e5f-6071-4829-9a0b-1c2d3e4f5061";
  const TOKEN = "device-token-aaaaaaaaaaaaaaaa";
  const target = { tokens: [TOKEN], event: "claimed", actorName: "Hamza", amountMinor: "110000", currency: "PKR", groupId: GROUP, groupName: "Crew", settlementId: SETTLEMENT };

  it("asks the database who to notify and hands back the amount as a number", async () => {
    const { fake, repository } = await setup({ app_get_payment_push_target: () => ({ status: 200, body: target }) });
    expect(await repository.getPaymentPushTarget(USER, SETTLEMENT, "claimed")).toEqual({ ...target, amountMinor: 110000 });
    expect(fake.rpcCalls).toEqual([{ name: "app_get_payment_push_target", args: { p_actor: USER, p_settlement: SETTLEMENT, p_event: "claimed" } }]);
  });

  it("answers null when there is nobody to notify, and treats a missing token list as none", async () => {
    expect(await (await setup({ app_get_payment_push_target: () => ({ status: 200, body: null }) })).repository.getPaymentPushTarget(USER, SETTLEMENT, "confirmed")).toBeNull();
    const { repository } = await setup({ app_get_payment_push_target: () => ({ status: 200, body: { ...target, tokens: null } }) });
    expect(await repository.getPaymentPushTarget(USER, SETTLEMENT, "claimed")).toMatchObject({ tokens: [] });
  });

  it("does not ask the database about an id that cannot be one", async () => {
    const { fake, repository } = await setup({});
    expect(await repository.getPaymentPushTarget(USER, "review-1", "claimed")).toBeNull();
    expect(fake.rpcCalls).toEqual([]);
  });

  it("says notifications are not switched on when the database has not been updated, and passes other errors on", async () => {
    await expect((await setup({})).repository.getPaymentPushTarget(USER, SETTLEMENT, "claimed")).rejects.toMatchObject({ statusCode: 503, code: "push_unavailable" });
    const { repository } = await setup({ app_get_payment_push_target: () => raised("something else broke") });
    await expect(repository.getPaymentPushTarget(USER, SETTLEMENT, "claimed")).rejects.toBeDefined();
  });

  it("reports which features the database lacks", async () => {
    const { fake, repository } = await setup({ app_health_check: () => ({ status: 200, body: { ok: true, missing: ["export", "payment_push"] } }) });
    expect(await repository.checkHealth(2000)).toEqual({ missing: ["export", "payment_push"] });
    expect(fake.rpcCalls[0]?.name).toBe("app_health_check");
  });

  it("reports an empty list when everything is there, and ignores anything that is not a list of names", async () => {
    expect(await (await setup({ app_health_check: () => ({ status: 200, body: { ok: true, missing: [] } }) })).repository.checkHealth(2000)).toEqual({ missing: [] });
    expect(await (await setup({ app_health_check: () => ({ status: 200, body: { ok: true, missing: [1, null, "groups"] } }) })).repository.checkHealth(2000)).toEqual({ missing: ["groups"] });
    expect(await (await setup({ app_health_check: () => ({ status: 200, body: null }) })).repository.checkHealth(2000)).toEqual({ missing: [] });
  });

  it("is reachable but unknown while the health function is not installed yet", async () => {
    expect(await (await setup({})).repository.checkHealth(2000)).toEqual({ missing: null });
  });

  it("throws when the database fails, so the health check can say it is down", async () => {
    const { repository } = await setup({ app_health_check: () => ({ status: 500, body: { code: "XX000", message: "the database is down", details: null, hint: null } }) });
    await expect(repository.checkHealth(2000)).rejects.toThrow("the database is down");
  });
});
