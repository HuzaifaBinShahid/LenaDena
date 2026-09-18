import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { ApiError, apiRequest, newIdempotencyKey, uploadPrivateImage } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { demoPlan } from "@/features/ledger/demo-data";
import type {
  CreateExpenseInput,
  CreateGroupInput,
  CreatePersonalTransactionInput,
  CreatePersonInput,
  Group,
  InviteLink,
  Person,
  Plan,
  SettlementStatus,
  UpdatePersonInput,
} from "@/features/ledger/types";
import { useAuth } from "@/features/auth/AuthProvider";
import { peopleErrorMessage } from "@/features/people/people";

type ConnectionState = "loading" | "live" | "demo" | "error";

const emptyPlan: Plan = {
  user: { id: "loading", name: "Friend", email: "" },
  totals: [],
  groups: [],
  reviews: [],
  claims: [],
  activity: [],
  transactions: [],
  people: [],
};

type LedgerContextValue = {
  plan: Plan;
  connection: ConnectionState;
  refresh: () => Promise<void>;
  createGroup: (input: CreateGroupInput) => Promise<void>;
  createExpense: (input: CreateExpenseInput) => Promise<void>;
  createPersonalTransaction: (input: CreatePersonalTransactionInput) => Promise<void>;
  settlePersonalTransaction: (id: string) => Promise<void>;
  /** Saves someone to People. Rejects with a friendly message for a duplicate name or a server without People. */
  createPerson: (input: CreatePersonInput) => Promise<Person>;
  /** Renaming also renames their history rows (server side). */
  updatePerson: (id: string, input: UpdatePersonInput) => Promise<Person>;
  /** Their entries stay in Activity, unlinked. */
  deletePerson: (id: string) => Promise<void>;
  updateProfile: (input: { name: string; avatarUri?: string | null }) => Promise<void>;
  claimSettlement: (input: { groupId: string; recipientMemberId: string; amountMinor: number; note?: string; proofUri?: string }) => Promise<void>;
  reviewSettlement: (id: string, status: Extract<SettlementStatus, "confirmed" | "needs_attention">, note?: string) => Promise<void>;
  selfConfirmSettlement: (id: string) => Promise<void>;
  createInvite: (groupId: string, email?: string) => Promise<InviteLink>;
  acceptInvite: (token: string) => Promise<Group>;
};

const LedgerContext = createContext<LedgerContextValue | null>(null);

/** Swaps a People error code for friendly copy (naming the person on a duplicate); other errors pass through. */
function friendlyPeopleError(error: unknown, options: { name?: string | undefined; peopleRoute?: boolean }) {
  if (!(error instanceof ApiError)) return error;
  const message = peopleErrorMessage(error, options);
  return message ? new ApiError(message, error.status, error.code, error.details) : error;
}

