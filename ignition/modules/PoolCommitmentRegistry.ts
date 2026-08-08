import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("PoolCommitmentRegistryModule", (module) => {
  const operator = module.getAccount(0);
  const registry = module.contract("PoolCommitmentRegistry", [operator]);

  return { registry };
});
