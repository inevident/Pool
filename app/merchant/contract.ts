import "server-only";

import { HERO_DEMO, HERO_PRODUCT } from "../../lib/market/index.ts";

export const sellerPilotContract = {
  schemaVersion: 1,
  artifact: {
    kind: "product_integration_artifact",
    label: "Seller pilot sandbox",
    liveRetailerConnected: false,
    tractionClaimed: false,
    binding: false,
    externalWrites: false,
    statement:
      "This contract demonstrates a blinded seller workflow against deterministic fixture demand. It is not merchant validation, a binding bid, or evidence of a live marketplace.",
  },
  rfp: {
    id: HERO_DEMO.fundedCoalition.id,
    version: HERO_DEMO.fundedCoalition.version,
    status: "sandbox_fixture",
    title: "Twelve-unit development display order",
    product: {
      sku: HERO_PRODUCT.sku,
      label: HERO_PRODUCT.displayName,
      publicMsrpUnitCents: HERO_PRODUCT.baselineUnitPriceCents,
      currency: HERO_PRODUCT.currency,
      specifications: {
        formFactor: HERO_PRODUCT.specs.formFactor,
        diagonalInches: HERO_PRODUCT.specs.diagonalInches,
        resolution: HERO_PRODUCT.specs.resolution.label,
        panelTechnology: HERO_PRODUCT.specs.panelTechnology,
        ports: HERO_PRODUCT.specs.ports,
        usbPowerDeliveryWatts: HERO_PRODUCT.specs.usbPowerDeliveryWatts,
        vesaMount: HERO_PRODUCT.specs.vesaMount,
      },
    },
    committedQuantity: HERO_DEMO.fundedCoalition.totalQuantity,
    demandEvidence: {
      kind: "simulated_full_msrp_reservations",
      reservedCents:
        HERO_PRODUCT.baselineUnitPriceCents *
        HERO_DEMO.fundedCoalition.totalQuantity,
      currency: HERO_PRODUCT.currency,
      custodyClaimed: false,
      description:
        "Twelve deterministic fixture units have modeled full-MSRP reservations. No buyer funds are held by this repository.",
    },
    fulfillment: {
      destinationScope: "Three Northeast U.S. fixture destinations",
      destinationCountry: "US",
      deliveryWithinDays: 8,
      minimumWarrantyMonths: 24,
      shippingAssumption: "Included in the submitted unit price for this fixture",
    },
    hiddenFromSeller: [
      "buyer identities",
      "buyer maximum prices",
      "buyer total-spend limits",
      "competing offers",
      "sandbox supplier floor",
    ],
  },
  bidContract: {
    endpoint: "/api/merchant/pilot",
    method: "POST",
    contentType: "application/json",
    actionHeader: {
      name: "X-Pool-Agent-Action",
      value: "evaluate-seller-pilot",
    },
    accepts: [
      "unitPriceCents",
      "deliveryDays",
      "warrantyMonths",
    ],
    serverPinned: [
      "RFP identity and version",
      "committed quantity",
      "prequalified sandbox supplier profile",
      "bid issue and expiry window",
    ],
    responseGuarantees: [
      "No buyer identity or private ceiling",
      "No competing offer or relative rank",
      "No financial authorization",
      "No Rain or Monad contact",
      "No aggregate order",
    ],
  },
} as const;

export type SellerPilotContract = typeof sellerPilotContract;
