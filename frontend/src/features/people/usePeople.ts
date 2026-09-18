import { useMemo } from "react";
import { useLedger } from "@/features/ledger/LedgerProvider";
import { summarizePeople, type PersonSummary } from "@/features/people/people";

/** Every saved person with their balances, in `plan.people` order (sort with the helpers in people.ts). */
export function usePeopleSummaries(): PersonSummary[] {
  const { plan } = useLedger();
  const { people, transactions } = plan;
  return useMemo(() => summarizePeople({ people, transactions }), [people, transactions]);
}
