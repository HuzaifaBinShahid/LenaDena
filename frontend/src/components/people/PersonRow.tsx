import { LedgerRow } from "@/components/ui/LedgerRow";
import type { AmountTone, StatusTone } from "@/features/ledger/rowCopy";
import { primaryBalance, standingLabel, type PersonSummary } from "@/features/people/people";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { PersonAvatar } from "./PersonAvatar";

export type PersonRowProps = {
  summary: PersonSummary;
  onPress: () => void;
  /** Hairline above the row; set it on every row after the first. */
  divider?: boolean;
};

const STATUS_TONES: Record<ReturnType<typeof standingLabel>["tone"], StatusTone> = {
  positive: "positive",
  negative: "danger",
  neutral: "neutral",
};

/** Everything a People row shows, as data (also used for its spoken label). */
export function describePersonRow(summary: PersonSummary) {
  const { person, standing, openCount, balances } = summary;
  const primary = primaryBalance(summary);
  const { label, tone } = standingLabel(standing);
  const currencies = balances.filter((balance) => balance.netMinor !== 0).length;
  const amount: { text: string; tone: AmountTone } | undefined = primary && (standing === "owed" || standing === "owe")
    ? { text: formatSignedMoney(primary.netMinor, primary.currency, primary.netMinor > 0 ? "+" : "-"), tone: primary.netMinor > 0 ? "positive" : "negative" }
    : undefined;
  const open = openCount > 0 ? `${openCount} open` : null;
  const extra = currencies > 1 ? `${currencies} currencies` : null;
  const statusLabel = [label, open, extra].filter(Boolean).join(" · ");
  const email = person.email?.trim();
  const spokenAmount = amount && primary ? ` ${formatMoney(Math.abs(primary.netMinor), primary.currency)}` : "";
  return {
    title: person.name,
    subtitle: email || "No email",
    amount,
    status: { label: statusLabel, tone: STATUS_TONES[tone] },
    accessibilityLabel: `${person.name}. ${label}${spokenAmount}.${open ? ` ${openCount} open ${openCount === 1 ? "entry" : "entries"}.` : ""}${email ? ` ${email}.` : ""}`,
  };
}

/** A person in the People list: avatar, name, email, net balance with its status, then a chevron. */
export function PersonRow({ summary, onPress, divider }: PersonRowProps) {
  const copy = describePersonRow(summary);
  return (
    <LedgerRow
      leading={<PersonAvatar name={summary.person.name} uri={summary.person.avatarUrl} size={48} />}
      title={copy.title}
      subtitle={copy.subtitle}
      {...(copy.amount ? { amount: copy.amount } : {})}
      status={copy.status}
      divider={divider}
      chevron
      onPress={onPress}
      accessibilityLabel={copy.accessibilityLabel}
      accessibilityHint="Opens their balance and history"
    />
  );
}
