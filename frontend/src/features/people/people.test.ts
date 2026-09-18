import { describe, expect, it } from "vitest";
import type { Person, TransactionItem } from "@/features/ledger/types";
import { demoPlan } from "../ledger/demo-data";
import { formatMoney } from "../../lib/format";
import {
  balanceStatement,
  describePersonEntry,
  findPersonByName,
  groupEntriesByMonth,
  indexPersonEntries,
  isHistoryPersonId,
  normalizeSearchText,
  peopleWithHistory,
  peopleErrorMessage,
  peopleTotals,
  PERSON_TINTS,
  personEmailError,
  personFirstName,
  personInitials,
  personNameError,
  personTint,
  primaryBalance,
  searchPeople,
  shortNames,
  sortPeopleByRecentUse,
  sortPeopleForList,
  standingLabel,
  standingLine,
  summarizePeople,
  summarizePerson,
} from "./people";

function person(overrides: Partial<Person> & Pick<Person, "id" | "name">): Person {
  return { createdAt: "2026-09-01T09:00:00.000Z", ...overrides };
}

function entry(overrides: Partial<TransactionItem> & Pick<TransactionItem, "id">): TransactionItem {
  return {
    source: "personal",
    title: "Entry",
    eventDate: "2026-09-10",
    amountMinor: 10000,
    currency: "PKR",
    direction: "incoming",
    kind: "loan",
    status: "open",
    createdAt: "2026-09-10T10:00:00.000Z",
    ...overrides,
  };
}

// Intl puts a no-break space inside amounts, so expectations are built with the same formatter.
const rs = (minor: number) => formatMoney(minor, "PKR");
const usd = (minor: number) => formatMoney(minor, "USD");

const mani = person({ id: "p-mani", name: "Mani", email: "mani@example.com", createdAt: "2026-09-02T09:00:00.000Z" });
const ali = person({ id: "p-ali", name: "Ali Khan", createdAt: "2026-09-03T09:00:00.000Z" });
const zara = person({ id: "p-zara", name: "Zara", createdAt: "2026-09-12T09:00:00.000Z" });
const bilal = person({ id: "p-bilal", name: "bilal", createdAt: "2026-09-05T09:00:00.000Z" });

describe("names, emails and initials", () => {
  it("validates names like the API: trimmed, 1 to 80 characters", () => {
    expect(personNameError("  ")).toBe("Add their name.");
    expect(personNameError(" Mani ")).toBeUndefined();
    expect(personNameError("a".repeat(80))).toBeUndefined();
    expect(personNameError("a".repeat(81))).toMatch(/80 characters/);
    // 80 emoji are 160 UTF-16 units but still 80 characters.
    expect(personNameError("😀".repeat(80))).toBeUndefined();
  });

  it("accepts a blank email and rejects malformed ones", () => {
    expect(personEmailError("")).toBeUndefined();
    expect(personEmailError("   ")).toBeUndefined();
    expect(personEmailError(" Mani@Example.com ")).toBeUndefined();
    expect(personEmailError("mani@example")).toBeDefined();
    expect(personEmailError("mani example@x.com")).toBeDefined();
    expect(personEmailError("@example.com")).toBeDefined();
  });

  it("finds a saved person by exact name, ignoring case and outer spaces", () => {
    const people = [mani, ali];
    expect(findPersonByName(people, "  mani ")).toBe(mani);
    expect(findPersonByName(people, "ALI KHAN")).toBe(ali);
    expect(findPersonByName(people, "Man")).toBeUndefined();
    expect(findPersonByName(people, "   ")).toBeUndefined();
  });

  it("makes one or two initials and keeps emoji whole", () => {
    expect(personInitials("Mani")).toBe("M");
    expect(personInitials("  ali   khan ")).toBe("AK");
    expect(personInitials("Syed Ali Raza")).toBe("SR");
    expect(personInitials("")).toBe("?");
    expect(personInitials("😀 Party")).toBe("😀P");
  });

  it("uses the first name in compact places", () => {
    expect(personFirstName("  Ali Khan ")).toBe("Ali");
    expect(personFirstName("")).toBe("Someone");
  });

  it("tells people with the same first name apart", () => {
    const labels = shortNames([
      { id: "1", name: "Ali Khan" },
      { id: "2", name: "ali Raza" },
      { id: "3", name: "Mani" },
      { id: "4", name: "Sara Khan" },
      { id: "5", name: "Sara Kazmi" },
      { id: "6", name: "Hamza" },
      { id: "7", name: "Hamza" },
    ]);
    expect(Object.fromEntries(labels)).toEqual({
      1: "Ali K.",
      2: "ali R.",
      3: "Mani",
      4: "Sara Khan",
      5: "Sara Kazmi",
      6: "Hamza",
      7: "Hamza",
    });
  });
});

