# POOL — five-speaker presentation and recording guide

Live: `https://pool-overnight-yeayea.vercel.app`
Deck: [`POOL_PITCH.pptx`](./POOL_PITCH.pptx) (7 slides)

**Democratize Buying Power.** Volume discounts have always existed. They were just reserved for whoever could commit a warehouse at a time.

> The demo access code is **not in this repository** and must never appear in a slide, a screenshot, or a recording. One person holds it and unlocks the session before anything is filmed.

---

## Before anyone speaks

Run this checklist once. Items 2 and 3 have both bitten us already.

1. **Hard-refresh every browser you will present from.** The seeded catalog version changed; a tab opened earlier shows 5 products instead of 44. `Cmd+Shift+R`.
2. **Unlock provider actions before recording.** Open `/demo`, enter the access code once, and confirm the UI offers **Settle in sandbox** and not only **Run rehearsal**. Every provider path fails closed without that session — which is correct behaviour, and a terrible thing to discover on camera.
3. **Know the Monad line.** After the first settle, `/demo` reports `MONAD_ATTESTATION_FAILED`. That is expected: the attestation for this commitment already exists on chain and the registry refuses duplicate writes. Never call it an error.
4. Tabs open in this order: `/negotiate`, `/demo`, `/evidence`, `/explore`. Keep `/merchant` in a separate Q&A tab.
5. On `/negotiate`, run the negotiation once, confirm it clears at `$700`, then reload so the curve is untouched when you start.
6. Turn on Do Not Disturb. Close Slack, mail, and anything that renders a notification.

---

## Speaker split

Five speakers, roughly one minute each, five to six minutes total. Each section names what is on screen, what to say, and the sentence that hands off.

### Speaker 1 — The premise (0:00–1:00)

**On screen:** Slide 1, then `/` at desktop width.

> "Volume discounts have always existed. They were just reserved for whoever could commit a warehouse at a time. If you are one person buying one laptop, you pay the list price, and the discount goes to whoever was already big.
>
> POOL democratizes that buying power. Buyers who are willing to wait pool their committed demand, and agents take that combined order to merchants. Nobody here is buying in bulk. Together, they are.
>
> Everything you are about to see runs in a sandbox. No real money moves, and we will show you exactly where the boundary is rather than blur it."

**Hand off:** "So how does a group of strangers actually agree on a price? That's the demand curve."

---

### Speaker 2 — The demand curve (1:00–2:00)

**On screen:** Slide 2, then `/negotiate` unclicked.

> "The usual way to run a group buy is to pick one price and hope enough people show up. That throws away information — it hides everyone willing to pay a little more, and everyone who would join a little lower.
>
> On POOL, nobody names one price. Each buyer pledges the *most* they would pay. Three hundred at ten percent off, one hundred eighty at twenty, eighty at thirty."

Click **Close window & send the agents**. Let the transcript run.

> "Our agent walks that curve downward. At every rung it can promise a merchant exactly the volume that unlocks there, and deeper volume unlocks deeper discounts. It stops at the deepest price a merchant will actually honour."

Point to `$700`, 560 buyers, `$168,000`, then the per-tier table.

> "Thirty percent off. And every activated buyer pays that single cleared price — including the three hundred who would happily have paid nine hundred dollars. Merchant floors stayed private the entire time; only public quotes ever left the negotiation."

**Hand off:** "The market cleared. Now the agent has to actually buy it."

---

### Speaker 3 — The agent transacts (2:00–3:00)

**On screen:** `/negotiate`, cleared state.

Click **Send the agent to buy**. Wait for `RAIN SANDBOX · VERIFIED`.

> "The agent just bought it. It minted a Rain scoped card for exactly the cleared price, locked to that merchant's category, then authorized and settled on its own. No human approved that transaction."

Read the card last four and transaction ID from the receipt.

> "The important part is where the authority comes from. The card's limit is the price *the market cleared at* — an outcome the agent derived, not a number a human typed and not a number the browser proposed. The server re-derives the clearing before it will spend a cent. The agent cannot spend a dollar more than the market cleared at, and it cannot spend it anywhere else."

**Hand off:** "A limit only means something if it refuses. Watch it refuse."

---

### Speaker 4 — The guardrail and the proof (3:00–4:15)

**On screen:** `/demo`, then `/evidence#live-verifier`.

Click **Settle in sandbox**. Point to the MCC `7995` decline *before* the settlements.

> "POOL deliberately attempts a blocked merchant category, and Rain returns its exact `scoped_card_mcc_not_allowed` decline. Then the three legitimate allocations settle. Those three transaction IDs are the same ones in our published record — same-day idempotent replay, so no new money moved."

If Monad reads `MONAD_ATTESTATION_FAILED`:

> "The attestation for this commitment already exists on chain from our published run, and the registry refuses duplicate writes. That is the guarantee working: one commitment, one attestation, no rewriting history."

Switch to `/evidence#live-verifier`, click **Run live verification**, wait for 15/15.

