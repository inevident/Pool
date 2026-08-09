import type { Metadata } from "next";

import ProductWorkspaceApp from "../../_components/product-workspace";

type PoolPageProps = {
  params: Promise<{ poolId: string }>;
};

export const metadata: Metadata = {
  title: "Group-buy terms — POOL",
  description:
    "Review a POOL group buy's full-MSRP reservation, demand progress, price target, and exit cutoff.",
};

export default async function PoolPage({ params }: PoolPageProps) {
  const { poolId } = await params;
  return <ProductWorkspaceApp view="pool" poolId={poolId} />;
}
