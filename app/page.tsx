import type { Metadata } from "next";

import ProductWorkspaceApp from "./_components/product-workspace";

export const metadata: Metadata = {
  title: "POOL — Turn patience into bargaining power",
  description:
    "Fund a test balance, declare what you want, and join fully committed group buys in the POOL product sandbox.",
};

export default function ProductHomePage() {
  return <ProductWorkspaceApp view="home" />;
}
