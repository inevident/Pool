import type { Metadata } from "next";

import DemoExperience from "./demo-experience";

export const metadata: Metadata = {
  title: "Live market walkthrough — POOL",
  description:
    "Replay POOL's prefunded group-buy market, merchant competition, Rain sandbox settlement, and Monad commitment flow.",
};

export default function DemoPage() {
  return <DemoExperience />;
}
