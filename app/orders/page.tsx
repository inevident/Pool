import type { Metadata } from "next";

import ProductWorkspaceApp from "../_components/product-workspace";

export const metadata: Metadata = {
  title: "Commitments and orders — POOL",
  description:
    "Track funded group-buy commitments, exact releases, and the path from buyer demand to fulfillment.",
};

export default function OrdersPage() {
  return <ProductWorkspaceApp view="orders" />;
}
