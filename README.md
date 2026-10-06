# Jev Mail — AI Gmail Cleaner, Auto-Labeler & Inbox Triage (Chrome / Brave Extension)

**Built by [Kirtan Ugreja](https://github.com/KirtanUgreja).**

Jev Mail is a free, open-source Chrome and Brave extension that uses AI to
organise Gmail. It **classifies every email** (category, priority, important,
needs reply, spam), **auto-labels Gmail into folders** under `Jev/...`, and
**cleans up junk mail safely** with a preview, Trash-only deletes and one-click
Undo. Use it for inbox zero, bulk unsubscribe-style cleanup by sender, and
email triage, with no backend server. It runs entirely in your browser with
your own [OpenRouter](https://openrouter.ai/typesafe/jev-1.13) or
[TypeSafe](https://typesafe.ai) API key and calls TypeSafe's **Jev** model.

**Features**

- 🏷️ **Auto-label Gmail**: `Jev/Work`, `Jev/Finance & Invoices`,
  `Jev/Priority/High`, `Jev/Needs Reply`, … with optional auto-archive.
- 🧹 **Safe Gmail cleanup**: bulk-delete junk by sender. It always shows a
  preview first, only moves mail to Trash, and has Undo. Starred, important and
  protected mail is never touched.
- 🤖 **AI email classification**: category, priority, importance, reply needed
  and spam score for every email, in a single request per email.
- 📊 **Side panel and dashboard**: counts by category and priority, progress
  bar, sortable table, CSV export.
- 🔒 **Private by design**: no server, keys stay in your browser, and only the
  sender, subject and a body excerpt are sent to the AI provider.

Three ways to use it:

- **Inline in Gmail** — badges on each row of your real thread list: category,
  priority, `!` when important, `↩` when it needs a reply (otherwise Reply %),
  and Spam %. Needs nothing but a TypeSafe or OpenRouter API key.
- **The side panel** — click the toolbar icon. Counts by category and priority,
  **Classify inbox**, **Apply labels**, **Clean up (preview)**, **Undo last
  cleanup**, and a progress bar. Needs a Gmail API OAuth client. (In a browser
  without the side panel API, the icon opens the dashboard instead.)
- **The dashboard** — the whole inbox in one sortable, filterable, exportable
  table, with the same actions and all the settings. Needs a Gmail API OAuth
  client.

It never sends mail and never deletes permanently. With Gmail connected it can
label, archive and move to Trash — always reversible (see [Gmail access](#gmail-access-and-the-restricted-scope)).

```
Email                     Subject                                Category          Priority  Spam  Reply
• Amazon.com via Inbound   Ordered: 4 Electronics items           Orders/Shipping   Low        45%    4%
• OpenAI                   Review needed: safety identifier …     Security/Alerts   High       20%   17%
• A cold sender            Re: you missed it                      Promotions        Low        29%   51%
```

## Quick start — in Gmail, no Google Cloud account

1. Open `chrome://extensions`, turn on **Developer mode**, **Load unpacked** →
   pick this folder.
2. Click the toolbar icon, hit the **gear**, paste your TypeSafe or OpenRouter key
   (see [below](#api-key-typesafe-or-openrouter)), press **Test**, **Save** —
   or put it in `.env`.
3. Open [Gmail](https://mail.google.com/). Rows get badged as you scroll.

### API key: TypeSafe or OpenRouter

Jev is available directly from TypeSafe (`https://api.typesafe.ai/v1/systemone`)
and through OpenRouter (`https://openrouter.ai/api/v1/systemone`). Both use the
same request format. Jev Mail works with either key and checks which one you
have. It calls the provider straight from your browser; there is no backend.

- **OpenRouter:** create a key at
  [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys).
- **TypeSafe:** create a key at [console.typesafe.ai](https://console.typesafe.ai/).

Use a dedicated key with a spending limit. Then either:

- **`.env` file:** copy `.env.example` to `.env` in the extension folder and set
  `OPENROUTER_API_KEY` and/or `TYPESAFE_API_KEY`. Reload the extension on
  `chrome://extensions` after editing. `.env` is gitignored.
- **Settings:** paste the key under **Settings → Jev** and press **Test**. A key
  typed here overrides `.env`, and is kept in `chrome.storage.local`.

With both keys available, OpenRouter is used; set `JEV_PROVIDER=typesafe` in
`.env` to prefer TypeSafe. **Settings** shows which provider is active. The model
defaults to the latest Jev; `jev-1.13` pins a version on either provider (it is
sent as `typesafe/jev-1.13` to OpenRouter).

**The `.env` file is packaged with the extension.** Never zip or publish the
folder with a real key in it.

Errors you may see: *rejected the API key (401)*, a wrong or revoked key; *out
of credits (402)*, top up or raise the key's limit; *rate limit (429)*, lower
**Parallel requests**.

That is the whole setup. The overlay reads the sender, subject and preview line
straight out of Gmail's page — the same three fields the API path sends to Jev —
so it needs no OAuth client and no Gmail API access at all.

What it looks like:

```
☆  OpenAI          Review needed: safety identifier activity  - We noticed…   Security  High    S 20%  R 17%
☆  Amazon.com      Ordered: 4 Electronics items  - Your order has shipped     Shopping  Low     S 45%  R 4%
☆  Linear          ENG-2214 assigned to you  - Can you look before Thursday   Work      Normal  S 2%   R 62%
```

Rows are classified once and cached, so scrolling back is free. Both settings
live under **Settings → In Gmail**: turn the badges off, or keep them on but
stop classifying new rows automatically.

## Full setup — the dashboard

The dashboard needs Gmail API access, which means an OAuth client. Skip this if
the overlay is enough for you.

### 1. Load the extension

Same as the quick start: **Load unpacked** on `chrome://extensions`. Then open
the dashboard, hit the **gear**, and find the **Redirect URL** under *Gmail*. It
looks like `https://<extension-id>.chromiumapp.org/`. Copy it.

### 2. Create a Google OAuth client

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or pick)
   a project and [enable the Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com).
2. Configure the **OAuth consent screen**: type *External* is fine, and add your
   own Google account under **Test users**. That's all an unpublished app needs.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
   Under **Authorized redirect URIs**, paste the redirect URL from step 1.
4. Under **Data access** (or **Scopes**), add `.../auth/gmail.modify` and
   `.../auth/gmail.labels`.
5. Copy the client ID into **Settings → Gmail → Google OAuth client ID** and
   save. No files to edit, no reload.

The sign-in uses `chrome.identity.launchWebAuthFlow` with a *Web application*
client rather than `getAuthToken` with a *Chrome extension* client. That way it
works in Brave as well as Chrome, and nobody has to put a client ID in
`manifest.json`.

#### Gmail access and the restricted scope

Jev Mail asks for exactly two scopes:

| Scope | Used for |
| ----- | -------- |
| `https://www.googleapis.com/auth/gmail.modify` | read messages, add/remove labels, archive, move to Trash and back |
| `https://www.googleapis.com/auth/gmail.labels` | create the `Jev/...` labels |

It never asks for `https://mail.google.com/` (full access), so it **cannot**
delete permanently. Trash empties itself after 30 days.

`gmail.modify` is a Google **restricted scope**. For personal use, leave the app
in **Testing** mode on the consent screen: up to 100 test users can sign in with
no review. Publishing publicly requires Google's OAuth verification **and** a
third-party security assessment.

### 3. Run it

**Start** authorizes Gmail (once), fetches your messages, and classifies them.
Rows fill in live. **Stop** halts mid-run; anything already classified is kept.

## Using it

| Control       | What it does                                                                 |
| ------------- | ---------------------------------------------------------------------------- |
| **Start**     | Fetches (first run) and classifies everything that has no result yet          |
| **Sync**      | Pulls newly arrived messages only — already-stored ones are skipped           |
| **Export**    | CSV of whatever the current filters show                                      |
| Column header | Click to sort; click again to flip direction                                  |
| Search        | Filters on sender and subject                                                 |

Settings worth knowing:

- **Search query** — any Gmail search string. `in:inbox` by default; try
  `newer_than:30d`, `-category:promotions`, or `is:unread`.
- **Max messages** — how many to pull per run, newest first. Default 500; set it
  to **0** to fetch every message the query matches. There is no hard ceiling —
  the practical limits are time and Gmail's quota, not the extension. A full
  20,000-message inbox is roughly 20 minutes of fetching plus 20 minutes of
  classifying at the default concurrency, plus Jev usage billed by your provider. The table
  renders 400 rows at a time so a large inbox stays responsive.
- **Parallel requests** — raise this to go faster, lower it if you see 429s
  (your provider's rate limits apply).
- **Categories** — one per line as `Name: what belongs in it`. Defaults: Work,
  Personal, Finance/Invoices, Orders/Shipping, Security/Alerts, Newsletters,
  Promotions, Social, Spam. The description
  is the rubric Jev scores against, so make it specific to your mail. Edit these
  freely; they are the biggest lever on classification quality.

## Labels ("folders")

Gmail has no folders; Jev Mail uses labels. **Start** fetches, classifies, and
then labels. **Apply labels** labels again from the stored results, for example
after you change the threshold. Missing labels are created on first use:

```
Jev/<Category>            one per category ("Finance/Invoices" → "Jev/Finance & Invoices",
                          since Gmail treats "/" as nesting)
Jev/Priority/High · Medium · Low
Jev/Needs Reply
Jev/Review
```

- Labels are applied with `users.messages.batchModify`: one call per group of
  emails that need the same change (up to 1,000 per call), with a short pause
  between calls.
- **Confidence threshold** (default 0.75). If Jev is less sure than this about
  the category, priority or needs-reply answer, the email gets **only**
  `Jev/Review`. No other label is added and it is not archived.
- **Archive after labeling** (default off). For the categories you tick, INBOX
  is removed, so the email only appears under its `Jev/` label. It is still in
  All Mail. Low-confidence emails are never archived.
- If a later run changes an email's category or priority, the old `Jev/` labels
  are removed. Labels you made yourself are never touched.

## Cleanup

Cleanup is built never to lose an email you wanted:

- **Trash only.** It uses `users.messages.trash`; Gmail empties Trash after 30
  days. The extension doesn't hold a scope that could delete permanently.
- **Preview first.** **Clean up (preview)** lists the candidates (sender,
  subject, reason, confidence) with checkboxes. **Nothing is pre-selected and
  nothing is trashed until you confirm.** **By sender** groups them ("142 emails
  from promo@shop.com") so you can approve a whole sender with one tick.
- **Candidates** need `junk = yes` with confidence ≥ the **cleanup threshold**
  (default 0.9).
- **Never touched**, whatever Jev says:
  - starred emails, and emails Gmail marked important
  - `important = yes`, `needs_reply = yes`, or priority High
  - **protected categories** (default Finance/Invoices, Security/Alerts)
  - **protected senders** (an address or a whole domain)
  - emails newer than the **minimum age** (default 7 days)
  - low-confidence results (those only go to `Jev/Review`)
  - genuine service notices: the `service_notice` signal is high and the spam
    signal is low
- **Re-checked live.** Right before trashing, each email's labels are re-read
  from Gmail, so one you starred since the last sync is skipped.
- **Undo last cleanup** restores the last batch with `users.messages.untrash`.
  If some fail, press it again to retry the rest.
- **Log.** Every batch is logged locally (date, sender, subject, message ID —
  never bodies) under `cleanupLog` in `chrome.storage.local`, last 100 batches.

## How the classification works

Spam is never asked as a question. Jev reads instructions literally and gets
worse when one question hides several judgments
([jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13)), and "is this
spam, a scam, or phishing?" hides three. A genuine *"your payment failed, your
account will be suspended"* notice from Google Cloud reads exactly like a
phishing template, and scored 86% spam under that one question.

So each email gets narrow questions in one request — Jev ingests the state
once and answers them in parallel. Alongside the spam signals below, the same
request asks:

| Question | Type | Used for |
| -------- | ---- | -------- |
| `category` | choice from your category list | `Jev/<Category>` label |
| `priority` | High / Medium / Low | `Jev/Priority/...` label |
| `important` | yes/no | blocks cleanup |
| `needs_reply` | yes/no | `Jev/Needs Reply` label, Reply %, blocks cleanup |
| `junk` | yes/no | cleanup candidate, never acted on alone |

Each result is stored with Jev's confidence per question, keyed by Gmail message
ID, in the extension's IndexedDB. The extension uses IndexedDB rather than
`chrome.storage.local` so that writing one row doesn't rewrite all of them. An
email is only classified again if the rubric changes.

The request (abridged):

```json
POST https://openrouter.ai/api/v1/systemone   (or https://api.typesafe.ai/v1/systemone)
Authorization: Bearer <API key>
{
  "model": "~typesafe/jev-latest",            (TypeSafe: "jev-latest")
  "state": {
    "from_name": "Google Cloud",
    "from_address": "CloudPlatform-noreply@google.com",
    "subject": "[Action Required] Your billing account has been suspended",
    "preview": "We were unable to process your payment…",
    "gmail_tab": "Updates"
  },
  "questions": {
    "category":        { "type": "choice", "instructions": "Which single category…", "criteria": { "Work": "…", "Finance": "…", "Security": "…" } },
    "priority":        { "type": "choice", "instructions": "How soon does the recipient need to act…", "criteria": { "Low": "…", "Normal": "…", "High": "…" } },
    "deceptive":       { "type": "noul", "instructions": "Is this email trying to trick the recipient…" },
    "unsolicited":     { "type": "noul", "instructions": "Is this unsolicited bulk mail…" },
    "official_domain": { "type": "noul", "instructions": "Is the sender's address on an official domain of…" },
    "service_notice":  { "type": "noul", "instructions": "Is this an automated notice about an account… the recipient uses?" },
    "reply":           { "type": "noul", "instructions": "Is a specific person waiting for the recipient to write back?" }
  }
}
```

**Code combines them**, in `compose()` in `src/common/jev.js`, together with two
facts Gmail already knows and Jev cannot see:

- **Did the sender pass DMARC?** Gmail records this in `Authentication-Results`.
  A pass means the From domain really sent the mail.
- **Is it in Gmail's spam folder?**

The rules, all of them readable and unit-tested:

| Rule | Why |
| ---- | --- |
| DMARC pass **and** official domain → scam score drops ~80% | Both together are what clears an alarming but genuine notice |
| Lookalike domain keeps its score even on a DMARC pass | `google-cloud-billing.co` passes DMARC for *its own* domain |
| DMARC fail on an official-looking domain → scam score raised | Someone is forging that brand's address |
| Unsolicited is damped by how much it reads as a service notice | Bulk mail about a service you use is not junk |
| In Gmail's spam folder → at least 90% | Gmail's filter is better than ours |
| `noreply@` → Reply % capped at 3% | Nobody is waiting. `notifications@` is **not** capped: GitHub and Linear turn an emailed reply into a comment |
| Cold outreach damps Reply % | Sales email is written to look like it wants an answer |
| Spam ≥ 50% → Priority forced to Low | Junk never outranks real mail |

Hover the **Spam** cell for the breakdown behind any score:
`scam/phishing 12% · unsolicited 3% · service notice 94% · official domain 97% · sender verified by Gmail`.

Every stored result records which rubric produced it, so changing the questions —
or editing your categories — makes the next run re-score automatically.

What is sent: sender name and address, subject, which Gmail tab the email is
in, and the **first ~4,000 characters of the body** (as plain text). The body is
fetched only while that email is being classified and is never stored. Emails
classified from the Gmail page itself (the overlay) send Gmail's preview line
instead of the body.

Cost: billed by TypeSafe or OpenRouter at Jev's per-token rate (see the
[model page](https://openrouter.ai/typesafe/jev-1.13)). The rubric is about
2,000 input tokens per email. The
running total and elapsed time appear in the status line.

## How the Gmail overlay works

A content script watches Gmail's thread list with a debounced `MutationObserver`,
reads each row, and asks the service worker for a verdict. The worker answers
from IndexedDB, or — when **Classify rows as they appear** is on — sends the
unknown rows to Jev (up to 40 at a time, 4 in flight) and stores the results.

The two views share one store. An email the dashboard fetched is keyed by its
Gmail message id; one the overlay saw first is keyed by `dom:<sender|subject>`.
Both carry a `matchKey` of sender address plus subject, which is the only
identity Gmail's DOM and the Gmail API agree on, so each view recognises what the
other already classified. After an API sync, placeholder rows hand their result
to the real row and delete themselves.

**This part is inherently brittle.** Gmail's class names (`tr.zA`, `span[email]`,
`span.bog`, `td.a4W`) are obfuscated and Google changes them. They have been
stable for years, but when one breaks the overlay renders nothing rather than
damaging the page — it only ever appends one `<span>` per row and never removes
or reorders anything Gmail drew. The selectors are collected in `SEL` at the top
of `src/content/gmail-overlay.js` so there is one place to fix.

Two known limits: the badges reserve 272px at the right of the subject cell, so
long subjects ellipsis earlier than they used to; and two emails with an
identical sender *and* subject (a daily report, say) share one classification.

## Layout

```
manifest.json
src/background/service-worker.js   side panel / dashboard on toolbar click; serves the content script
src/common/auth.js                 Gmail OAuth (chrome.identity), gmail.modify + gmail.labels
src/common/gmail.js                list, metadata, body excerpt, labels, batchModify, trash/untrash; retry/backoff
src/common/labels.js               Jev/... labels: create, plan, batch apply
src/common/cleanup.js              cleanup vetoes, candidates, trash, undo, log
src/common/cleanup-preview.js      the confirm-before-trash checklist (dashboard + panel)
src/common/run-lock.js             one bulk run at a time across pages
src/common/jev.js                  questions, state shaping, Jev HTTP client
src/common/pipeline.js             worker pool: fetch → classify → store
src/common/db.js                   IndexedDB, one record per email
src/common/key.js                  the sender+subject key shared by both views
src/common/settings.js             defaults + chrome.storage.local
src/content/                       the in-Gmail overlay
src/dashboard/                     the table UI and settings
src/panel/                         the side panel
```

Bulk runs (classify, label, clean up) run in the dashboard or side panel page,
never the service worker, and only one at a time across both. The reason for
not using the service worker: MV3 terminates idle workers, and a few thousand emails take
longer than that budget. The page lives as long as its tab does. The overlay's
batches are small enough to serve from the worker.

## Troubleshooting

**"No Google OAuth client ID"** — paste one into Settings → Gmail (step 2
above).

**`redirect_uri_mismatch` from Google** — the client's authorized redirect URI
doesn't match the one shown in Settings. Unpacked extensions get their ID from
the folder's location, so **moving or re-downloading the folder changes the
redirect URL**. Copy the current one from Settings into the client again.

**"Gmail permission denied (403)"** — you unticked a permission on Google's
consent screen, or signed in before this version asked for `gmail.modify`.
Use **Settings → Gmail → Sign out of Gmail**, then sign in again and allow
everything. Also check both scopes are listed on the consent screen.

**"Not signed in to Gmail"** — press **Start** in the dashboard or **Classify inbox** in the side panel to sign in.

**"Access blocked: <app> has not completed the Google verification process"
(Error 403: access_denied)** — the account you're signing in with isn't a test
user of the Google Cloud project. Go to **Google Auth Platform → Audience →
Test users**, add your Gmail address, and sign in again. The name in the error
is the project's consent-screen name, so if it says something unexpected (say,
another app of yours), you reused a project; consider a dedicated "Jev Mail"
project. No Google verification is needed for personal use.

**"Access blocked" or other Gmail authorization failures** — check that the
client type is *Web application* and that your account is listed under the
consent screen's **Test users**. Some managed Workspace accounts block
third-party OAuth clients entirely. If your admin does, the in-Gmail badges
still work, because they don't use OAuth at all.

**Asked to sign in again** — Google's access tokens last an hour. The extension
renews them silently while you're signed in to Google in Chrome. You only see
the popup again if that silent renewal fails, for example after you sign out of
Google.

**429s from Jev** — lower **Parallel requests**. Requests already retry with
exponential backoff, so this only matters when you push concurrency high.

**Badges stopped appearing in Gmail** — most likely Google renamed a class.
Check the `SEL` map in `src/content/gmail-overlay.js` against a row in your
inbox's DOM. Also confirm **Settings → In Gmail** is still enabled.

**Results look wrong for your mail** — rewrite the category descriptions. Jev
scores against the rubric you give it, so `Work: colleagues, clients, projects`
behaves very differently from `Work: anything from an @acme.com address or our
Linear/GitHub notifications`.

## Credits and license

Jev Mail is developed and maintained by **[Kirtan Ugreja](https://github.com/KirtanUgreja)**.
Kirtan added the OpenRouter and TypeSafe provider support, `.env` keys, Gmail
auto-labeling, safe cleanup with Undo, the richer classification and the side
panel.

It started as a fork of [jev-mail by ilyasy](https://github.com/muhammedilyasy/jev-mail),
which provided the original classifier, overlay and dashboard. Released under
the [MIT License](LICENSE); the original copyright notice is kept as the license
requires.

<sub>Keywords: Gmail AI extension, AI email organizer, Gmail auto label, Gmail
cleaner, delete promotional emails, bulk delete Gmail by sender, inbox zero
Chrome extension, email triage, email classifier, spam filter, Brave extension,
OpenRouter, TypeSafe Jev, LLM email sorting, Manifest V3.</sub>
