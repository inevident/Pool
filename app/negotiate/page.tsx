import type { Metadata } from "next";

import NegotiateExperience from "./negotiate-experience";

export const metadata: Metadata = {
  title: "Agent negotiation — POOL",
  description:
    "Buyers pledge along a demand curve; POOL's agents take it to the merchants and everyone pays the single price the market clears at.",
};

export default function NegotiatePage() {
  return <NegotiateExperience />;
}
