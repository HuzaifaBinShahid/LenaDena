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
  ExpenseDetail,
  Group,
  GroupPeople,
  Invitation,
  InviteLink,
  Person,
  Plan,
  SettlementStatus,
  UpdateExpenseInput,
  UpdatePersonalTransactionInput,
  UpdatePersonInput,
} from "@/features/ledger/types";
import { useAuth } from "@/features/auth/AuthProvider";
import { APP_DOWNLOAD_URL } from "@/features/people/invite";
import type { NudgeStatus } from "@/features/push/pushRules";
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
  /** Invitations to groups, addressed to this account's own email; they are answered in the app. */
  invitations: Invitation[];
  connection: ConnectionState;
  refresh: () => Promise<void>;
  createGroup: (input: CreateGroupInput) => Promise<void>;
  createExpense: (input: CreateExpenseInput) => Promise<void>;
  /** Saves an individual entry. This never sends an email: the owner emails a statement by hand. */
  createPersonalTransaction: (input: CreatePersonalTransactionInput) => Promise<CreatedPersonalTransaction>;
  /** One expense in full, to fill the edit form. Rejects with the server's message (not found, no longer available). */
  getExpense: (id: string) => Promise<ExpenseDetail>;
  /** Replaces an expense's details and split. Rejects with a plain message when the caller may not, or someone in it has left. */
  updateExpense: (id: string, input: UpdateExpenseInput) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  /** Changes an individual balance. Rejects with a plain message when payments lock the change. */
  updatePersonalTransaction: (id: string, input: UpdatePersonalTransactionInput) => Promise<void>;
  deletePersonalTransaction: (id: string) => Promise<void>;
  settlePersonalTransaction: (id: string, amountMinor?: number) => Promise<void>;
  settlePersonalTransactions: (ids: string[]) => Promise<void>;
  /** Saves someone to People. Rejects with a friendly message for a duplicate name or a server without People. */
  createPerson: (input: CreatePersonInput) => Promise<Person>;
  /** Renaming also renames their history rows (server side). Adding or changing their email sends nothing. */
  updatePerson: (id: string, input: UpdatePersonInput) => Promise<Person>;
  /**
   * Emails a saved person their complete statement with a PDF, only when the owner taps Send. Rejects with friendly
   * copy: no email, a statement already sent in the last 5 minutes, nothing to send, or a server without email.
   */
  emailPerson: (id: string) => Promise<{ queuedAt: string }>;
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
  /** Invites an email address. The same answer whether or not it has an account; an account also sees it in the app. */
  inviteByEmail: (groupId: string, email: string) => Promise<InviteLink>;
  acceptInvitation: (id: string) => Promise<Group>;
  declineInvitation: (id: string) => Promise<void>;
  /** Members with roles, who can leave or be removed now, and the open invitations. */
  getGroupPeople: (groupId: string) => Promise<GroupPeople>;
  leaveGroup: (groupId: string) => Promise<void>;
  removeMember: (groupId: string, memberId: string) => Promise<void>;
  renameGroup: (groupId: string, name: string) => Promise<void>;
  /** Asks the server to send a push reminder to someone who owes you here. `no_device`, `failed` and `unavailable` mean the app should offer the share sheet instead. */
  remindMember: (groupId: string, memberId: string) => Promise<NudgeStatus>;
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
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [connection, setConnection] = useState<ConnectionState>("loading");
  const userId = session?.user.id;
  const activeUserId = useRef(userId);

  // Never show one account's balances to the next account that signs in on this device.
  useEffect(() => {
    activeUserId.current = userId;
    if (!configured) return;
    setPlan(emptyPlan);
    setInvitations([]);
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
      // Invitations are a convenience on top of the plan: a server without them (or a hiccup) must never break the home screen.
      apiRequest<Invitation[]>("/v1/me/invitations")
        .then((items) => { if (activeUserId.current === requestedFor) setInvitations(Array.isArray(items) ? items : []); })
        .catch(() => { if (activeUserId.current === requestedFor) setInvitations([]); });
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
    await refresh();
    return created;
  }, [refresh]);

  const getExpense = useCallback((id: string) => apiRequest<ExpenseDetail>(`/v1/expenses/${encodeURIComponent(id)}`), []);

  // Photos: `undefined` keeps, `null` removes, a local image is uploaded first and its storage path replaces the old one.
  const updateExpense = useCallback(async (id: string, input: UpdateExpenseInput) => {
    const { receiptUri, ...rest } = input;
    const change = receiptUri ? { receiptUri: await uploadPrivateImage("receipt", receiptUri) } : receiptUri === null ? { receiptUri: null } : {};
    await apiRequest(`/v1/expenses/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { ...rest, ...change },
      idempotencyKey: newIdempotencyKey(),
    });
    await refresh();
  }, [refresh]);

  const deleteExpense = useCallback(async (id: string) => {
    await apiRequest(`/v1/expenses/${encodeURIComponent(id)}`, { method: "DELETE" });
    await refresh();
  }, [refresh]);

  const updatePersonalTransaction = useCallback(async (id: string, input: UpdatePersonalTransactionInput) => {
    const { receiptUri, ...rest } = input;
    const change = receiptUri ? { receiptUri: await uploadPrivateImage("receipt", receiptUri) } : receiptUri === null ? { receiptUri: null } : {};
    try {
      await apiRequest(`/v1/personal-transactions/${encodeURIComponent(id)}`, { method: "PATCH", body: { ...rest, ...change } });
    } catch (error) {
      throw friendlyPeopleError(error, { name: input.counterparty });
    }
    await refresh();
  }, [refresh]);

  const deletePersonalTransaction = useCallback(async (id: string) => {
    await apiRequest(`/v1/personal-transactions/${encodeURIComponent(id)}`, { method: "DELETE" });
    await refresh();
  }, [refresh]);

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
    const body: { name?: string; email?: string | null; avatarPath?: string | null; reminderFrequency?: string } = {};
    if (input.name !== undefined) body.name = input.name.trim();
    if (Object.hasOwn(input, "email")) body.email = input.email?.trim() || null;
    if (input.reminderFrequency !== undefined) body.reminderFrequency = input.reminderFrequency;
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

  const emailPerson = useCallback(async (id: string) => {
    const person = plan.people.find((item) => item.id === id);
    // A name remembered only from past entries isn't saved yet, so the API can't know their email.
    if (isHistoryPersonId(id)) throw new Error("Save this person with their email first.");
    try {
      return await apiRequest<{ queuedAt: string }>(`/v1/people/${encodeURIComponent(id)}/email`, {
        method: "POST",
        body: { kind: "statement" },
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

  const inviteByEmail = useCallback((groupId: string, email: string) => apiRequest<InviteLink>(`/v1/groups/${encodeURIComponent(groupId)}/invitations`, {
    method: "POST",
    body: { email },
  }), []);

  const acceptInvitation = useCallback(async (id: string) => {
    const group = await apiRequest<Group>(`/v1/me/invitations/${encodeURIComponent(id)}/accept`, { method: "POST" });
    await refresh();
    return group;
  }, [refresh]);

  const declineInvitation = useCallback(async (id: string) => {
    await apiRequest(`/v1/me/invitations/${encodeURIComponent(id)}/decline`, { method: "POST" });
    setInvitations((current) => current.filter((item) => item.id !== id));
  }, []);

  const getGroupPeople = useCallback((groupId: string) => apiRequest<GroupPeople>(`/v1/groups/${encodeURIComponent(groupId)}/members`), []);

  const leaveGroup = useCallback(async (groupId: string) => {
    await apiRequest(`/v1/groups/${encodeURIComponent(groupId)}/leave`, { method: "POST" });
    await refresh();
  }, [refresh]);

  const removeMember = useCallback(async (groupId: string, memberId: string) => {
    await apiRequest(`/v1/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(memberId)}`, { method: "DELETE" });
    await refresh();
  }, [refresh]);

  const renameGroup = useCallback(async (groupId: string, name: string) => {
    await apiRequest(`/v1/groups/${encodeURIComponent(groupId)}`, { method: "PATCH", body: { name } });
    await refresh();
  }, [refresh]);

  const remindMember = useCallback(async (groupId: string, memberId: string) => {
    const result = await apiRequest<{ status: NudgeStatus }>(`/v1/groups/${encodeURIComponent(groupId)}/nudges`, { method: "POST", body: { memberId } });
    return result.status;
  }, []);

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
      getExpense,
      updateExpense,
      deleteExpense,
      updatePersonalTransaction,
      deletePersonalTransaction,
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
      invitations,
      createInvite,
      inviteByEmail,
      acceptInvitation,
      declineInvitation,
      getGroupPeople,
      leaveGroup,
      removeMember,
      renameGroup,
      remindMember,
      acceptInvite,
    }),
    [plan, connection, refresh, createGroup, createExpense, createPersonalTransaction, getExpense, updateExpense, deleteExpense, updatePersonalTransaction, deletePersonalTransaction, settlePersonalTransaction, settlePersonalTransactions, createPerson, updatePerson, emailPerson, deletePerson, invitePerson, updateProfile, claimSettlement, reviewSettlement, selfConfirmSettlement, invitations, createInvite, inviteByEmail, acceptInvitation, declineInvitation, getGroupPeople, leaveGroup, removeMember, renameGroup, remindMember, acceptInvite],
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
