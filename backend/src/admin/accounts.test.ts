import { describe, expect, it, vi } from "vitest";
import { findUserIdByEmail } from "./accounts.js";

type User = { id: string; email?: string };

/** A stand-in for supabase.auth.admin that serves `users` in pages, like the real one. */
function admin(users: User[], failWith?: string) {
  const listUsers = vi.fn(async ({ page, perPage }: { page: number; perPage: number }) => {
    if (failWith) return { data: { users: [] as User[] }, error: { message: failWith } };
    return { data: { users: users.slice((page - 1) * perPage, page * perPage) }, error: null };
  });
  return { client: { listUsers } as never, listUsers };
}

describe("findUserIdByEmail", () => {
  it("matches ignoring case and surrounding spaces", async () => {
    const { client } = admin([{ id: "a", email: "Sara@Example.com" }]);
    expect(await findUserIdByEmail(client, "  sara@example.COM ")).toBe("a");
  });

  it("finds an account on a later page and stops there", async () => {
    const users = Array.from({ length: 5 }, (_, index) => ({ id: `u${index}`, email: `u${index}@example.com` }));
    const { client, listUsers } = admin(users);
    expect(await findUserIdByEmail(client, "u3@example.com", 2)).toBe("u3");
    expect(listUsers).toHaveBeenCalledTimes(2);
  });

  it("answers undefined for an address nobody has, after reading every page once", async () => {
    const users = Array.from({ length: 5 }, (_, index) => ({ id: `u${index}`, email: `u${index}@example.com` }));
    const { client, listUsers } = admin(users);
    expect(await findUserIdByEmail(client, "nobody@example.com", 2)).toBeUndefined();
    expect(listUsers).toHaveBeenCalledTimes(3);
  });

  it("does not match part of an address, and ignores accounts without one", async () => {
    const { client } = admin([{ id: "a", email: "sara@example.com.pk" }, { id: "b" }]);
    expect(await findUserIdByEmail(client, "sara@example.com")).toBeUndefined();
  });

  it("never looks up an empty address", async () => {
    const { client, listUsers } = admin([{ id: "b" }]);
    expect(await findUserIdByEmail(client, "   ")).toBeUndefined();
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("reports a failure to read the accounts instead of saying the account does not exist", async () => {
    const { client } = admin([], "service unavailable");
    await expect(findUserIdByEmail(client, "sara@example.com")).rejects.toThrow("Could not read the accounts: service unavailable");
  });
});
