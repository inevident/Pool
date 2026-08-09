/**
 * POOL popup.
 *
 * Shows whether the current tab's product is on POOL (reading the match the
 * service worker already computed for this tab), and lets the shopper request a
 * product be listed for bulk buying. The POOL address is editable so the same
 * build works against a local dev server or a deployment.
 */

const DEFAULT_POOL_BASE_URL = "http://localhost:3000";

function el(id) {
  return document.getElementById(id);
}

function escapeText(value) {
  const node = document.createElement("span");
  node.textContent = value == null ? "" : String(value);
  return node.innerHTML;
}

function money(cents) {
  return "$" + Math.round((cents || 0) / 100).toLocaleString("en-US");
}

function sendMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response);
      });
    } catch (_error) {
      resolve(null);
    }
  });
}

function activeTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs && tabs[0]));
  });
}

function renderMatch(state, base) {
  const status = el("status");
  const result = state && state.result;

  if (result && result.matched && result.product) {
    const pool = result.pool;
    // Progress toward the viability floor, not toward a cap: once the minimum
    // is met the bar reads full and the pool keeps accepting commitments.
    const pct = pool
      ? Math.min(100, Math.round((pool.committedUnitCount / pool.minimumCommittedUnitCount) * 100))
      : 0;
    const meta = pool
      ? `Group buy forming · ${pool.committedUnitCount} committed · ${pool.minimumCommittedUnitCount} minimum · est. ${money(pool.estimatedUnitPriceCents)}`
      : `On POOL · MSRP ${money(result.product.msrpUnitCents)}`;
    status.innerHTML =
      '<div class="pop-match-kicker">● This is on POOL</div>' +
      '<div class="pop-match-name">' + escapeText(result.product.name) + "</div>" +
      '<div class="pop-match-meta">' + escapeText(meta) + "</div>" +
      (pool ? '<div class="pop-progress"><i style="width:' + pct + '%"></i></div>' : "") +
      '<button class="pop-cta" id="view-pool">' + (pool ? "View this pool" : "Open on POOL") + "</button>";
    const path = pool ? pool.poolPath : "/explore";
    el("view-pool").addEventListener("click", () => {
      chrome.tabs.create({ url: base + path });
    });
  } else {
    status.innerHTML =
      '<div class="pop-nomatch-kicker">Not on POOL yet</div>' +
      '<div class="pop-match-meta" style="margin-top:6px">' +
      escapeText((result && result.reason) || "This product isn't forming a pool.") +
      " Request it below and POOL can open one." +
      "</div>";
  }
}

async function init() {
  const stored = await new Promise((resolve) => chrome.storage.local.get("poolBaseUrl", resolve));
  const base = ((stored && stored.poolBaseUrl) || DEFAULT_POOL_BASE_URL).replace(/\/+$/, "");
  el("base-url").value = base;

  const tab = await activeTab();
  const tabState = tab ? await sendMessage({ type: "POOL_GET_TAB_STATE", tabId: tab.id }) : null;
  const resolvedBase = (tabState && tabState.base) || base;
  const state = tabState && tabState.state;
  renderMatch(state, resolvedBase);

  // Prefill the request form with the current product name.
  const suggested = (state && state.pageTitle) || (tab && tab.title) || "";
  if (suggested) el("product-name").value = suggested.slice(0, 200);
}

el("request-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = el("request-submit");
  const result = el("request-result");
  const productName = el("product-name").value.trim();
  if (productName.length < 2) return;

  submit.disabled = true;
  submit.textContent = "Sending…";
  result.hidden = true;

  const tab = await activeTab();
  const response = await sendMessage({
    type: "POOL_REQUEST_LISTING",
    payload: {
      productName,
      note: el("product-note").value.trim() || undefined,
      url: tab && tab.url,
      sourceSite: tab && tab.url ? new URL(tab.url).host : undefined,
    },
  });

  submit.disabled = false;
  submit.textContent = "Request bulk buying";
  result.hidden = false;

  const body = (response && response.body) || {};
  if (response && response.ok && body.alreadyListed) {
    result.className = "pop-result pop-result-info";
    result.textContent = body.message || "That product is already on POOL.";
  } else if (response && response.ok) {
    result.className = "pop-result pop-result-ok";
    result.textContent =
      (body.message || "Request received.") + (body.requestId ? " (" + body.requestId + ")" : "");
  } else {
    result.className = "pop-result pop-result-err";
    result.textContent = body.message || "Could not reach POOL. Check the address below.";
  }
});

el("save-base").addEventListener("click", () => {
  const value = el("base-url").value.trim().replace(/\/+$/, "") || DEFAULT_POOL_BASE_URL;
  chrome.storage.local.set({ poolBaseUrl: value }, () => {
    const saved = el("base-saved");
    saved.hidden = false;
    setTimeout(() => {
      saved.hidden = true;
    }, 1500);
  });
});

el("open-negotiate").addEventListener("click", async () => {
  const stored = await new Promise((resolve) => chrome.storage.local.get("poolBaseUrl", resolve));
  const base = ((stored && stored.poolBaseUrl) || DEFAULT_POOL_BASE_URL).replace(/\/+$/, "");
  chrome.tabs.create({ url: base + "/negotiate" });
});

init();
