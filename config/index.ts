import { BigNumber } from "ethers";
import tokens from "./tokens";
export const AVAILABLE_PROTOCOLS = ["aave"];
require("dotenv").config();

const configs: any = {
  1: {
    liquidator: "",
    oracle: "0x65c816077c29b557bee980ae3cc2dce80204a0c5",
    oracleAave: "0xa50ba011c48153de246e5192c8f9258a2ba79ca9",
    morphoCompound: "0x8888882f8f843896699869179fB6E4f7e3B58888",
    pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
    morphoAave: "0x777777c9898d384f785ee44acfe945efdff5f3e0",
    morphoAaveLens: "0x507fa343d0a90786d86c7cd885f5c49263a91ff4",
    addressesProvider: "0xb53c1a33016b2dc2ff3653530bff1848a515c8c5",
    protocolDataProvider: "0x057835Ad21a177dbdd3090bB1CAE03EaCF78Fc6d",
    lens: "0x930f1b46e1d081ec1524efd95752be3ece51ef67",
    univ3Router: "0xe592427a0aece92de3edee1f18e0157c05861564", // https://etherscan.io/address/0xe592427a0aece92de3edee1f18e0157c05861564
    lender: "0xBA12222222228d8Ba445958a75a0704d566BF2C8", // https://etherscan.io/address/0x60744434d6339a6b27d73d9eda62b6f66a0a04fa#code
    slippageTolerance: BigNumber.from("500"), // 5%
    tokens,
    swapFees: {
      exotic: 3000,
      classic: 500,
      stable: 100,
    },
    graphUrl: {
      morphoCompound:
        "https://subgraph.satsuma-prod.com/4e0653cde00f/test-for-bridge--860365/community/compound-v3-ethereum-messari/version/0.0.1/api",
      morphoAave:
        "https://subgraph.satsuma-prod.com/4e0653cde00f/test-for-bridge--860365/aave-v3-ethereum/api",
    },
  },
  161221135: {
    aToken: "0xaf6f5dabc2446de5469d19a19c2f2224729f7e1a",
    liquidator: "",
    oracle: "0x0186033ca9088cd6c1d793bc45b201c6bb21721d",
    oracleAave: "0x0186033ca9088cd6c1d793bc45b201c6bb21721d",
    morphoCompound: "0xe40e9e9a11dfbf488320150360754c8d9df10ef3",
    pool: "0xE55bb0aECBE4ae6BD9643818E4E04183980ef98A",
    morphoAave: "0xE55bb0aECBE4ae6BD9643818E4E04183980ef98A",
    morphoAaveLens: "0xe40e9e9a11dfbf488320150360754c8d9df10ef3",
    addressesProvider: "0x0d8831d23dad4fcd9cb73ab777863e1e6f5c3a9f",
    protocolDataProvider: "0x057835Ad21a177dbdd3090bB1CAE03EaCF78Fc6d",
    lens: "0x057835Ad21a177dbdd3090bB1CAE03EaCF78Fc6d",
    univ3Router: "0xe592427a0aece92de3edee1f18e0157c05861564", // https://etherscan.io/address/0xe592427a0aece92de3edee1f18e0157c05861564
    lender: "0xBA12222222228d8Ba445958a75a0704d566BF2C8", // https://etherscan.io/address/0x60744434d6339a6b27d73d9eda62b6f66a0a04fa#code
    slippageTolerance: BigNumber.from("500"), // 5%
    tokens,
    swapFees: {
      exotic: 3000,
      classic: 500,
      stable: 100,
    },
    graphUrl: {
      morphoCompound:
        "https://subgraph.satsuma-prod.com/4e0653cde00f/test-for-bridge--860365/community/compound-v3-ethereum-messari/version/0.0.1/api",
      morphoAave:
        "https://api.goldsky.com/api/public/project_clv83u9plm0pg01vxaqzzb7br/subgraphs/aave/protocol-v3-v1/gn",
    },
  },
};

export default configs[process.env.CHAIN_ID || 1];
