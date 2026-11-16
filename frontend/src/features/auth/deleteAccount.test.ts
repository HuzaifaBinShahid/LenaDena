import { describe, expect, it } from "vitest";
import { DELETE_WORD, describeDeleteError, isDeleteWord } from "./deleteAccount";

describe("isDeleteWord", () => {
  it("accepts the word however a phone capitalises it, with spaces around it", () => {
    for (const typed of ["DELETE", "delete", "Delete", "  delete  ", "dElEtE"]) expect(isDeleteWord(typed)).toBe(true);
    expect(isDeleteWord(DELETE_WORD)).toBe(true);
  });

  it("refuses anything else", () => {
    for (const typed of ["", " ", "del", "deleted", "delete me", "d e l e t e", "remove", "DELETE!"]) expect(isDeleteWord(typed)).toBe(false);
  });
});

describe("describeDeleteError", () => {
  it("asks for the password again when the sign-in was not recent", () => {
    expect(describeDeleteError({ status: 403, code: "recent_sign_in_required" }).message).toContain("password again");
  });

  it("says plainly when the server cannot delete accounts yet", () => {
    expect(describeDeleteError({ status: 503, code: "account_deletion_unavailable" }).message).toContain("isn't switched on");
  });

  it("explains rate limits and shows the server's own words for a failed deletion", () => {
    expect(describeDeleteError({ status: 429, code: "rate_limited" }).title).toBe("Too many attempts");
    expect(describeDeleteError({ status: 500, code: "account_deletion_failed", message: "We couldn't remove your photos and receipts. Nothing was deleted; please try again." }).message).toContain("Nothing was deleted");
  });

  it("covers a lost connection and anything unexpected without leaking details", () => {
    expect(describeDeleteError(new TypeError("Network request failed")).message).toContain("can't reach");
    const odd = describeDeleteError({ status: 500, code: "internal_error", message: "ECONNRESET at 10.0.0.1" });
    expect(odd.message).not.toContain("10.0.0.1");
    expect(describeDeleteError(undefined).title).toBe("Couldn't delete your account");
  });
});
