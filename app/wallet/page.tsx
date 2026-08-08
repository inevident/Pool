import type { Metadata } from "next";

import ProductWorkspaceApp from "../_components/product-workspace";

export const metadata: Metadata = {
  title: "Test balance and activity — POOL",
  description:
    "Inspect POOL's browser-local test balance, reservations, releases, and product activity ledger.",
};

export default function WalletPage() {
  return <ProductWorkspaceApp view="wallet" />;
}
