import { useMemo } from "react";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { peopleWithHistory, summarizePeople, type PersonSummary } from "@/features/people/people";
import type { Person } from "@/features/ledger/types";

/** Saved people plus names remembered from past individual balances (see peopleWithHistory). */
export function usePeopleList(): Person[] {
  const { plan } = useLedger();
  const { people, transactions } = plan;
  return useMemo(() => peopleWithHistory(people, transactions), [people, transactions]);
}

/** Every known person with their balances, in usePeopleList order (sort with the helpers in people.ts). */
export function usePeopleSummaries(): PersonSummary[] {
  const { plan } = useLedger();
  const people = usePeopleList();
  const { transactions } = plan;
  return useMemo(() => summarizePeople({ people, transactions }), [people, transactions]);
}
