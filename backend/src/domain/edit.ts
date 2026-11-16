import { DomainError, ForbiddenError, NotFoundError } from "./errors.js";

/**
 * Turns what the edit and delete functions of supabase/migrations/202611170013_edit_delete_entries.sql raise into
 * clear API errors. The functions raise short identifiers on purpose; anything else is a plain database error.
 */

/** The migration has not been applied yet, so nothing can be edited or deleted. */
export class EditUnavailableError extends DomainError {
  constructor() {
    super("Editing and deleting aren't switched on yet. Try again after the next update.", 503, "edit_unavailable");
  }
}

export function expenseNotFound() {
  return new NotFoundError("Expense not found");
}

export function entryNotFound() {
  return new NotFoundError("Individual entry not found");
}

export function notAllowedToEditExpense() {
  return new ForbiddenError("Only the person who added or paid this expense can change it.");
}

export function notAllowedToDeleteExpense() {
  return new ForbiddenError("Only the person who added or paid this expense, or a group owner or admin, can delete it.");
}

export function participantLeft() {
  return new DomainError("Someone in this expense has left the group, so it can't be edited. Delete it and add it again instead.", 409, "participant_left");
}

export function entryHasPayments() {
  return new DomainError("Payments are recorded on this balance, so who owes whom and the currency can't change.", 409, "entry_has_payments");
}

export function entrySettled() {
  return new DomainError("This balance is fully paid, so its amount can't change.", 409, "entry_settled");
}

export function amountBelowPaid() {
  return new DomainError("The amount must be more than what has already been paid.", 409, "amount_below_paid");
}

export function invalidReceipt() {
  return new DomainError("That photo can't be used. Choose it again from your phone.", 400, "invalid_receipt");
}

export function invalidAmount() {
  return new DomainError("Enter an amount greater than zero.", 400, "invalid_amount");
}
