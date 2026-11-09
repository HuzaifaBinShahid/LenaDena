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
    if (method === "DELETE" && path === "/storage/v1/object/avatars") {
      this.removed.push(body.prefixes ?? []);
      return { status: 200, body: [] };
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

  it("returns the email decision with the new entry, and never fails the entry over email", async () => {
    const decision = { action: "ask", personId: ALI, personName: "Ali", email: "ali@example.com" };
    const created = await setup({ app_create_personal_transaction: () => ({ status: 200, body: ENTRY }), app_notify_new_entry: () => ({ status: 200, body: decision }) });
    await expect(created.repository.createPersonalTransaction(USER, entryInput, "entry-key-0001")).resolves.toEqual({ id: ENTRY, email: decision });
    expect(created.fake.rpcCalls.at(-1)).toEqual({ name: "app_notify_new_entry", args: { p_actor: USER, p_transaction: ENTRY } });

    // A database without the migration, a failing function and an unreadable answer all leave a plain saved entry.
    const older = await setup({ app_create_personal_transaction: () => ({ status: 200, body: ENTRY }) });
    await expect(older.repository.createPersonalTransaction(USER, entryInput, "entry-key-0002")).resolves.toEqual({ id: ENTRY });
    expect(older.warnings).toEqual([]);
    const failing = await setup({ app_create_personal_transaction: () => ({ status: 200, body: ENTRY }), app_notify_new_entry: () => raised("boom") });
    await expect(failing.repository.createPersonalTransaction(USER, entryInput, "entry-key-0003")).resolves.toEqual({ id: ENTRY });
    expect(failing.warnings).toEqual(["app_notify_new_entry failed: boom"]);
    const odd = await setup({ app_create_personal_transaction: () => ({ status: 200, body: ENTRY }), app_notify_new_entry: () => ({ status: 200, body: { action: "launch" } }) });
    await expect(odd.repository.createPersonalTransaction(USER, entryInput, "entry-key-0004")).resolves.toEqual({ id: ENTRY });
  });

  it("sends the new settings with explicit flags and rejects an unknown reminder schedule", async () => {
    const people: Person[] = [{ id: ALI, name: "Ali", email: "ali@example.com", ...{ emailUpdates: false, reminderFrequency: "weekly" as const }, createdAt: "2026-09-08T17:45:00+00:00" }];
    const { fake, repository } = await setup({ app_get_people: () => ({ status: 200, body: people }), app_update_person: () => ({ status: 204 }) });
    const updated = await repository.updatePerson(USER, ALI, { emailUpdates: false, reminderFrequency: "weekly" });
    expect(updated).toMatchObject({ emailUpdates: false, reminderFrequency: "weekly" });
    expect(updated.statementQueued).toBeUndefined();
    expect(fake.rpcCalls.find((item) => item.name === "app_update_person")?.args.p_payload)
      .toMatchObject({ updateEmailUpdates: true, emailUpdates: false, updateReminderFrequency: true, reminderFrequency: "weekly", updateName: false });
    await expect(repository.updatePerson(USER, ALI, { reminderFrequency: "daily" as never })).rejects.toMatchObject({ statusCode: 400, code: "invalid_reminder_frequency" });
  });

  it("emails the full statement when an address is added to someone who had none", async () => {
    let calls = 0;
    const withEmail: Person = { id: ALI, name: "Ali", email: "ali@example.com", emailUpdates: true, reminderFrequency: "off", createdAt: "2026-09-08T17:45:00+00:00" };
    const withoutEmail: Person = { id: ALI, name: "Ali", emailUpdates: true, reminderFrequency: "off", createdAt: "2026-09-08T17:45:00+00:00" };
    const { fake, repository } = await setup({
      // Before the edit Ali has no email; after it, one.
      app_get_people: () => ({ status: 200, body: [calls++ === 0 ? withoutEmail : withEmail] }),
      app_update_person: () => ({ status: 204 }),
      app_queue_person_email: () => ({ status: 200, body: "2026-11-10T09:00:00+00:00" }),
    });
    const result = await repository.updatePerson(USER, ALI, { email: "ali@example.com" });
    expect(result.statementQueued).toBe(true);
    expect(fake.rpcCalls.at(-1)).toEqual({ name: "app_queue_person_email", args: { p_actor: USER, p_person: ALI, p_kind: "statement", p_transaction: null } });
  });

  it("does not email a statement when updates are off, the person already had an email, or there is nothing to send", async () => {
    const make = (before: Partial<Person>, after: Partial<Person>, queue: () => Reply) => {
      let calls = 0;
      const base = { id: ALI, name: "Ali", emailUpdates: true, reminderFrequency: "off" as const, createdAt: "2026-09-08T17:45:00+00:00" };
      return setup({
        app_get_people: () => ({ status: 200, body: [{ ...base, ...(calls++ === 0 ? before : after) }] }),
        app_update_person: () => ({ status: 204 }),
        app_queue_person_email: queue,
      });
    };
    const optedOut = await make({}, { email: "ali@example.com", emailUpdates: false }, () => ({ status: 200, body: "2026-11-10T09:00:00+00:00" }));
    expect((await optedOut.repository.updatePerson(USER, ALI, { email: "ali@example.com" })).statementQueued).toBeUndefined();
    expect(optedOut.fake.rpcCalls.some((item) => item.name === "app_queue_person_email")).toBe(false);

    const hadEmail = await make({ email: "old@example.com" }, { email: "new@example.com" }, () => ({ status: 200, body: "2026-11-10T09:00:00+00:00" }));
    expect((await hadEmail.repository.updatePerson(USER, ALI, { email: "new@example.com" })).statementQueued).toBeUndefined();
    expect(hadEmail.fake.rpcCalls.some((item) => item.name === "app_queue_person_email")).toBe(false);

    for (const message of ["no_entries", "email_recently_sent"]) {
      const skipped = await make({}, { email: "ali@example.com" }, () => raised(message));
      const result = await skipped.repository.updatePerson(USER, ALI, { email: "ali@example.com" });
      expect(result.statementQueued).toBeUndefined();
      expect(skipped.warnings).toEqual([]);
    }
    const oldSchema = await make({}, { email: "ali@example.com" }, () => ({ status: 404, body: { code: "PGRST202", details: null, hint: null, message: "missing" } }));
    expect((await oldSchema.repository.updatePerson(USER, ALI, { email: "ali@example.com" })).statementQueued).toBeUndefined();
  });

  it("emails a statement or an entry through app_queue_person_email and maps its errors", async () => {
    const { fake, repository } = await setup({ app_queue_person_email: () => ({ status: 200, body: "2026-11-10T09:00:00.123456+00:00" }) });
    await expect(repository.emailPerson(USER, ALI, "statement", undefined)).resolves.toEqual({ queuedAt: "2026-11-10T09:00:00.123Z" });
    expect(fake.rpcCalls.at(-1)).toEqual({ name: "app_queue_person_email", args: { p_actor: USER, p_person: ALI, p_kind: "statement", p_transaction: null } });
    await repository.emailPerson(USER, ALI, "entry", ENTRY);
    expect(fake.rpcCalls.at(-1)?.args).toEqual({ p_actor: USER, p_person: ALI, p_kind: "entry", p_transaction: ENTRY });
    await expect(repository.emailPerson(USER, ALI, "entry", undefined)).rejects.toMatchObject({ statusCode: 400, code: "transaction_required" });
    await expect(repository.emailPerson(USER, "not-a-uuid", "statement", undefined)).rejects.toMatchObject({ statusCode: 404, code: "person_not_found" });
    expect(fake.rpcCalls).toHaveLength(2);

    for (const [message, statusCode, code] of [
      ["person_not_found", 404, "person_not_found"],
      ["person_has_no_email", 400, "person_has_no_email"],
      ["email_recently_sent", 429, "email_recently_sent"],
      ["email_limit_reached", 429, "email_limit_reached"],
      ["no_entries", 400, "no_entries"],
      ["transaction_not_found", 404, "transaction_not_found"],
    ] as const) {
      const failing = await setup({ app_queue_person_email: () => raised(message) });
      await expect(failing.repository.emailPerson(USER, ALI, "statement", undefined)).rejects.toMatchObject({ statusCode, code });
    }
    const missing = await setup({});
    await expect(missing.repository.emailPerson(USER, ALI, "statement", undefined)).rejects.toMatchObject({ statusCode: 503, code: "email_unavailable" });
  });
});
