import type { Href } from "expo-router";

// Links into the People screens, in one place. They rely on the typed routes Expo generates for app/people and
// app/person (.expo/types/router.d.ts, refreshed by the dev server); on a machine whose generated file predates
// those screens, restart the dev server once (or cast these to Href) before type-checking.

/** The People list. */
export const peopleHref: Href = "/people";

/** A person's balance and history. */
export function personHref(id: string): Href {
  return { pathname: "/person/[id]", params: { id } };
}

/** Add a person (optionally with a name typed elsewhere), or edit one with `id`. */
export function personFormHref(options: { id?: string; name?: string } = {}): Href {
  const params: Record<string, string> = {};
  if (options.id) params.id = options.id;
  if (options.name?.trim()) params.name = options.name.trim();
  return { pathname: "/person/new", params };
}

/** Add an individual balance, with the person already chosen when `personId` is given. */
export function addBalanceHref(personId?: string): Href {
  return personId ? { pathname: "/transaction/new", params: { personId } } : "/transaction/new";
}
