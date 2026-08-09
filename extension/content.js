/**
 * POOL content script — runs on every page the shopper opens.
 *
 * It reads the product identity from the page (structured data first, then
 * OpenGraph, then the title), asks the service worker whether POOL is forming a
 * group buy for it, and if so slides in a small, dismissible banner with a link
 * to the pool. It never blocks the page, never opens dialogs, and shows a given
 * product's banner at most once per tab session.
 */

(function () {
  if (window.top !== window) return; // top frame only
  if (window.__poolContentLoaded) return;
  window.__poolContentLoaded = true;

  function metaContent(selectors) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      const value = el && (el.getAttribute("content") || el.getAttribute("value"));
      if (value && value.trim()) return value.trim();
    }
    return null;
  }

  function fromJsonLd() {
    const blocks = document.querySelectorAll('script[type="application/ld+json"]');
    for (const block of blocks) {
      let data;
      try {
        data = JSON.parse(block.textContent || "");
      } catch (_error) {
        continue;
      }
      const nodes = Array.isArray(data) ? data : data && data["@graph"] ? data["@graph"] : [data];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const type = node["@type"];
        const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
        if (isProduct && typeof node.name === "string") return node.name.trim();
      }
    }
    return null;
  }

  function productTitle() {
    return (
      fromJsonLd() ||
      metaContent(['meta[property="og:title"]', 'meta[name="twitter:title"]']) ||
      (document.title || "").trim()
    );
  }

  const title = productTitle();
  if (!title || title.length < 3) return;

  const sessionKey = "__pool_dismissed_" + location.host;

  function alreadyDismissed(productId) {
    try {
      return sessionStorage.getItem(sessionKey) === productId;
    } catch (_error) {
      return false;
    }
  }

  function rememberDismissed(productId) {
    try {
      sessionStorage.setItem(sessionKey, productId);
    } catch (_error) {
      /* ignore */
    }
  }

  function money(cents) {
    return "$" + Math.round(cents / 100).toLocaleString("en-US");
  }

  function showBanner(result, base) {
    if (!result || !result.matched || !result.product) return;
    if (alreadyDismissed(result.product.id)) return;
    if (document.getElementById("pool-banner")) return;

    const pool = result.pool;
    const host = document.createElement("div");
    host.id = "pool-banner";
    host.setAttribute("role", "status");

    const priceLine = pool
      ? `Group buy forming · ${pool.committedUnitCount}/${pool.targetMemberCount} committed · est. ${money(pool.estimatedUnitPriceCents)}`
      : `On POOL · MSRP ${money(result.product.msrpUnitCents)}`;

    host.innerHTML =
      '<div class="pool-banner-mark" aria-hidden="true"><span></span><span></span><span></span></div>' +
      '<div class="pool-banner-body">' +
      '<strong>This is on POOL</strong>' +
      '<span>' + escapeHtml(result.product.name) + '</span>' +
      '<small>' + escapeHtml(priceLine) + '</small>' +
      '</div>' +
      '<button class="pool-banner-cta" type="button">' + (pool ? "View pool" : "Open POOL") + "</button>" +
      '<button class="pool-banner-close" type="button" aria-label="Dismiss">×</button>';

    const path = pool ? pool.poolPath : "/explore";
    host.querySelector(".pool-banner-cta").addEventListener("click", function () {
      window.open(base + path, "_blank", "noopener");
    });
    host.querySelector(".pool-banner-close").addEventListener("click", function () {
      rememberDismissed(result.product.id);
      host.remove();
    });

    document.body.appendChild(host);
    requestAnimationFrame(function () {
      host.classList.add("pool-banner-in");
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character];
    });
  }

  try {
    chrome.runtime.sendMessage({ type: "POOL_MATCH", title: title, url: location.href }, function (result) {
      if (chrome.runtime.lastError || !result) return;
      chrome.runtime.sendMessage({ type: "POOL_GET_TAB_STATE", tabId: -1 }, function () {
        // Base URL is echoed on POOL_GET_TAB_STATE; fetch it once for the CTA link.
      });
      // The service worker already knows the base URL; ask it to resolve links.
      chrome.storage.local.get("poolBaseUrl", function (stored) {
        const base = ((stored && stored.poolBaseUrl) || "http://localhost:3000").replace(/\/+$/, "");
        showBanner(result, base);
      });
    });
  } catch (_error) {
    /* extension context invalidated — ignore */
  }
})();
