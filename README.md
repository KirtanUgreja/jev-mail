<div align="center">

<img src="icons/icon128.png" width="88" alt="Jev Mail icon" />

# Jev Mail

**AI inbox triage for Gmail: classify, auto-label and safely clean up your inbox.**

A Chrome & Brave extension powered by TypeSafe's **Jev** model, using your own
[OpenRouter](https://openrouter.ai/typesafe/jev-1.13) or [TypeSafe](https://typesafe.ai) key.
No server. Nothing is ever permanently deleted.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-1a73e8)
![Chrome](https://img.shields.io/badge/Chrome-supported-34a853)
![Brave](https://img.shields.io/badge/Brave-supported-fb542b)
![License: MIT](https://img.shields.io/badge/License-MIT-lightgrey)

</div>

---

## ✨ Features

| | |
| --- | --- |
| 🤖 **Classify every email** | Category, priority, important, needs-reply and spam score, in one AI request per email. |
| 🏷️ **Auto-label Gmail** | Sorts mail into `Jev/Work`, `Jev/Finance & Invoices`, `Jev/Priority/High`, `Jev/Needs Reply`… with optional auto-archive. |
| 🧹 **Safe bulk cleanup** | Clear out junk by sender. Always previewed, Trash-only, with one-click **Undo**. Starred and important mail is never touched. |
| 📊 **Side panel & dashboard** | Counts by category and priority, a progress bar, and a sortable, filterable table with CSV export. |
| 👀 **Badges in Gmail** | Category, priority, `!` important, `↩` needs reply and spam % right on your thread list. |
| 🔒 **Private by design** | Runs in your browser. Keys stay local. Only the sender, subject and a body excerpt go to the AI provider. |

```
☆  OpenAI       Review needed: safety identifier activity   Security/Alerts  High    !  ↩    S 20%
☆  Amazon.com   Ordered: 4 Electronics items                Orders/Shipping  Low       R 4%  S 45%
☆  Linear       ENG-2214 assigned to you                    Work             Medium     ↩    S 2%
```

---

## 🚀 Quick start

> Just want badges in Gmail? Steps 1–3 are all you need. No Google Cloud setup.

1. **Get an API key**, ideally a dedicated one with a spending limit:
   [OpenRouter](https://openrouter.ai/settings/keys) or [TypeSafe](https://console.typesafe.ai/).
2. **Load the extension:** open `chrome://extensions` (or `brave://extensions`),
   turn on **Developer mode**, click **Load unpacked** and pick this folder.
3. **Add your key:** click the toolbar icon → **Settings** → paste it →
   **Test** → **Save**. Then open [Gmail](https://mail.google.com/); rows get
   badged as you scroll.

Want labels, cleanup and the side panel? Also do **[Connect Gmail](#-connect-gmail)** below.

<details>
<summary><b>Prefer a <code>.env</code> file for keys?</b></summary>

```bash
cp .env.example .env
```

```ini
OPENROUTER_API_KEY=sk-or-v1-...
TYPESAFE_API_KEY=            # either key works
# JEV_PROVIDER=typesafe      # prefer TypeSafe when both are set
# JEV_MODEL=jev-1.13         # pin a model version
```

Reload the extension after editing. A key typed in Settings overrides `.env`.
With both keys set, OpenRouter is used. `.env` is gitignored, but it is
packaged with the extension, so **never zip or publish the folder with a real
key inside**.

</details>

---

## 🔗 Connect Gmail

Labels, cleanup, the side panel and the dashboard use the Gmail API, which
needs a free Google OAuth client. This takes about 5 minutes and is only done
once.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project
   (e.g. "Jev Mail") and [enable the Gmail API](https://console.cloud.google.com/apis/library/gmail.googleapis.com).
2. **Google Auth Platform → Branding / Audience:** choose *External*, keep it in
   **Testing**, and add your Gmail address under **Test users**.
3. **Data access:** add the scopes `.../auth/gmail.modify` and `.../auth/gmail.labels`.
4. **Clients → Create client → Web application.** Under **Authorized redirect
   URIs**, paste the **Redirect URL** shown in the extension's **Settings → Gmail**
   (it looks like `https://<extension-id>.chromiumapp.org/`).
5. Copy the **Client ID** into **Settings → Gmail → Google OAuth client ID** and save.

That's it: press **Classify inbox** in the side panel (or **Start** in the
dashboard) and approve access.

<details>
<summary><b>Permissions & Google's restricted scope</b></summary>

| Scope | Used for |
| --- | --- |
| `gmail.modify` | read mail, add/remove labels, archive, move to Trash and back |
| `gmail.labels` | create the `Jev/...` labels |

Jev Mail never requests `https://mail.google.com/` (full access), so it
**cannot** delete anything permanently.

`gmail.modify` is a Google **restricted scope**. In **Testing** mode, you and up
to 100 test users can sign in with no review. Publishing publicly requires
Google's OAuth verification and a third-party security assessment.

Sign-in uses `chrome.identity.launchWebAuthFlow` with a *Web application*
client, so it works in Brave as well as Chrome and the client ID lives in
Settings rather than `manifest.json`.

</details>

---

## 🧭 Using it

| Action | What it does |
| --- | --- |
| **Classify inbox** / **Start** | Fetches new mail, classifies it, and applies `Jev/...` labels |
| **Apply labels** | Re-applies labels from stored results (e.g. after changing the threshold) |
| **Clean up (preview)** | Lists junk that is safe to remove. Nothing moves until you confirm |
| **Undo last cleanup** | Restores the last cleanup batch from Trash |
| **Sync** · **Export** | Dashboard only: pull new mail · download the table as CSV |

The **side panel** opens from the toolbar icon. The **dashboard** opens from
the panel's *Dashboard* link and holds all the settings.

### 🏷️ Labels

```
Jev/<Category>                 e.g. Jev/Work, Jev/Finance & Invoices
Jev/Priority/High · Medium · Low
Jev/Needs Reply
Jev/Review                     low-confidence results land here, and only here
```

- Created automatically and applied in batches (`batchModify`, up to 1,000 per call).
- Below the **confidence threshold** (default `0.75`) an email gets only
  `Jev/Review`: no other label, no archiving.
- **Archive after labeling** (off by default) removes the email from the inbox
  for the categories you choose. It stays in All Mail.
- Your own labels are never touched. If an email's category changes, its old
  `Jev/` labels are swapped out.

### 🧹 Cleanup: built never to lose mail you want

- **Preview first.** Candidates are listed with sender, subject, reason and
  confidence. **Nothing is pre-selected.** View **by sender** to approve
  "142 emails from promo@shop.com" with one tick.
- **Trash only.** Gmail empties Trash after 30 days. **Undo** brings the last
  batch back.
- **Only confident junk:** `junk = yes` at or above the **cleanup threshold**
  (default `0.9`).
- **Always protected:**
  - starred and Gmail-important emails
  - emails marked important, needing a reply, or High priority
  - **protected categories** (default *Finance/Invoices*, *Security/Alerts*)
  - **protected senders and domains**
  - anything newer than **7 days**
  - low-confidence results and genuine service notices
- **Re-checked live:** labels are re-read from Gmail right before trashing, so
  an email you starred a minute ago is skipped.
- **Logged locally:** date, sender, subject and message ID. Never bodies.

### ⚙️ Settings

| Setting | Default | Notes |
| --- | --- | --- |
| API keys | — | OpenRouter and/or TypeSafe; Settings or `.env` |
| Model | latest Jev | `jev-1.13` pins a version |
| Categories | 9 built-in | One per line: `Name: what belongs in it`. The description is what Jev scores against, so make it specific. |
| Confidence threshold | `0.75` | Below this → `Jev/Review` only |
| Archive after labeling | off | Per category |
| Cleanup threshold | `0.9` | Minimum junk confidence to be offered |
| Minimum age | `7` days | Newer mail is never offered for cleanup |
| Protected senders | — | `boss@acme.com` or `acme.com` (covers subdomains) |
| Gmail search query | `in:inbox` | Any Gmail search, e.g. `newer_than:30d` |
| Max messages | `500` | `0` = everything the query matches |
| Parallel requests | `6` | Lower it if you hit rate limits |

Default categories: **Work, Personal, Finance/Invoices, Orders/Shipping,
Security/Alerts, Newsletters, Promotions, Social, Spam.**

---

## 🔒 Privacy

- **No backend.** The extension talks only to Gmail and to your AI provider
  (`openrouter.ai` or `api.typesafe.ai`).
- **Sent per email:** sender name and address, subject, Gmail tab, and the first
  ~4,000 characters of the body as plain text. Badges classified straight from
  the Gmail page send Gmail's preview line instead.
- **Stored locally:** results in IndexedDB, settings and keys in
  `chrome.storage.local`. Email bodies are never stored.
- **Cost:** billed by your provider at Jev's per-token rate, a few thousand
  input tokens per email. The dashboard shows a running estimate.

---

## 🧠 How it works

<details>
<summary><b>Narrow questions, combined in code</b></summary>

Jev reads instructions literally and gets worse when one question hides several
judgments. A single "is this spam?" question scored a genuine *"your payment
failed"* notice from Google Cloud **86% spam**. So each email gets narrow
questions in **one request**, and readable rules in `compose()`
(`src/common/jev.js`) combine them with facts Gmail already knows.

| Question | Type | Drives |
| --- | --- | --- |
| `category` | choice | `Jev/<Category>` |
| `priority` | High / Medium / Low | `Jev/Priority/...` |
| `important` | yes/no | protects from cleanup |
| `needs_reply` | yes/no | `Jev/Needs Reply`, Reply % |
| `junk` | yes/no | cleanup candidate (never acted on alone) |
| `deceptive`, `unsolicited`, `official_domain`, `service_notice` | yes/no | Spam % |

| Rule | Why |
| --- | --- |
| DMARC pass **and** official domain → scam score drops ~80% | Clears alarming but genuine notices |
| Lookalike domain keeps its score despite DMARC pass | `google-cloud-billing.co` passes DMARC for *its own* domain |
| DMARC fail on an official-looking domain → score raised | Someone is forging the brand |
| In Gmail's Spam folder → at least 90% | Gmail's filter knows more |
| `noreply@` → Reply % capped at 3% | Nobody is waiting |
| Spam ≥ 50% → priority Low | Junk never outranks real mail |

Hover a **Spam** score to see its breakdown. Results are cached per message and
re-scored only when the questions or your categories change.

```jsonc
POST https://openrouter.ai/api/v1/systemone      // or https://api.typesafe.ai/v1/systemone
{
  "model": "~typesafe/jev-latest",
  "state": {
    "from_name": "Google Cloud",
    "from_address": "CloudPlatform-noreply@google.com",
    "subject": "[Action Required] Your billing account has been suspended",
    "body": "We were unable to process your payment…",
    "gmail_tab": "Updates"
  },
  "questions": {
    "category":    { "type": "choice", "instructions": "Which single category…", "criteria": { "Work": "…", "Finance/Invoices": "…" } },
    "priority":    { "type": "choice", "instructions": "How soon does the recipient need to act…", "criteria": { "Low": {}, "Medium": {}, "High": {} } },
    "important":   { "type": "noul", "instructions": "Is this email important to the recipient personally…" },
    "junk":        { "type": "noul", "instructions": "Is this email safe to clean up…" },
    "needs_reply": { "type": "noul", "instructions": "Does the recipient need to reply…" }
    // + deceptive, unsolicited, official_domain, service_notice
  }
}
```

</details>

<details>
<summary><b>The Gmail overlay</b></summary>

A content script watches Gmail's thread list, reads each row's sender, subject
and preview, and asks the service worker for a verdict, classifying unseen rows
up to 40 at a time. It only ever appends one `<span>` per row and never changes
anything Gmail drew.

Gmail's class names are obfuscated and can change. If badges stop appearing,
update the `SEL` map at the top of `src/content/gmail-overlay.js`. Two emails
with the identical sender *and* subject share one result.

</details>

<details>
<summary><b>Project structure</b></summary>

```
manifest.json
src/
├── background/service-worker.js   side panel, Gmail overlay messaging
├── common/
│   ├── auth.js                    Gmail OAuth (launchWebAuthFlow)
│   ├── gmail.js                   Gmail API: read, labels, batchModify, trash/untrash
│   ├── jev.js                     questions, scoring rules, Jev client
│   ├── labels.js                  Jev/... labels: create, plan, apply
│   ├── cleanup.js                 protections, candidates, trash, undo, log
│   ├── cleanup-preview.js         confirm-before-trash checklist
│   ├── pipeline.js                fetch → classify → store
│   ├── settings.js                defaults, .env, provider selection
│   └── db.js · key.js · run-lock.js
├── content/                       badges inside Gmail
├── dashboard/                     table view and settings
└── panel/                         side panel
```

Bulk runs happen in the side panel or dashboard page, one at a time, rather
than in the MV3 service worker, which is shut down when idle.

</details>

---

## 🛠️ Troubleshooting

<details>
<summary><b>"Access blocked: … has not completed the Google verification process" (403)</b></summary>

Your Gmail address isn't a **test user** of the Google Cloud project. Add it
under **Google Auth Platform → Audience → Test users** and sign in again. If the
app name in the error is unexpected, you reused another project's OAuth client.
A dedicated "Jev Mail" project keeps things clean. No verification is needed
for personal use.

</details>

<details>
<summary><b>"Gmail permission denied (403)"</b></summary>

A permission was unticked on Google's consent screen, or you signed in with an
older version. Use **Settings → Gmail → Sign out of Gmail**, then sign in again
and allow everything. Make sure both scopes are listed under **Data access**.

</details>

<details>
<summary><b><code>redirect_uri_mismatch</code></b></summary>

Moving or re-downloading the folder changes an unpacked extension's ID, and with
it the redirect URL. Copy the current **Redirect URL** from Settings into your
OAuth client again.

</details>

<details>
<summary><b>API key errors: 401 · 402 · 429</b></summary>

- **401:** the key is wrong or revoked. Check Settings or `.env`.
- **402:** out of credits. Top up, or raise the key's spending limit.
- **429:** rate limited. Lower **Parallel requests**. Requests already retry with backoff.

</details>

<details>
<summary><b>Results look wrong for my mail</b></summary>

Rewrite the category descriptions. Jev scores against the rubric you give it, so
`Work: anything from @acme.com or our Linear/GitHub notifications` beats
`Work: work stuff`.

</details>

---

## 📄 License

[MIT](LICENSE). Based on [jev-mail](https://github.com/muhammedilyasy/jev-mail) by ilyasy.

<sub>Gmail AI extension · AI email organizer · Gmail auto label · Gmail cleaner · bulk delete Gmail by sender · inbox zero · email triage · spam filter · OpenRouter · TypeSafe Jev</sub>
