# POOL — Group-Buy Price Watcher (Chrome extension)

A Manifest V3 extension that follows you across the web. On any product page it
asks POOL whether that product is forming a group buy. If it is, it raises a
desktop notification and slides in a small banner linking straight to the pool.
If it isn't, the popup lets you **request that product be listed for bulk
buying**.

## What it does

- **Content script** (`content.js`) reads the product identity from every page
  (JSON-LD → OpenGraph → `<title>`) and asks the service worker to match it.
- **Service worker** (`background.js`) calls POOL's public endpoints, shows a
  desktop notification + toolbar badge on a match, and remembers the match per
  tab.
- **Popup** (`popup.html`) shows the current tab's match with a link to the
  pool, and hosts the "request a product" form.

It talks to these POOL endpoints (CORS-enabled, read-only or unauthenticated):

| Endpoint | Purpose |
| --- | --- |
| `POST /api/extension/match` | Match a page title/url to a catalog product + pool |
| `GET /api/extension/catalog` | Public catalog for offline hinting |
| `POST /api/extension/request` | Request a product be listed for bulk buying |

## Load it in Chrome

1. Run POOL locally (`npm run dev`) or note your deployment URL.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select this `extension/` folder.
4. Open the popup and set **POOL address** (defaults to `http://localhost:3000`).

## Try it

Visit any of the seeded products (they match by brand + model tokens):

- MacBook Air 13-inch (M4)
- Sony WH-1000XM6
- Steam Deck OLED 512GB
- Dyson Airwrap i.d.

You'll get a notification + banner. On any other product page, open the popup
and request it for bulk buying.

## Notes

- The POOL address is stored in `chrome.storage.local` so one build works
  against local dev or a deployment.
- No analytics, no tracking, no external hosts — it only talks to the POOL
  address you configure.
- The listing request is acknowledged but not persisted in the sandbox; it's an
  honest receipt, not a promise a catalog team has seen it.
