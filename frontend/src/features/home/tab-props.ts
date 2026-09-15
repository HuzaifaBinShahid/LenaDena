import type { TabKey } from "@/features/ledger/types";

/** Props every home tab view receives from app/index.tsx (D13). */
export type HomeTabProps = { onAddEntry: () => void; onChangeTab: (tab: TabKey) => void };
