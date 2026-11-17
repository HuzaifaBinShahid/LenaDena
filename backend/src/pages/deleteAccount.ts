import { emailLink, POLICY_UPDATED, renderPage, type PageContact } from "./layout.js";

/**
 * The account deletion page served at /delete-account: the web link Google Play asks for ("where can a person ask for
 * their account and data to be deleted?"). It must match what `app_delete_account` (supabase/migrations/
 * 202611160012_delete_account.sql) and SupabaseLedgerRepository.deleteAccount really do; change them together.
 * Requests that arrive by email are carried out with `pnpm --filter @lenadena/backend delete-account` (DEPLOYMENT.md).
 */
export function deleteAccountPage(contact: PageContact): string {
  const write = emailLink(contact, "Delete my LenaDena account", "the contact address for this app");
  const byEmail = contact.email
    ? `<p>If you cannot open the app, for example because you uninstalled it or forgot your password, email ${write}. Write from the email address you signed up with and say that you want your account deleted.</p>
<p>We will reply to check that the account is yours, and we may ask a question only its owner could answer. We delete the account within 30 days of your request and tell you when it is done.</p>`
    : `<p>Our contact address is not published on this page yet, so requests by email are not available right now. Please use the in-app option above.</p>`;
  return renderPage({
    title: "Delete your account",
    description: "How to delete your LenaDena account and the information tied to it, and what happens when you do.",
    path: "/delete-account",
    body: `
<h1>Delete your LenaDena account</h1>
<p class="meta">Last updated ${POLICY_UPDATED}</p>
<p>You can delete your LenaDena account, and the information tied to it, at any time. Deleting is permanent: it cannot be undone and we cannot bring an account back afterwards.</p>

<h2 id="in-app">Delete it in the app (fastest)</h2>
<ol>
<li>Open LenaDena and sign in.</li>
<li>Open the <strong>Account</strong> page (Settings) and scroll to the bottom.</li>
<li>Tap <strong>Delete account</strong>.</li>
<li>Type your password and the word <strong>DELETE</strong>, then confirm.</li>
</ol>
<p>It takes effect straight away and you are signed out. If you cannot find <strong>Delete account</strong>, update the app to the latest version, or use the email option below.</p>

<h2 id="by-email">Cannot use the app? Ask by email</h2>
${byEmail}

<h2 id="what-happens">What happens when you delete your account</h2>

<h3>Deleted</h3>
<ul>
<li>Your sign-in (your email address and password), so you can no longer sign in.</li>
<li>Your profile photo. Your name and email address on your profile are replaced with "Deleted user".</li>
<li>The people you saved, their photos and the email settings you chose for them.</li>
<li>Your individual entries and the receipt photos attached to them.</li>
<li>Emails still waiting to be sent about you or your people, and invitations you sent or received that nobody accepted.</li>
<li>The notification codes of your phones, and the reminders you sent or received.</li>
<li>Any group that nobody else ever joined, with everything in it.</li>
</ul>

<h3>Kept, without your name</h3>
<ul>
<li>Records in groups you share with other people (expenses, payments and balances) stay, so that everyone else's totals stay correct. They show you as "Deleted user", and your name is replaced in the group's activity feed.</li>
<li>Receipt and payment-proof photos you attached to a shared expense or payment stay with that group, for the same reason.</li>
<li>If you owned a group that has other members, it passes to the member who joined earliest.</li>
<li>The group's activity feed keeps its short notes about expenses that were edited or deleted (the name and the amount).</li>
</ul>

<h3>Outside our control</h3>
<ul>
<li>An email that has already been delivered cannot be taken back.</li>
<li>Our hosting and email providers keep short-lived logs, which expire on their own schedule.</li>
<li>Other people in your groups may have kept their own copies of what you shared with them.</li>
</ul>

<div class="card warn">
<h2>Before you delete</h2>
<p>If you owe money to someone in a shared group, or are owed, the balance stays on that group's records under the name "Deleted user". Settling up first, or telling the group, avoids confusion.</p>
<p>You can create a new account with the same email address later. It starts empty.</p>
</div>

<p>To see everything we keep and why, read the <a href="/privacy">privacy policy</a>.</p>
`,
  }, contact);
}