export function LedgerProvider({ children }: { children: ReactNode }) {
  const { configured, ready, session } = useAuth();
  const [plan, setPlan] = useState<Plan>(configured ? emptyPlan : demoPlan);
  const [connection, setConnection] = useState<ConnectionState>("loading");
  const userId = session?.user.id;
  const activeUserId = useRef(userId);

  // Never show one account's balances to the next account that signs in on this device.
  useEffect(() => {
    activeUserId.current = userId;
    if (!configured) return;
    setPlan(emptyPlan);
    setConnection("loading");
  }, [configured, userId]);

  const refresh = useCallback(async () => {
    const requestedFor = activeUserId.current;
    try {
      const value = await apiRequest<Plan>("/v1/me/plan");
      if (activeUserId.current !== requestedFor) return;
      // An API without People (older deploy) still yields a complete plan.
      setPlan({ ...value, people: value.people ?? [] });
      setConnection("live");
    } catch (error) {
      if (activeUserId.current !== requestedFor) return;
      // A deleted or revoked account keeps a signed-looking session until it expires. Confirm with Supabase
      // before leaving for sign-in, so an API or network hiccup never signs a valid account out.
      if (configured && supabase && error instanceof ApiError && error.status === 401) {
        const { error: userError } = await supabase.auth.getUser();
        if (userError && !isAuthRetryableFetchError(userError)) {
          await supabase.auth.signOut({ scope: "local" });
          return;
        }
      }
      if (!configured) setPlan(demoPlan);
      setConnection(configured ? "error" : "demo");
    }
  }, [configured]);

  useEffect(() => {
    if (!configured || (ready && session)) void refresh();
  }, [configured, ready, refresh, session]);

  const createGroup = useCallback(async (input: CreateGroupInput) => {
    const requestedFor = activeUserId.current;
    const group = await apiRequest<Plan["groups"][number]>("/v1/groups", {
      method: "POST",
      body: input,
      idempotencyKey: newIdempotencyKey(),
    });
    if (activeUserId.current !== requestedFor) return;
    setPlan((current) => ({ ...current, groups: [group, ...current.groups] }));
  }, []);

  const createExpense = useCallback(async (input: CreateExpenseInput) => {
    const receiptUri = input.receiptUri ? await uploadPrivateImage("receipt", input.receiptUri) : undefined;
    await apiRequest("/v1/expenses", {
      method: "POST",
      body: { ...input, receiptUri },
      idempotencyKey: newIdempotencyKey(),
    });
    await refresh();
  }, [refresh]);

  // `personId` passes straight through: with it the entry joins that person; without it the API finds or
  // creates a person by `counterparty`, which is why a refresh afterwards can show a new person.
  const createPersonalTransaction = useCallback(async (input: CreatePersonalTransactionInput) => {
    const receiptUri = input.receiptUri ? await uploadPrivateImage("receipt", input.receiptUri) : undefined;
    try {
      await apiRequest("/v1/personal-transactions", {
        method: "POST",
        body: { ...input, receiptUri },
        idempotencyKey: newIdempotencyKey(),
      });
    } catch (error) {
      throw friendlyPeopleError(error, { name: input.counterparty });
    }
    await refresh();
  }, [refresh]);

  const settlePersonalTransaction = useCallback(async (id: string) => {
    await apiRequest(`/v1/personal-transactions/${id}/settle`, {
      method: "POST",
      idempotencyKey: newIdempotencyKey(),
    });
    await refresh();
  }, [refresh]);

  // People are contact details, not money: no idempotency key. Demo mode goes through the demo API like every
  // other mutation here (its memory store keeps people too), and photos stay local URIs there.
  const createPerson = useCallback(async (input: CreatePersonInput) => {
    const name = input.name.trim();
    const email = input.email?.trim();
    try {
      const avatarPath = input.avatarUri ? await uploadPrivateImage("avatar", input.avatarUri) : undefined;
      const person = await apiRequest<Person>("/v1/people", {
        method: "POST",
        body: { name, ...(email ? { email } : {}), ...(avatarPath ? { avatarPath } : {}) },
      });
      await refresh();
      return person;
    } catch (error) {
      throw friendlyPeopleError(error, { name, peopleRoute: true });
    }
  }, [refresh]);

  const updatePerson = useCallback(async (id: string, input: UpdatePersonInput) => {
    const body: { name?: string; email?: string | null; avatarPath?: string | null } = {};
    if (input.name !== undefined) body.name = input.name.trim();
    if (Object.hasOwn(input, "email")) body.email = input.email?.trim() || null;
    try {
      if (Object.hasOwn(input, "avatarUri")) {
        body.avatarPath = input.avatarUri ? await uploadPrivateImage("avatar", input.avatarUri) : null;
      }
      const person = await apiRequest<Person>(`/v1/people/${encodeURIComponent(id)}`, { method: "PATCH", body });
      await refresh();
      return person;
    } catch (error) {
      throw friendlyPeopleError(error, { name: body.name, peopleRoute: true });
    }
  }, [refresh]);

  const deletePerson = useCallback(async (id: string) => {
    try {
      await apiRequest(`/v1/people/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch (error) {
      throw friendlyPeopleError(error, { peopleRoute: true });
    }
    await refresh();
  }, [refresh]);

  const updateProfile = useCallback(async (input: { name: string; avatarUri?: string | null }) => {
    const body: { name: string; avatarPath?: string | null } = { name: input.name };
    if (Object.hasOwn(input, "avatarUri")) {
      body.avatarPath = input.avatarUri ? await uploadPrivateImage("avatar", input.avatarUri) : null;
    }
    await apiRequest("/v1/me/profile", { method: "PATCH", body });
    await refresh();
  }, [refresh]);

  const claimSettlement = useCallback(async (input: { groupId: string; recipientMemberId: string; amountMinor: number; note?: string; proofUri?: string }) => {
    const proofUri = input.proofUri ? await uploadPrivateImage("payment-proof", input.proofUri) : undefined;
    await apiRequest("/v1/settlements", {
      method: "POST",
      body: { ...input, proofUri },
      idempotencyKey: newIdempotencyKey(),
    });
    await refresh();
  }, [refresh]);

  const reviewSettlement = useCallback(async (id: string, status: Extract<SettlementStatus, "confirmed" | "needs_attention">, note?: string) => {
    const requestedFor = activeUserId.current;
    await apiRequest(`/v1/settlements/${id}/${status === "confirmed" ? "confirm" : "attention"}`, {
      method: "POST",
      body: { note },
      idempotencyKey: newIdempotencyKey(),
    });
    if (activeUserId.current !== requestedFor) return;
    setPlan((current) => ({
      ...current,
      reviews: current.reviews.filter((review) => review.id !== id),
    }));
  }, []);

  const selfConfirmSettlement = useCallback(async (id: string) => {
    await apiRequest(`/v1/settlements/${id}/self-confirm`, {
      method: "POST",
      idempotencyKey: newIdempotencyKey(),
    });
    await refresh();
  }, [refresh]);

  const createInvite = useCallback(async (groupId: string, email?: string) => apiRequest<InviteLink>(`/v1/groups/${groupId}/invites`, {
    method: "POST",
    body: { email },
  }), []);

  const acceptInvite = useCallback(async (token: string) => {
    const group = await apiRequest<Group>(`/v1/invites/${encodeURIComponent(token)}/accept`, { method: "POST" });
    await refresh();
    return group;
  }, [refresh]);

  const value = useMemo(
    () => ({
      plan,
      connection,
      refresh,
      createGroup,
      createExpense,
      createPersonalTransaction,
      settlePersonalTransaction,
      createPerson,
      updatePerson,
      deletePerson,
      updateProfile,
      claimSettlement,
      reviewSettlement,
      selfConfirmSettlement,
      createInvite,
      acceptInvite,
    }),
    [plan, connection, refresh, createGroup, createExpense, createPersonalTransaction, settlePersonalTransaction, createPerson, updatePerson, deletePerson, updateProfile, claimSettlement, reviewSettlement, selfConfirmSettlement, createInvite, acceptInvite],
  );

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger() {
  const value = useContext(LedgerContext);
  if (!value) {
    throw new Error("useLedger must be used inside LedgerProvider");
  }
  return value;
}
