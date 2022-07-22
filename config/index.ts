export default {
  morpho: "0x8888882f8f843896699869179fB6E4f7e3B58888",
  lens: "0x930f1b46e1d081ec1524efd95752be3ece51ef67",
  univ3Router: "0xe592427a0aece92de3edee1f18e0157c05861564", // https://etherscan.io/address/0xe592427a0aece92de3edee1f18e0157c05861564
  lender: "0x1EB4CF3A948E7D72A198fe073cCb8C7a948cD853", // https://etherscan.io/address/0x1EB4CF3A948E7D72A198fe073cCb8C7a948cD853#code
  slippageTolerance: 100, // 1%
  tokens: {
    dai: {
      address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      cToken: "0x5d3a536E4D6DbD6114cc1Ead35777bAB948E3643",
      balanceOfStorageSlot: 2,
      decimals: 18,
    },
    usdc: {
      address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      cToken: "0x39aa39c021dfbae8fac545936693ac917d5e7563",
      balanceOfStorageSlot: 9,
      decimals: 6,
    },
    usdt: {
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      cToken: "0xf650c3d88d12db855b8bf7d11be6c55a4e07dcc9",
      balanceOfStorageSlot: 2,
      decimals: 6,
    },
    fei: {
      address: "0x956f47f50a910163d8bf957cf5846d573e7f87ca",
      cToken: "0x7713DD9Ca933848F6819F38B8352D9A15EA73F67",
      balanceOfStorageSlot: 0,
      decimals: 18,
    },
    wEth: {
      address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      cToken: "0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5",
      decimals: 18,
      balanceOfStorageSlot: 3,
    },
  },
  swapFees: {
    exotic: 3000,
    classic: 500,
    stable: 100,
  },
};
