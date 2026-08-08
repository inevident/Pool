import type { Metadata } from "next";

import ProductWorkspaceApp from "../_components/product-workspace";

export const metadata: Metadata = {
  title: "Discover group buys — POOL",
  description:
    "Browse POOL's sample market of fully committed group buys and review funding, timing, and exit terms.",
};

export default function ExplorePage() {
  return <ProductWorkspaceApp view="explore" />;
}
