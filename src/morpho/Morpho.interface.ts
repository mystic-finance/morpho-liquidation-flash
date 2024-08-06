import { BigNumber } from "ethers";
import { MorphoAaveV2Lens } from "@morpho-labs/morpho-ethers-contract";
import { MorphoCompoundLens } from "@morpho-labs/morpho-ethers-contract/lib/compound/MorphoCompoundLens";

export interface IMorphoAdapter {
  lens?: MorphoAaveV2Lens | MorphoCompoundLens;
  getMarkets: (markets: string[]) => Promise<any[]>;

  getLiquidationBonus: (market: string) => Promise<BigNumber>;
  getUserHealthFactor: (user: string) => Promise<BigNumber>;
  normalize: (
    market: string,
    balances: BigNumber[]
  ) => Promise<{ price: BigNumber; balances: BigNumber[] }>;

  getCurrentSupplyBalanceInOf(
    market: string,
    userAddress: string
  ): Promise<any>;

  getCurrentBorrowBalanceInOf(
    market: string,
    userAddress: string
  ): Promise<any>;

  getMaxLiquidationAmount: (
    debtMarket: {
      market: string;
      price: BigNumber;
      totalBorrowBalance: BigNumber;
      totalBorrowBalanceUSD: BigNumber;
    },
    collateralMarket: {
      market: string;
      price: BigNumber;
      totalSupplyBalanceUSD: BigNumber;
      liquidationBonus: BigNumber;
    }
  ) => Promise<{ toLiquidate: BigNumber; rewardedUSD: BigNumber }>;

  toUsd: (
    market: string,
    amount: BigNumber,
    price: BigNumber
  ) => Promise<BigNumber>;
}
