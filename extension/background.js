/**
 * POOL extension service worker.
 *
 * The content script tells the worker what product page the shopper is looking
 * at. The worker asks POOL whether that product is forming a group buy, and if
 * so raises a desktop notification and a toolbar badge, and remembers the match
 * so the popup can render it. It also relays "please list this product" requests
 * from the popup to POOL. All network calls go through here so host permissions
 * and notifications live in one place.
 */

const DEFAULT_POOL_BASE_URL = "http://localhost:3000";

/** Per-tab last match, so the popup can read what the badge is about. */
const tabState = new Map();
/** Guard against re-notifying for the same product on the same tab. */
const notifiedByTab = new Map();

async function getPoolBaseUrl() {
  try {
    const stored = await chrome.storage.local.get("poolBaseUrl");
    const value = (stored && stored.poolBaseUrl) || DEFAULT_POOL_BASE_URL;
    return String(value).replace(/\/+$/, "");
  } catch (_error) {
    return DEFAULT_POOL_BASE_URL;
  }
}

async function poolFetch(path, options) {
  const base = await getPoolBaseUrl();
  const response = await fetch(base + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options && options.headers) },
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body, base };
}

async function matchProduct(query) {
  try {
    const { ok, body } = await poolFetch("/api/extension/match", {
      method: "POST",
      body: JSON.stringify({ title: query.title, url: query.url }),
    });
    return ok ? body : { matched: false, reason: "POOL could not be reached." };
  } catch (_error) {
    return { matched: false, reason: "POOL could not be reached.", offline: true };
  }
}

function setBadge(tabId, matched) {
  if (typeof tabId !== "number") return;
  chrome.action.setBadgeText({ tabId, text: matched ? "1" : "" }).catch(() => {});
  if (matched) {
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#c9ff57" }).catch(() => {});
  }
}

async function notifyMatch(tabId, result) {
  if (!result || !result.matched || !result.product) return;
  const productId = result.product.id;
  if (notifiedByTab.get(tabId) === productId) return;
  notifiedByTab.set(tabId, productId);

  const savings = result.pool
    ? `Group buy forming · ${result.pool.committedUnitCount} committed · ${result.pool.minimumCommittedUnitCount} minimum`
    : "Available to pool on POOL";

  chrome.notifications
    .create(`pool-match-${tabId}-${productId}`, {
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "This is on POOL",
      message: `${result.product.name}\n${savings}`,
      priority: 1,
    })
    .catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return false;

  if (message.type === "POOL_MATCH") {
    const tabId = sender.tab && sender.tab.id;
    matchProduct({ title: message.title, url: message.url }).then((result) => {
      if (typeof tabId === "number") {
        tabState.set(tabId, { result, at: Date.now(), pageTitle: message.title, url: message.url });
        setBadge(tabId, Boolean(result.matched));
        if (result.matched) void notifyMatch(tabId, result);
      }
      sendResponse(result);
    });
    return true; // async response
  }

  if (message.type === "POOL_GET_TAB_STATE") {
    const tabId = message.tabId;
    getPoolBaseUrl().then((base) => {
      sendResponse({ base, state: tabState.get(tabId) || null });
    });
    return true;
  }

  if (message.type === "POOL_REQUEST_LISTING") {
    poolFetch("/api/extension/request", {
      method: "POST",
      body: JSON.stringify(message.payload || {}),
    })
      .then(({ ok, body }) => sendResponse({ ok, body }))
      .catch(() => sendResponse({ ok: false, body: { message: "POOL could not be reached." } }));
    return true;
  }

  if (message.type === "POOL_OPEN") {
    getPoolBaseUrl().then((base) => {
      chrome.tabs.create({ url: base + (message.path || "/") }).catch(() => {});
      sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});

// Clicking the notification opens the matching pool on POOL.
chrome.notifications.onClicked.addListener((notificationId) => {
  const match = /^pool-match-(\d+)-/.exec(notificationId);
  if (!match) return;
  const tabId = Number(match[1]);
  const entry = tabState.get(tabId);
  const path = entry && entry.result && entry.result.pool ? entry.result.pool.poolPath : "/explore";
  getPoolBaseUrl().then((base) => {
    chrome.tabs.create({ url: base + path }).catch(() => {});
  });
  chrome.notifications.clear(notificationId).catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabState.delete(tabId);
  notifiedByTab.delete(tabId);
});
