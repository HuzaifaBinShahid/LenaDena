import { emailLink, escapeHtml, POLICY_UPDATED, renderPage, type PageContact } from "./layout.js";

/**
 * The privacy policy served at /privacy. Written from what the app actually does (see documentation/ARCHITECTURE.md and
 * PROJECT_MEMORY.md): when the app starts collecting something new, or stops, change this text and POLICY_UPDATED in
 * the same commit. Nothing here may promise more than the code does (there is no automatic purge of old records, so the
 * text does not say there is; the data export in Settings covers records but not photos, and the text says so).
 */
export function privacyPage(contact: PageContact): string {
  const operator = escapeHtml(contact.operator);
  const write = emailLink(contact, "LenaDena privacy question", "the contact address for this app (it is not published on this page yet)");
  return renderPage({
    title: "Privacy policy",
    description: "What LenaDena keeps about you, who can see it, how long it is kept, and the choices you have.",
    path: "/privacy",
    body: `
<h1>Privacy policy</h1>
<p class="meta">Last updated ${POLICY_UPDATED}</p>
<p>LenaDena ("lena-dena", give and take) helps friends keep track of open balances: what you owe, what is owed to you and what has been settled. It never moves money. This page explains what the app keeps about you, who can see it and what you can do about it. LenaDena is run by ${operator}.</p>

<div class="card">
<h2>The short version</h2>
<ul>
<li>We keep what you put into the app so that it can work: your account, your groups and your records.</li>
<li>We show no ads, we do not sell or rent your information, and the app has no analytics or tracking software in it.</li>
<li>People in a group can see what is added to that group. Your individual entries and your saved people are private to you.</li>
<li>LenaDena only emails a friend when you tap Send, or when you switch on reminders for that person.</li>
<li>Notifications on your phone (a friend's reminder, an update about a payment, an invitation to a group) are off until you switch them on. The app asks once, and you can change your mind in Settings.</li>
<li>You can delete your account from inside the app at any time.</li>
</ul>
</div>

<h2 id="what-we-keep">1. What we keep</h2>

<h3>Your account</h3>
<ul>
<li>Your email address and your name.</li>
<li>Your password. Only our sign-in provider holds it, in scrambled (hashed) form. We never see it.</li>
<li>A profile photo, if you add one.</li>
<li>Your appearance and email-tone settings, and the last time you used the app.</li>
</ul>

<h3>Groups and shared records</h3>
<ul>
<li>Group names and who is in each group.</li>
<li>Expenses: title, amount, date, who paid, how it is split and any note, plus a receipt photo if you add one.</li>
<li>Payment claims, confirmations and notes, plus a payment-proof photo if you add one. A payment proof is visible only to the two people in that payment.</li>
<li>The activity feed of each group. When an expense is edited or deleted, the feed notes it with the expense's name and its new or old amount.</li>
<li>Invitations, including the email address that was invited.</li>
<li>Reminders: when a member of a group taps Remind on someone who owes them, we keep who sent it, who it was for, which group and when, for about a week. That is only so that one person cannot be reminded more than once a day. The text of a notification is not kept.</li>
<li>Payment notifications: so that each step of a payment (someone says they paid, it is confirmed, it needs attention, the payer marks it settled) is announced only once, we keep the payment's code, the kind of step and when it happened, for about a week. That record holds no names, amounts or notification text.</li>
</ul>

<h3>Individual entries and saved people</h3>
<ul>
<li>Balances you track on your own: the title, amount, date, the person's name, a note and an optional receipt photo.</li>
<li>People you save: a name, and optionally an email address and a photo, and the email settings you choose for them.</li>
<li>These are private to you. Other LenaDena users cannot see them.</li>
</ul>

<h3>Notifications (only if you switch them on)</h3>
<ul>
<li>A code that identifies your phone to Google's Firebase Cloud Messaging service (a device token), the kind of phone (Android) and when it was registered. Without it nothing can be sent to your phone.</li>
<li>We remove it when you switch notifications off, when you sign out and when you delete your account, and we delete it if Google tells us the phone no longer exists.</li>
</ul>

<h3>Emails sent for you</h3>
<ul>
<li>While an email waits to be sent, we keep who it is for and what it says: an account statement with its PDF, an invitation or a reminder.</li>
<li>Emails about your account itself (confirming your address, resetting a password) come from our sign-in provider.</li>
</ul>

<h3>Technical records</h3>
<ul>
<li>Our server keeps short-lived logs of requests: the time, the IP address, which action was asked for and whether it worked. We use them to keep the service secure and to find and fix errors.</li>
<li>Sign-in tokens are not written to those logs.</li>
</ul>

<h3>On your phone only</h3>
<ul>
<li>Your signed-in session and your settings are stored on your phone.</li>
<li>If you switch on notifications, your phone asks your permission first. A notification shows who it is from, and for a reminder or a payment update the amount and the group, so it is visible on your lock screen unless your phone hides previews.</li>
<li>If you turn on Face ID or fingerprint sign-in, your password is kept in your phone's secure storage and released only after your phone checks your face or finger. We never receive your face or fingerprint data: your phone's system handles it.</li>
<li>Reading text from a receipt photo happens on your phone.</li>
<li>The app asks for the camera and your photo library only when you choose to add a photo. It does not ask for your contacts or your location, and this version does not use the microphone.</li>
</ul>

<h2 id="why">2. Why we use it</h2>
<ul>
<li>To run the app: to show your balances and groups and to produce statements.</li>
<li>To keep accounts safe: confirming your email address, resetting passwords and limiting abuse.</li>
<li>To send the emails you ask for.</li>
<li>To find and fix problems.</li>
<li>To follow the law when we are required to.</li>
</ul>
<p>Where the law asks us for a legal basis, we rely on providing the service you asked for, our legitimate interest in keeping it secure and working, and your choices, for example when you tap Send.</p>

<h2 id="who">3. Who else sees it</h2>
<ul>
<li><strong>Other people in your groups</strong> see what you add to a shared group, including your name and photo.</li>
<li><strong>People you email</strong> receive what you send them.</li>
<li><strong>The person you remind, invite or pay</strong> gets a notification on their phone, if they switched notifications on. It names you (first name), the group and, for a reminder or a payment, the amount. The same goes for the person who reviews your payment: you are told when they confirm it or say it needs attention.</li>
<li><strong>Our service providers</strong> handle information only to run LenaDena for us: Supabase (sign-in, database and private file storage), Vercel (runs our server), Brevo (delivers emails) and, only if you switch notifications on, Google Firebase Cloud Messaging (delivers notifications to phones: it receives your phone's device token and the text of each notification).</li>
<li><strong>No one else.</strong> We do not sell or rent your information and we do not give it to advertisers. We would share it only if the law required us to.</li>
</ul>

<h2 id="where">4. Where it is kept</h2>
<p>Your records and files are kept by Supabase in Singapore. Our server, our email provider and Google's notification service may handle information in other countries while they deliver the service. If you live somewhere else, this means your information is transferred to those places.</p>

<h2 id="how-long">5. How long we keep it</h2>
<p>We keep your account and records until you delete your account. What happens then is described on the <a href="/delete-account#what-happens">account deletion page</a>. Reminder records are kept for about a week. Logs kept by our providers are short-lived and expire on their own schedule. An email that has already been delivered stays in the mailbox it was sent to.</p>

<h2 id="choices">6. Your choices</h2>
<ul>
<li>Change your name, photo and settings in the app, and change your password there too.</li>
<li>Edit or delete the expenses and balances you add. An individual balance can always be changed, with one limit: once a payment is recorded on it, who owes whom and the currency stay as they are. A shared expense can be changed by the person who added or paid it, and deleted by them or by the group's owner or admin.</li>
<li>Switch email reminders off for any person you saved, switch notifications off (Settings, then Notifications) and switch the app lock off.</li>
<li><strong>Delete your account</strong> in the app, or ask us to do it: see <a href="/delete-account">how to delete your account</a>.</li>
<li><strong>Download a copy of your records</strong> in the app: Settings, then Export my data, as a spreadsheet (CSV) or as a complete file (JSON). It holds your own records (including which phones are registered for notifications, but not their codes) and shows other people by name only. Photos and receipt images are not in it.</li>
<li>To get those photos, to have something corrected or to ask a question about your information, write to ${write}. We aim to answer within 30 days.</li>
<li>Depending on where you live, you may also be able to object to or restrict some uses of your information, and to complain to your local data protection authority.</li>
</ul>

<h2 id="not-a-user">7. If someone added your email address</h2>
<p>A LenaDena user may save your name and email address in their private list, for example to send you a statement of what is owed. We keep it only for that person and use it only to send the emails they ask for. We do not create an account for you.</p>
<p>To stop the emails, ask the person who sends them, or write to ${write} and we will stop emails to your address.</p>

<h2 id="security">8. Security</h2>
<ul>
<li>Traffic between the app and our server is encrypted.</li>
<li>Receipts, payment proofs and photos are kept in private storage and are shown only through temporary links.</li>
<li>The database checks who may see each record, so people see only their own groups and entries.</li>
<li>You can add an app lock with Face ID or a fingerprint.</li>
<li>No online service is perfectly secure. If you think someone else has used your account, change your password and write to us.</li>
</ul>

<h2 id="children">9. Children</h2>
<p>LenaDena is not meant for children under 13, or under the age at which your country lets you agree to a service like this yourself, if that age is higher. If you think a child has given us information, write to us and we will delete it.</p>

<h2 id="changes">10. Changes to this page</h2>
<p>We will update this page when the app changes. The date at the top shows the latest update. If a change matters to you, for example a new kind of information, we will tell you in the app or by email.</p>

<h2 id="contact">11. Contact</h2>
<p>${operator}<br>Email: ${write}</p>
`,
  }, contact);
}
