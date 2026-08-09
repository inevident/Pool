import type { Metadata } from "next";

import ProductWorkspaceApp from "../_components/product-workspace";

export const metadata: Metadata = {
  title: "POOL Mobile Preview — Coming soon",
  description: "Preview POOL's upcoming mobile experience for discovering, joining, and tracking group buys.",
};

export default function BetaPage() {
  return <ProductWorkspaceApp view="beta" />;
}