describe("personTint", () => {
  it("is deterministic and ignores case and outer spaces", () => {
    expect(personTint("Mani")).toBe(personTint("  mani "));
    expect(personTint("Ali Khan")).toBe(personTint("ALI KHAN"));
  });

  it("spreads names across the palette and never picks a semantic mint or coral", () => {
    const keys = new Set(["Mani", "Ali", "Zara", "Bilal", "Sara", "Hamza", "Ayesha", "Omar", "Fatima", "Usman", "Hina", "Taha"].map((name) => personTint(name).key));
    expect(keys.size).toBeGreaterThanOrEqual(4);
    for (const tint of PERSON_TINTS) {
      expect(tint.key).not.toMatch(/mint|coral/);
      expect(tint.from).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(PERSON_TINTS).toContain(personTint(""));
  });
});

describe("entries and balances", () => {
  const transactions: TransactionItem[] = [
    entry({ id: "m1", personId: "p-mani", counterparty: "Mani", amountMinor: 240000, direction: "incoming", eventDate: "2026-09-12", createdAt: "2026-09-12T08:00:00.000Z" }),
    entry({ id: "m2", personId: "p-mani", counterparty: "Mani", amountMinor: 50000, direction: "outgoing", eventDate: "2026-09-14", createdAt: "2026-09-14T08:00:00.000Z" }),
    entry({ id: "m3", personId: "p-mani", counterparty: "Mani", amountMinor: 900000, status: "settled", settledAt: "2026-09-16T10:00:00.000Z", eventDate: "2026-08-20", createdAt: "2026-08-20T08:00:00.000Z" }),
    // Unlinked (older data): belongs to Ali by name.
    entry({ id: "a1", counterparty: "  ali khan ", amountMinor: 80000, direction: "outgoing", eventDate: "2026-09-01", createdAt: "2026-09-01T08:00:00.000Z" }),
    // Linked to someone who no longer exists and named after nobody saved: ignored.
    entry({ id: "x1", personId: "p-gone", counterparty: "Gone", eventDate: "2026-09-02" }),
    // Group rows never belong to a person, even with a matching counterparty.
    entry({ id: "g1", source: "group", groupId: "g", counterparty: "Mani", status: undefined }),
    // Bilal: open entries in two currencies leaning different ways.
    entry({ id: "b1", personId: "p-bilal", counterparty: "bilal", amountMinor: 1000, currency: "USD", direction: "incoming", createdAt: "2026-09-11T08:00:00.000Z" }),
    entry({ id: "b2", personId: "p-bilal", counterparty: "bilal", amountMinor: 30000, currency: "PKR", direction: "outgoing", createdAt: "2026-09-09T08:00:00.000Z" }),
  ];
  const plan = { people: [ali, bilal, mani, zara], transactions };

  it("links rows by personId first, then by name, and skips group rows", () => {
    const index = indexPersonEntries(plan.people, plan.transactions);
    expect(index.get("p-mani")?.map((item) => item.id)).toEqual(["m2", "m1", "m3"]);
    expect(index.get("p-ali")?.map((item) => item.id)).toEqual(["a1"]);
    expect(index.get("p-zara")).toEqual([]);
  });

  it("prefers the linked person over a matching name", () => {
    const index = indexPersonEntries([mani, ali], [entry({ id: "r", personId: "p-ali", counterparty: "Mani" })]);
    expect(index.get("p-ali")?.map((item) => item.id)).toEqual(["r"]);
    expect(index.get("p-mani")).toEqual([]);
  });

  it("nets open entries per currency and counts entries", () => {
    const [aliSummary, bilalSummary, maniSummary, zaraSummary] = summarizePeople(plan);
    expect(maniSummary).toMatchObject({
      balances: [{ currency: "PKR", owedMinor: 240000, oweMinor: 50000, netMinor: 190000 }],
      standing: "owed",
      entryCount: 3,
      openCount: 2,
      lastActivityMs: Date.parse("2026-09-16T10:00:00.000Z"),
    });
    expect(aliSummary).toMatchObject({ balances: [{ currency: "PKR", netMinor: -80000 }], standing: "owe", entryCount: 1, openCount: 1 });
    expect(bilalSummary?.standing).toBe("mixed");
    expect(bilalSummary?.balances.map((balance) => [balance.currency, balance.netMinor])).toEqual([["PKR", -30000], ["USD", 1000]]);
    expect(zaraSummary).toMatchObject({ balances: [], standing: "new", entryCount: 0, openCount: 0 });
    expect(zaraSummary?.lastActivityMs).toBeUndefined();
  });

  it("calls a person settled when nothing is open and even when open entries cancel out", () => {
    const settled = summarizePerson(mani, [entry({ id: "s", status: "settled" })]);
    expect(settled).toMatchObject({ standing: "settled", balances: [], openCount: 0, entryCount: 1 });
    const even = summarizePerson(mani, [entry({ id: "e1", direction: "incoming" }), entry({ id: "e2", direction: "outgoing" })]);
    expect(even.standing).toBe("even");
    expect(even.balances).toEqual([{ currency: "PKR", owedMinor: 10000, oweMinor: 10000, netMinor: 0 }]);
  });

  it("treats unreadable amounts as zero and falls back to the event date for activity", () => {
    const summary = summarizePerson(mani, [entry({ id: "n", amountMinor: Number.NaN, createdAt: "", eventDate: "2026-09-03" })]);
    expect(summary.balances).toEqual([{ currency: "PKR", owedMinor: 0, oweMinor: 0, netMinor: 0 }]);
    expect(summary.lastActivityMs).toBe(Date.parse("2026-09-03T12:00:00.000Z"));
  });

  it("leads with the largest open amount and totals nets per currency", () => {
    const summaries = summarizePeople(plan);
    const bilalSummary = summaries.find((summary) => summary.person.id === "p-bilal");
    expect(primaryBalance(bilalSummary ?? { balances: [] })?.currency).toBe("PKR");
    expect(primaryBalance({ balances: [] })).toBeUndefined();
    expect(peopleTotals(summaries)).toEqual([
      { currency: "PKR", owedMinor: 190000, oweMinor: 110000 },
      { currency: "USD", owedMinor: 1000, oweMinor: 0 },
    ]);
  });

  it("links the demo plan's individual balances to Ali", () => {
    const demoAli = demoPlan.people.find((item) => item.name === "Ali");
    expect(demoAli).toBeDefined();
    const personal = demoPlan.transactions.filter((item) => item.source === "personal");
    expect(personal.length).toBeGreaterThan(0);
    expect(personal.every((item) => item.personId === demoAli?.id)).toBe(true);
    const summary = summarizePeople(demoPlan).find((item) => item.person.id === demoAli?.id);
    expect(summary).toMatchObject({ standing: "owe", openCount: 1, entryCount: 2, balances: [{ currency: "PKR", netMinor: -185000 }] });
  });
});

describe("ordering", () => {
  const summaries = [
    summarizePerson(zara, []),
    summarizePerson(bilal, []),
    summarizePerson(mani, [entry({ id: "m", createdAt: "2026-09-10T08:00:00.000Z" })]),
    summarizePerson(ali, [entry({ id: "a", createdAt: "2026-09-12T08:00:00.000Z" })]),
    summarizePerson(person({ id: "p-omar", name: "Omar" }), [entry({ id: "o", status: "settled", settledAt: "2026-09-15T08:00:00.000Z" })]),
  ];

  it("lists open balances first by recent activity, then everyone else A→Z", () => {
    expect(sortPeopleForList(summaries).map((summary) => summary.person.name)).toEqual(["Ali Khan", "Mani", "bilal", "Omar", "Zara"]);
  });

  it("puts the most recently used first in pickers, then the newest added", () => {
    expect(sortPeopleByRecentUse(summaries).map((summary) => summary.person.name)).toEqual(["Omar", "Ali Khan", "Mani", "Zara", "bilal"]);
  });

  it("does not reorder its input", () => {
    const before = summaries.map((summary) => summary.person.id);
    sortPeopleForList(summaries);
    sortPeopleByRecentUse(summaries);
    expect(summaries.map((summary) => summary.person.id)).toEqual(before);
  });
});

describe("searchPeople", () => {
  const people = [
    person({ id: "1", name: "Salman" }),
    person({ id: "2", name: "Ali Khan" }),
    person({ id: "3", name: "Mani", email: "mani@example.com" }),
    person({ id: "4", name: "Alina" }),
    person({ id: "5", name: "Zoë Malik", email: "zoe@alpha.io" }),
    person({ id: "6", name: "Hamza", email: "hamza.ali@example.com" }),
    person({ id: "7", name: "Khalid" }),
  ];
  const names = (items: Person[]) => items.map((item) => item.name);

  it("ranks name starts, then word starts, then contains, then email", () => {
    expect(names(searchPeople(people, "ali", (item) => item, undefined))).toEqual(["Ali Khan", "Alina", "Zoë Malik", "Khalid", "Hamza"]);
  });

  it("is case-, space- and accent-insensitive", () => {
    expect(names(searchPeople(people, "  ZOE  ", (item) => item))).toEqual(["Zoë Malik"]);
    expect(names(searchPeople(people, "ali   k", (item) => item))).toEqual(["Ali Khan"]);
    expect(normalizeSearchText("  Zoë  K ")).toBe("zoe k");
  });

  it("matches emails last and honours the limit", () => {
    expect(names(searchPeople(people, "example", (item) => item))).toEqual(["Mani", "Hamza"]);
    expect(names(searchPeople(people, "a", (item) => item, 2))).toEqual(["Ali Khan", "Alina"]);
  });

  it("returns everything for a blank query and nothing for a miss", () => {
    expect(searchPeople(people, "   ", (item) => item)).toHaveLength(people.length);
    expect(searchPeople(people, "xyz", (item) => item)).toEqual([]);
  });

  it("works on summaries through the accessor", () => {
    const summaries = people.map((item) => summarizePerson(item, []));
    expect(searchPeople(summaries, "man", (summary) => summary.person).map((summary) => summary.person.name)).toEqual(["Mani", "Salman"]);
  });
});

describe("copy", () => {
  it("labels standings with their tone", () => {
    expect(standingLabel("owed")).toEqual({ label: "Owes you", tone: "positive" });
    expect(standingLabel("owe")).toEqual({ label: "You owe", tone: "negative" });
    expect(standingLabel("settled")).toEqual({ label: "Settled", tone: "neutral" });
    expect(standingLabel("new").label).toBe("No entries yet");
  });

  it("states the balance in plain language", () => {
    const owed = summarizePerson(mani, [entry({ id: "1", amountMinor: 240000 })]);
    expect(balanceStatement(owed)).toMatchObject({ headline: "Mani owes you", amounts: [rs(240000)], tone: "positive", sentence: `Mani owes you ${rs(240000)}` });
    expect(standingLine(owed)).toBe(`Owes you ${rs(240000)}`);

    const owe = summarizePerson(ali, [entry({ id: "2", amountMinor: 80000, direction: "outgoing" })]);
    expect(balanceStatement(owe)).toMatchObject({ headline: "You owe Ali", sentence: `You owe Ali ${rs(80000)}`, tone: "negative" });
    expect(standingLine(owe)).toBe(`You owe ${rs(80000)}`);

    const settled = summarizePerson(mani, [entry({ id: "3", status: "settled" })]);
    expect(balanceStatement(settled)).toMatchObject({ headline: "All settled with Mani", amounts: [] });
    expect(balanceStatement(summarizePerson(zara, []))).toMatchObject({ headline: "No balances with Zara yet" });
  });

  it("joins several currencies leaning the same way, largest first", () => {
    const summary = summarizePerson(mani, [
      entry({ id: "1", amountMinor: 1000, currency: "USD" }),
      entry({ id: "2", amountMinor: 240000, currency: "PKR" }),
    ]);
    const statement = balanceStatement(summary);
    expect(statement.amounts).toHaveLength(2);
    expect(statement.amounts).toEqual([rs(240000), usd(1000)]);
    expect(statement.sentence).toBe(`Mani owes you ${rs(240000)} and ${usd(1000)}`);
    expect(standingLine(summary)).toBe(`Owes you ${rs(240000)} + more`);
  });

  it("describes both directions when currencies disagree", () => {
    const summary = summarizePerson(mani, [
      entry({ id: "1", amountMinor: 1000, currency: "USD" }),
      entry({ id: "2", amountMinor: 30000, currency: "PKR", direction: "outgoing" }),
    ]);
    expect(balanceStatement(summary).headline).toBe("Balances both ways");
    expect(balanceStatement(summary).sentence).toBe(`Mani owes you ${usd(1000)}, and you owe Mani ${rs(30000)}`);
  });

  it("describes history rows with day, kind and settlement", () => {
    const today = "2026-09-14";
    expect(describePersonEntry(entry({ id: "1", eventDate: "2026-09-13", kind: "loan" }), today)).toMatchObject({
      subtitle: "13 Sep · Loan",
      amount: { tone: "positive" },
      status: { label: "Open" },
      canSettle: true,
    });
    expect(describePersonEntry(entry({ id: "2", eventDate: "2026-09-20", kind: "expense", direction: "outgoing" }), today).subtitle).toBe("Due 20 Sep · Expense");
    const settled = describePersonEntry(entry({ id: "3", eventDate: "2026-09-02", status: "settled", settledAt: "2026-09-05T10:00:00.000Z" }), today);
    expect(settled).toMatchObject({ subtitle: "2 Sep · Loan · settled 5 Sep", canSettle: false, status: { label: "Settled" } });
  });

  it("groups history by month, newest month first", () => {
    const months = groupEntriesByMonth([
      entry({ id: "a", eventDate: "2026-09-12" }),
      entry({ id: "b", eventDate: "2026-09-02" }),
      entry({ id: "c", eventDate: "2026-08-30" }),
      entry({ id: "d", eventDate: "", createdAt: "2026-07-01T00:00:00.000Z" }),
    ]);
    expect(months.map((month) => [month.month, month.items.map((item) => item.id)])).toEqual([
      ["2026-09", ["a", "b"]],
      ["2026-08", ["c"]],
      ["2026-07", ["d"]],
    ]);
  });
});

describe("peopleErrorMessage", () => {
  it("names the person on a duplicate and explains a missing migration", () => {
    expect(peopleErrorMessage({ status: 409, code: "person_exists" }, { name: " Mani " })).toBe("Mani is already in your people.");
    expect(peopleErrorMessage({ status: 409, code: "person_exists" })).toMatch(/already in your people/);
    expect(peopleErrorMessage({ status: 503, code: "people_unavailable" })).toMatch(/^People needs the latest database update/);
    expect(peopleErrorMessage({ status: 404, code: "person_not_found" })).toMatch(/no longer in your people/);
  });

  it("treats a bare 404 on a People route as an older server and leaves other errors alone", () => {
    expect(peopleErrorMessage({ status: 404 }, { peopleRoute: true })).toBe("People needs the latest server update.");
    expect(peopleErrorMessage({ status: 404 })).toBeNull();
    expect(peopleErrorMessage({ status: 400, code: "invalid_email" })).toBeNull();
  });

  it("explains why an emailed invite couldn't be sent", () => {
    expect(peopleErrorMessage({ status: 400, code: "person_has_no_email" }, { name: "Mani Ahmed" })).toBe("Add an email for Mani first, or share the invite instead.");
    expect(peopleErrorMessage({ status: 400, code: "person_has_no_email" })).toBe("Add their email first, or share the invite instead.");
    expect(peopleErrorMessage({ status: 429, code: "invite_recently_sent" }, { name: "Mani Ahmed" })).toBe("Mani already got an invite in the last 12 hours.");
    expect(peopleErrorMessage({ status: 429, code: "invite_recently_sent" })).toBe("They already got an invite in the last 12 hours.");
  });
});

describe("remembered names (peopleWithHistory)", () => {
  it("remembers a name used on an individual balance even when nobody is saved (no People migration yet)", () => {
    const rows = [
      entry({ id: "t1", counterparty: "mani", createdAt: "2026-09-10T10:00:00.000Z" }),
      entry({ id: "t2", counterparty: " Mani ", createdAt: "2026-09-14T10:00:00.000Z", status: "settled" }),
    ];
    const people = peopleWithHistory([], rows);
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ name: "Mani", createdAt: "2026-09-10T10:00:00.000Z" });
    expect(isHistoryPersonId(people[0]?.id ?? "")).toBe(true);
    // So the picker finds them on the second entry instead of offering to add them again.
    expect(findPersonByName(people, "MANI")?.id).toBe(people[0]?.id);
    expect(summarizePeople({ people, transactions: rows })[0]?.entryCount).toBe(2);
  });

  it("never duplicates a saved person and ignores group rows", () => {
    const rows = [
      entry({ id: "t1", counterparty: "Mani", personId: "p-mani" }),
      entry({ id: "t2", counterparty: "MANI" }),
      entry({ id: "t3", counterparty: "Hamza", source: "group", groupId: "g1" }),
    ];
    const people = peopleWithHistory([mani], rows);
    expect(people.map((item) => item.id)).toEqual(["p-mani"]);
    expect(isHistoryPersonId("p-mani")).toBe(false);
  });
});
