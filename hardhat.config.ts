import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

/**
 * Testnet-only by construction. We intentionally provide no Monad mainnet target.
 * Store MONAD_PRIVATE_KEY with `npx hardhat keystore set MONAD_PRIVATE_KEY`.
 */
export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "prague",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
      chainId: 31_337,
    },
    monadTestnet: {
      type: "http",
      chainId: 10_143,
      url: "https://testnet-rpc.monad.xyz",
      accounts: [configVariable("MONAD_PRIVATE_KEY")],
    },
  },
});
