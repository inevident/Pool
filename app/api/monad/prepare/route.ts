import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { DEMO_SCENARIO_VERSION } from "@/lib/demo/settlement";
import {
  assertRateLimit,
  assertSameOriginJsonAction,
  noStoreHeaders,
  readLimitedJson,
  RequestBoundaryError,
} from "@/lib/agent/http";
import {
  getMonadRegistryAddress,
  getMonadWriteConfiguration,
  MonadRegistryError,
} from "@/lib/monad/server";
import {
  monadTransactionForJson,
  prepareHeroMarketOnMonad,
} from "@/lib/monad/workflow";
import { MONAD_TESTNET, monadExplorerAddressUrl } from "@/lib/monad/registry";
import { canExecuteLiveDemo } from "@/lib/security/demo-access";

export const dynamic = "force-dynamic";

const requestSchema = z
  .object({
    scenarioVersion: z.literal(DEMO_SCENARIO_VERSION),
    confirmation: z.literal("prepare-monad-testnet"),
  })
  .strict();

export async function POST(request: NextRequest) {
  try {
    assertSameOriginJsonAction(request, "prepare-monad");
    assertRateLimit(request, "monad-prepare", { maxRequests: 3, windowMs: 60_000 });
    requestSchema.parse(await readLimitedJson(request, 1_024));

    const configuration = getMonadWriteConfiguration();
    if (!configuration.ready) {
      return NextResponse.json(
        {
          status: "not_configured",
          mode: "local-proof",
          network: {
            name: MONAD_TESTNET.name,
            chainId: MONAD_TESTNET.id,
            testnet: true,
          },
          configuration,
          message:
            "Monad testnet writes are not configured; no onchain transaction was claimed.",
        },
        { headers: noStoreHeaders },
      );
    }
    if (!canExecuteLiveDemo(request)) {
      return NextResponse.json(
        { status: "rejected", message: "Live demo access is locked." },
        { status: 401, headers: noStoreHeaders },
      );
    }

    const result = await prepareHeroMarketOnMonad();
    const { preparation } = result;
    const registryAddress = getMonadRegistryAddress();
    return NextResponse.json(
      {
        status: "prepared",
        mode: "monad-testnet",
        replayed: result.replayed,
        confirmation: "finalized",
        runKey: preparation.runKey,
        preparedAt: preparation.preparedAt,
        network: {
          name: MONAD_TESTNET.name,
          chainId: MONAD_TESTNET.id,
          testnet: true,
        },
        registryAddress,
        registryExplorerUrl: registryAddress
          ? monadExplorerAddressUrl(registryAddress)
          : null,
        commitment: {
          id: preparation.commitmentId,
          poolId: preparation.commitment.poolId,
          termsHash: preparation.commitment.termsHash,
          fundingRoot: preparation.commitment.fundingRoot,
          unitCount: preparation.commitment.unitCount,
          reservedInCents: Number(preparation.commitment.reservedCents),
          bidClosesAt: new Date(
            Number(preparation.commitment.bidClosesAt) * 1_000,
          ).toISOString(),
          offerCount: preparation.commitment.offerHashes.length,
          winningOfferHash: preparation.commitment.winningOfferHash,
          preBidFundingGatePassed:
            preparation.commitment.preBidFundingGatePassed,
        },
        transactions: {
          commitment: monadTransactionForJson(
            preparation.commitmentTransaction,
          ),
          offers: preparation.offerTransactions.map(monadTransactionForJson),
        },
        message:
          "Funded coalition finalized first; every sealed merchant offer now references that Monad commitment.",
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    if (error instanceof RequestBoundaryError) {
      return NextResponse.json(
        { status: "rejected", code: error.code, message: error.message },
        { status: error.status, headers: noStoreHeaders },
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          status: "rejected",
          code: "INVALID_PREPARATION_REQUEST",
          message: "The Monad preparation request was invalid or stale.",
        },
        { status: 400, headers: noStoreHeaders },
      );
    }
    const code =
      error instanceof MonadRegistryError
        ? error.code
        : "MONAD_PREPARATION_FAILED";
    return NextResponse.json(
      {
        status: "failed",
        code,
        message:
          "Monad Testnet could not finalize the pre-bid proof. Seller bidding remains blocked.",
      },
      { status: 502, headers: noStoreHeaders },
    );
  }
}
