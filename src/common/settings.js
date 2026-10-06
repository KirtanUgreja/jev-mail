// Settings live in chrome.storage.local. API keys come from Settings or from a
// local .env file, and never leave the browser except in the Authorization
// header of a request to the provider they belong to.

// Jev is reachable two ways with the same request format. Model names differ:
// OpenRouter prefixes them with 'typesafe/' ('~' marks a moving alias).
export const PROVIDERS = {
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: '~typesafe/jev-latest',
    keysUrl: 'https://openrouter.ai/settings/keys'
  },
  typesafe: {
    label: 'TypeSafe',
    baseUrl: 'https://api.typesafe.ai/v1',
    defaultModel: 'jev-latest',
    keysUrl: 'https://console.typesafe.ai/'
  }
};

export const DEFAULT_CATEGORIES = [
  { name: 'Work', description: 'Colleagues, clients and partners writing about projects, deliverables or meetings, plus notifications from work tools such as GitHub, Linear, Jira, Slack or Notion. Not money (Finance/Invoices), not account access (Security/Alerts).' },
  { name: 'Personal', description: 'Friends, family and private life: personal messages, plus personal travel bookings and appointments. Nothing to do with work or with selling something.' },
  { name: 'Finance/Invoices', description: 'Money: invoices, receipts, payments taken or failed, payouts, refunds, bank and card activity, subscription charges and renewals, cloud or SaaS bills, budget alerts and tax. Choose this whenever the subject is a charge, bill, refund or payout, even if the sender is a work tool.' },
  { name: 'Orders/Shipping', description: 'Things the recipient bought: order confirmations, shipping and delivery updates, returns and exchanges.' },
  { name: 'Security/Alerts', description: 'Account access and service alerts: sign-in and new-device alerts, verification and two-factor codes, password resets, suspicious activity, API key or permission changes, outages, and warnings that a domain, quota or service is failing. Choose this over every other category when the email is about account access.' },
  { name: 'Newsletters', description: 'Recurring content the recipient subscribed to for its own sake: editorial newsletters, product changelogs, digests and roundups.' },
  { name: 'Promotions', description: 'Anyone selling something: promotions, discounts, product launches, event or webinar promotion, and cold sales outreach, including from companies the recipient already uses. Choose this over Newsletters when the point of the email is to sell.' },
  { name: 'Social', description: 'Social networks and community platforms: mentions, replies, comments, follows, friend requests and forum threads on X, LinkedIn, Instagram, Reddit, Discord and the like.' },
  { name: 'Spam', description: 'Scams, phishing, and junk from senders the recipient has no relationship with: fake invoices, prizes, impersonation of known companies, and unrequested bulk mail.' }
];

// The category list shipped before these defaults. Settings still holding it
// unedited move to the new list; anything the user customised is kept.
const LEGACY_DEFAULT_CATEGORIES_HASH = '1wyhvke';

function hashText(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export const DEFAULTS = {
  // Either key is enough. Empty here means "use the one from .env, if any".
  openrouterApiKey: '',
  typesafeApiKey: '',
  // Empty = the provider's default. Written either way ('jev-1.13' or
  // 'typesafe/jev-1.13'); resolveProvider() adapts it to the provider in use.
  jevModel: '',
  gmailQuery: 'in:inbox',
  maxEmails: 500, // 0 = every message the query matches
  concurrency: 6,
  categories: DEFAULT_CATEGORIES,
  // "Web application" OAuth client from Google Cloud. Only the dashboard needs
  // it; the in-Gmail badges read the page and never touch the Gmail API.
  googleClientId: '',
  // In-Gmail overlay. Works without any Google Cloud setup: the sender, subject
  // and preview line come straight out of Gmail's DOM.
  overlayEnabled: true,
  overlayAutoClassify: true,
  // Labels. Below this confidence an email only gets Jev/Review.
  confidenceThreshold: 0.75,
  // Remove INBOX after labeling, only for the categories listed.
  archiveAfterLabeling: false,
  archiveCategories: []
};

export async function loadSettings() {
  const stored = await chrome.storage.local.get('settings');
  const settings = { ...DEFAULTS, ...(stored.settings || {}) };
  // Older builds stored a single TypeSafe key and endpoint.
  if ('jevApiKey' in settings || 'jevBaseUrl' in settings) {
    if (!settings.typesafeApiKey) settings.typesafeApiKey = String(settings.jevApiKey || '').trim();
    if (settings.jevModel === 'jev-latest') settings.jevModel = '';
    delete settings.jevApiKey;
    delete settings.jevBaseUrl;
    await chrome.storage.local.set({ settings: { ...settings } });
  }
  // Left over from builds that offered a web OAuth flow.
  delete settings.authMode;
  delete settings.webClientId;
  if (
    !Array.isArray(settings.categories) ||
    settings.categories.length < 2 ||
    hashText(JSON.stringify(settings.categories)) === LEGACY_DEFAULT_CATEGORIES_HASH
  ) {
    settings.categories = DEFAULT_CATEGORIES;
  }
  settings.env = await loadEnv();
  return settings;
}

/* ------------------------------------------------------------------ .env */

let envCache = null;

// The .env file sits in the extension folder (gitignored) and is read from the
// extension's own package. A missing file just means no keys from it.
export async function loadEnv() {
  if (envCache) return envCache;
  try {
    const res = await fetch(chrome.runtime.getURL('.env'));
    envCache = res.ok ? parseEnv(await res.text()) : {};
  } catch {
    envCache = {};
  }
  return envCache;
}

export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let value = m[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    out[m[1]] = value.trim();
  }
  return out;
}

/**
 * Which provider to call and with what. A key typed in Settings beats one from
 * .env. With both providers' keys present OpenRouter wins, unless
 * JEV_PROVIDER=typesafe in .env says otherwise. Null when no key is set.
 */
export function resolveProvider(settings) {
  const env = settings.env || {};
  const keys = {
    openrouter: (settings.openrouterApiKey || env.OPENROUTER_API_KEY || '').trim(),
    typesafe: (settings.typesafeApiKey || env.TYPESAFE_API_KEY || '').trim()
  };
  const forced = String(env.JEV_PROVIDER || '').trim().toLowerCase();
  const order = forced === 'typesafe' ? ['typesafe', 'openrouter'] : ['openrouter', 'typesafe'];
  const id = order.find((p) => keys[p]);
  if (!id) return null;

  const provider = PROVIDERS[id];
  return { id, ...provider, apiKey: keys[id], model: modelFor(id, settings.jevModel || env.JEV_MODEL) };
}

function modelFor(id, model) {
  const name = String(model || '').trim();
  if (!name) return PROVIDERS[id].defaultModel;
  const bare = name.replace(/^~?typesafe\//, '');
  if (id === 'typesafe') return bare;
  if (/^~?typesafe\//.test(name)) return name;
  return bare === 'jev-latest' ? '~typesafe/jev-latest' : `typesafe/${bare}`;
}

export async function saveSettings(patch) {
  const current = await loadSettings();
  const next = { ...current, ...patch };
  const { env, ...stored } = next;
  await chrome.storage.local.set({ settings: stored });
  return next;
}
