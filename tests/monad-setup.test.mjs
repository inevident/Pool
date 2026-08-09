import assert from "node:assert/strict";
import test from "node:test";

import {
  deploymentFundingFailureMessage,
  deploymentFundingRequirement,
} from "../scripts/monad-setup.mjs";

const GWEI = 1_000_000_000n;
const MON = 1_000_000_000_000_000_000n;

test("Monad setup reports the real deployment reserve before Ignition's opaque HHE10409", () => {
  const requirement = deploymentFundingRequirement({
    gasEstimate: 906_782n,
    baseFeePerGas: 100n * GWEI,
    maxPriorityFeePerGas: 2n * GWEI,
  });

  assert.deepEqual(requirement, {
    gasEstimate: 906_782n,
    maxFeePerGas: 202n * GWEI,
    requiredWei: 183_169_964_000_000_000n,
    recommendedWei: 201_486_960_400_000_000n,
  });

  const message = deploymentFundingFailureMessage({
    address: "0x070dd53f4FdF178E29df30e03FEAD90Cd300e6ed",
    balance: 16n * (MON / 1_000n),
    requirement,
  });

  assert.match(message, /available : 0\.016 MON/);
  assert.match(message, /required  : 0\.183169964 MON/);
  assert.match(message, /fund to   : at least 0\.2014869604 MON/);
  assert.match(message, /906782 gas at a 202 gwei Ignition fee ceiling/);
  assert.match(message, /HHE10409: intrinsic gas greater than limit/);
  assert.doesNotMatch(message, /private.?key/i);
});

test("Monad setup rejects nonsensical gas and fee inputs", () => {
  assert.throws(
    () =>
      deploymentFundingRequirement({
        gasEstimate: 0n,
        baseFeePerGas: 100n * GWEI,
        maxPriorityFeePerGas: 2n * GWEI,
      }),
    /must be positive/,
  );
});
