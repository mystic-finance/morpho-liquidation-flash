import { BigNumber, BigNumberish } from "ethers";

export interface LiquidationParams {
  poolTokenBorrowed: string;
  poolTokenCollateral: string;
  underlyingBorrowed?: string;
  user: string;
  amount: BigNumberish;
  swapPath: string;
}

// export interface LiquidationParams {
//   poolTokenCollateral: string;
//   poolTokenBorrowed: string;
//   user: string;
//   amount: BigNumber;
//   swapPath: string; // Will be modified based on swapper requirements
// }

export interface MarketLiquidationParams {
  market: string;
  liquidationBonus: BigNumber;
  totalSupplyBalance: BigNumber;
  totalBorrowBalance: BigNumber;
  price: BigNumber;
  totalSupplyBalanceUSD: BigNumber;
  totalBorrowBalanceUSD: BigNumber;
}
export interface UserLiquidationParams {
  collateralMarket: MarketLiquidationParams;
  debtMarket: MarketLiquidationParams;
  toLiquidate: BigNumber;
  rewardedUSD: BigNumber;
  userAddress: string;
}
export interface ILiquidationHandler {
  handleLiquidation: (liquidation: LiquidationParams) => Promise<void>;
  estimateGas(params: LiquidationParams): Promise<BigNumber>;
}