> "Don't take our word for it. This reads current Monad Testnet state and recomputes the settlement digest live. On chain 10143, the coalition commitment finalized *before* six offer registrations, and the attestation binds the selected offer to the exact three Rain IDs. It is read-only: no Rain call, no write, no financial authorization."

**Hand off:** "That's the engine. Here's the product it powers."

---

### Speaker 5 — The market and the close (4:15–5:30)

**On screen:** `/explore`, then slide 7.

> "This is the catalog — forty-four group buys, each with a real deadline counting down. That countdown is the product: the price is the reward for being willing to wait."

Optionally show the extension banner on a real product page.

> "We also follow you across the web. Our browser extension matches whatever product page you're on against POOL's catalog and tells you a group buy is already forming, so you never have to remember to check."

Close on slide 7.

> "Twelve units, $5,748 reserved, cleared at $389, and $1,080 handed back. There is no fee in that record. As one unvalidated hypothesis, keeping ten percent of realized savings would be $108 while buyers still keep almost seventeen percent versus list.
>
> We didn't build an AI that shops. We built a market where demand organizes itself — and gave everyone the buying power that used to require a warehouse."

---

## If something breaks

| Symptom | Say this | Then |
| --- | --- | --- |
| `/negotiate` purchase returns `REHEARSAL` | "Live execution is locked in this environment, so this is the labeled rehearsal — no card issued, `$0` moved." | Do not claim a purchase. Move to `/demo`. |
| `/demo` offers only **Run rehearsal** | "This run is the deterministic rehearsal; it creates no provider transaction." | Show the published record at `/evidence` instead. |
| `MONAD_ATTESTATION_FAILED` | Use the duplicate-write line above. | Keep going; it is expected. |
| Verifier returns `degraded` | "The public Monad endpoint is unreachable right now; the static record and explorer links still stand." | Open a Monadscan link. |
| Catalog shows 5 products | Say nothing. | `Cmd+Shift+R`. Stale local state. |

Never say "live" when the UI says rehearsal. Never claim a Rain transaction without a rendered provider ID.

---

## Recording with Screen Studio

### Project setup

- **Canvas:** 1920×1080. Export at 1080p; 4K buys nothing for a screen recording and slows the export.
- **Frame rate:** 60 fps. The countdown ticks every second and the negotiation transcript animates — 30 fps makes both look choppy.
- **Display:** record a single display at 1920×1080, not a scaled 4K panel. Retina downscaling softens small monospace text, and this UI has a lot of it.

### Before you hit record

- New browser window, no other tabs, bookmarks bar hidden (`Cmd+Shift+B`).
- Browser zoom at 100%. The layout is dense; zooming breaks the card grid.
- macOS Do Not Disturb on. One Slack toast ruins a take.
- Hide desktop icons: `defaults write com.apple.finder CreateDesktop false && killall Finder` (restore with `true`).
- **Unlock the demo session first**, off camera. Never film the access code.
- Hard-refresh every tab.

### Screen Studio settings that matter here

- **Automatic zoom: on, but reduce the amount.** The default zoom is aggressive and will chase your cursor around a dense dashboard. Around 1.4× is enough to make the receipt readable without disorienting swoops.
- **Add manual zooms** on exactly three moments: the `$700` cleared price, the Rain receipt's transaction ID, and the verifier's 15/15. Those are the three frames a judge needs to actually read.
- **Cursor smoothing: on. Cursor size: slightly enlarged.** Movement between the sidebar and the cards is long; smoothing keeps it calm.
- **Click highlights: on.** Viewers need to see that a human clicked **Send the agent to buy** and then stopped touching the machine.
- **Background padding: small or none.** A big gradient border shrinks the UI, and this interface is information-dense.
- **Motion blur: off** for text-heavy screens.

### How to record it

Record in five takes, one per speaker, and stitch. A single unbroken take means one fumble costs you everything, and the natural pauses between sections are where you would cut anyway.

1. Take 1 — slide 1 and `/`.
2. Take 2 — `/negotiate` from untouched curve through cleared price. **Let the transcript finish; do not cut it short.** It is the most convincing twenty seconds in the demo.
3. Take 3 — **Send the agent to buy**, hold on the receipt for a full three seconds so the transaction ID is readable when paused.
4. Take 4 — `/demo` settle, MCC decline, then the verifier reaching 15/15. Hold on the check list.
5. Take 5 — `/explore` with the countdowns visible, extension banner if you have it, then slide 7.

### Cutting it

- Trim dead air at the start and end of each take; leave roughly half a second of handle.
- Do **not** speed-ramp the negotiation transcript or the verifier. Both are evidence that something real is computing. Sped up, they read as an animation.
- The countdown ticking is worth one slow moment on `/explore`. It is the single clearest visual for "patience is the product."
- Total target: five to six minutes. Under three minutes means you cut the proof; over eight means you lost the room.

### Before you upload

- Scrub the whole export once at 2× and watch for the access code, `.env.local`, terminal output, or any tab title that leaks a URL you did not intend to publish.
- Confirm every on-screen claim matches what the UI actually said in that frame.
- Export H.264 MP4, 1080p60. Check the file plays with sound somewhere other than your own machine.
