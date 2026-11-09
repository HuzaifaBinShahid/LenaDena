import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { ApiError, apiRequest, newIdempotencyKey, uploadPrivateImage } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { demoPlan } from "@/features/ledger/demo-data";
import type {
  CreatedPersonalTransaction,
  CreateExpenseInput,
  CreateGroupInput,
  CreatePersonalTransactionInput,
  CreatePersonInput,
  EntryEmailPrompt,
  Group,
  InviteLink,
  Person,
  Plan,
  SettlementStatus,
  UpdatedPerson,
  UpdatePersonInput,
} from "@/features/ledger/types";
import { useAuth } from "@/features/auth/AuthProvider";
import { APP_DOWNLOAD_URL } from "@/features/people/invite";
import { isHistoryPersonId, peopleErrorMessage } from "@/features/people/people";

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
  /**
   * Saves an individual entry. The API also decides about email: when the person already had something open it
   * queues an email about this entry; when they had nothing open it answers `ask`, and `entryEmailPrompt` is set so
   * the app can offer to email them (see EntryEmailPromptHost).
   */
  createPersonalTransaction: (input: CreatePersonalTransactionInput) => Promise<CreatedPersonalTransaction>;
  /** The pending "email them about this entry?" question, if any. */
  entryEmailPrompt: EntryEmailPrompt | null;
  dismissEntryEmailPrompt: () => void;
  settlePersonalTransaction: (id: string, amountMinor?: number) => Promise<void>;
  settlePersonalTransactions: (ids: string[]) => Promise<void>;
  /** Saves someone to People. Rejects with a friendly message for a duplicate name or a server without People. */
  createPerson: (input: CreatePersonInput) => Promise<Person>;
  /**
   * Renaming also renames their history rows (server side). Adding an email to someone who had none also emails
   * them the full statement (when their email updates are on): the result says so with `statementQueued`.
   */
  updatePerson: (id: string, input: UpdatePersonInput) => Promise<UpdatedPerson>;
  /**
   * Emails a saved person now: their complete statement with a PDF, or one entry (by id). Rejects with friendly
   * copy: no email, a statement already sent in the last 5 minutes, nothing to send, or a server without email.
   */
  emailPerson: (id: string, kind: "statement" | "entry", transactionId?: string) => Promise<{ queuedAt: string }>;
  /** Their entries stay in Activity, unlinked. */
  deletePerson: (id: string) => Promise<void>;
  /**
   * Emails a saved person (with an email) an invite to install LenaDena, with the app link when one is configured.
   * Rejects with friendly copy: no email, already invited in the last 12 hours, or a server without People.
   */
  invitePerson: (id: string) => Promise<{ queuedAt: string }>;
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
  const [entryEmailPrompt, setEntryEmailPrompt] = useState<EntryEmailPrompt | null>(null);
  const userId = session?.user.id;
  const activeUserId = useRef(userId);

  // Never show one account's balances to the next account that signs in on this device.
  useEffect(() => {
    activeUserId.current = userId;
    if (!configured) return;
    setPlan(emptyPlan);
    setConnection("loading");
    setEntryEmailPrompt(null);
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
    let created: CreatedPersonalTransaction;
    try {
      created = await apiRequest<CreatedPersonalTransaction>("/v1/personal-transactions", {
        method: "POST",
        body: { ...input, receiptUri },
        idempotencyKey: newIdempotencyKey(),
      });
    } catch (error) {
      throw friendlyPeopleError(error, { name: input.counterparty });
    }
    // They had nothing open before: offer to email them (they may have just met this person, so it is the user's call).
    const decision = created.email;
    if (decision?.action === "ask" && decision.personId && decision.email) {
      setEntryEmailPrompt({
        personId: decision.personId,
        personName: decision.personName ?? input.counterparty,
        email: decision.email,
        transactionId: created.id,
        title: input.title,
        amountMinor: input.amountMinor,
        currency: input.currency,
        direction: input.direction,
      });
    }
    await refresh();
    return created;
  }, [refresh]);

  const dismissEntryEmailPrompt = useCallback(() => setEntryEmailPrompt(null), []);

  const settlePersonalTransaction = useCallback(async (id: string, amountMinor?: number) => {
    await apiRequest(`/v1/personal-transactions/${id}/settle`, {
      method: "POST",
      body: amountMinor === undefined ? {} : { amountMinor },
      idempotencyKey: newIdempotencyKey(),
    });
    await refresh();
  }, [refresh]);

  const settlePersonalTransactions = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    await apiRequest("/v1/personal-transactions/settle-all", {
      method: "POST",
      body: { transactionIds: ids },
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
    const body: { name?: string; email?: string | null; avatarPath?: string | null; emailUpdates?: boolean; reminderFrequency?: string } = {};
    if (input.name !== undefined) body.name = input.name.trim();
    if (Object.hasOwn(input, "email")) body.email = input.email?.trim() || null;
    if (input.emailUpdates !== undefined) body.emailUpdates = input.emailUpdates;
    if (input.reminderFrequency !== undefined) body.reminderFrequency = input.reminderFrequency;
    try {
      if (Object.hasOwn(input, "avatarUri")) {
        body.avatarPath = input.avatarUri ? await uploadPrivateImage("avatar", input.avatarUri) : null;
      }
      const person = await apiRequest<UpdatedPerson>(`/v1/people/${encodeURIComponent(id)}`, { method: "PATCH", body });
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

  const invitePerson = useCallback(async (id: string) => {
    const person = plan.people.find((item) => item.id === id);
    // A name remembered only from past entries isn't saved yet, so the API can't know their email.
    if (isHistoryPersonId(id)) throw new Error("Save this person with their email first.");
    try {
      return await apiRequest<{ queuedAt: string }>(`/v1/people/${encodeURIComponent(id)}/invite`, {
        method: "POST",
        body: APP_DOWNLOAD_URL ? { downloadUrl: APP_DOWNLOAD_URL } : {},
      });
    } catch (error) {
      throw friendlyPeopleError(error, { name: person?.name, peopleRoute: true });
    }
  }, [plan.people]);

  const emailPerson = useCallback(async (id: string, kind: "statement" | "entry", transactionId?: string) => {
    const person = plan.people.find((item) => item.id === id);
    // A name remembered only from past entries isn't saved yet, so the API can't know their email.
    if (isHistoryPersonId(id)) throw new Error("Save this person with their email first.");
    try {
      return await apiRequest<{ queuedAt: string }>(`/v1/people/${encodeURIComponent(id)}/email`, {
        method: "POST",
        body: kind === "entry" ? { kind, transactionId } : { kind },
      });
    } catch (error) {
      throw friendlyPeopleError(error, { name: person?.name, peopleRoute: true });
    }
  }, [plan.people]);

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
      entryEmailPrompt,
      dismissEntryEmailPrompt,
      settlePersonalTransaction,
      settlePersonalTransactions,
      createPerson,
      updatePerson,
      emailPerson,
      deletePerson,
      invitePerson,
      updateProfile,
      claimSettlement,
      reviewSettlement,
      selfConfirmSettlement,
      createInvite,
      acceptInvite,
    }),
    [plan, connection, refresh, createGroup, createExpense, createPersonalTransaction, entryEmailPrompt, dismissEntryEmailPrompt, settlePersonalTransaction, settlePersonalTransactions, createPerson, updatePerson, emailPerson, deletePerson, invitePerson, updateProfile, claimSettlement, reviewSettlement, selfConfirmSettlement, createInvite, acceptInvite],
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
