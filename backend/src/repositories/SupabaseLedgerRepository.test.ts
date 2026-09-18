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
  it("serves people with the plan and signs every photo in one storage request", async () => {
    const people: Person[] = [
      { id: ALI, name: "Ali", avatarPath: `${USER}/ali.jpg`, createdAt: "2026-09-08T17:45:00+00:00" },
      { id: BILAL, name: "Bilal", email: "bilal@example.com", createdAt: "2026-09-09T10:00:00+00:00" },
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
    const people: Person[] = [{ id: ALI, name: "Ali", email: "ali@example.com", avatarPath: `${USER}/old.jpg`, createdAt: "2026-09-08T17:45:00+00:00" }];
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
    expect(replaced).toEqual({ id: ALI, name: "Ali", email: "ali@example.com", avatarPath: `${USER}/new.jpg`, avatarUrl: fake.signed(`${USER}/new.jpg`), createdAt: "2026-09-08T17:45:00+00:00" });
    expect(fake.rpcCalls.find((item) => item.name === "app_update_person")?.args.p_payload)
      .toEqual({ updateName: false, name: null, updateEmail: false, email: null, updateAvatar: true, avatarPath: `${USER}/new.jpg` });
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
