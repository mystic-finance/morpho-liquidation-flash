// LiquidationHandler.ts
import {
  ILiquidationHandler,
  LiquidationParams,
} from "./LiquidationHandler.interface";
import { ILiquidator } from "../../typechain";
import { BigNumber, Overrides, Signer } from "ethers";
import { Logger } from "../interfaces/logger";

export interface LiquidatorHandlerOptions {
  stakeTokens: boolean;
  overrides: Overrides;
  maxGasLimit: BigNumber;
  minGasLimit: BigNumber;
}

const defaultOptions: LiquidatorHandlerOptions = {
  stakeTokens: true,
  overrides: { gasLimit: 3_000_000 },
  maxGasLimit: BigNumber.from(5_000_000), // 5M gas
  minGasLimit: BigNumber.from(500_000), // 500k gas
};

export default class LiquidatorHandler implements ILiquidationHandler {
  options: LiquidatorHandlerOptions;

  constructor(
    private liquidator: ILiquidator,
    private signer: Signer,
    private logger: Logger,
    options: Partial<LiquidatorHandlerOptions> = {}
  ) {
    this.options = { ...defaultOptions, ...options };
  }

  async estimateGas({
    poolTokenCollateral,
    poolTokenBorrowed,
    user,
    amount,
    swapPath,
  }: LiquidationParams): Promise<BigNumber> {
    try {
      if (!this.signer) {
        throw new Error("No signer available");
      }

      const gasEstimate = await this.liquidator
        .connect(this.signer)
        .estimateGas.liquidate(
          poolTokenBorrowed,
          poolTokenCollateral,
          user,
          amount,
          this.options.stakeTokens,
          swapPath,
          {} // empty overrides for estimation
        );

      // Add a safety buffer (10%)
      const gasWithBuffer = gasEstimate.mul(110).div(100);

      // Ensure gas estimate is within acceptable range
      if (gasWithBuffer.gt(this.options.maxGasLimit)) {
        this.logger.log(`Gas estimate too high: ${gasWithBuffer.toString()}`);
        return this.options.maxGasLimit;
      }

      if (gasWithBuffer.lt(this.options.minGasLimit)) {
        this.logger.log(`Gas estimate too low: ${gasWithBuffer.toString()}`);
        return this.options.minGasLimit;
      }

      return gasWithBuffer;
    } catch (error) {
      this.logger.error(`Gas estimation failed: ${error}`);
      // Return a conservative estimate if estimation fails
      return BigNumber.from(3_000_000);
    }
  }

  async handleLiquidation({
    poolTokenCollateral,
    poolTokenBorrowed,
    user,
    amount,
    swapPath,
  }: LiquidationParams): Promise<void> {
    if (!this.signer) {
      this.logger.error("No signer available");
      return;
    }

    try {
      // Get gas estimate
      const gasEstimate = await this.estimateGas({
        poolTokenCollateral,
        poolTokenBorrowed,
        user,
        amount,
        swapPath,
      });

      // Update overrides with estimated gas
      const txOverrides = {
        ...this.options.overrides,
        gasLimit: gasEstimate,
      };

      const tx = await this.liquidator
        .connect(this.signer)
        .liquidate(
          poolTokenBorrowed,
          poolTokenCollateral,
          user,
          amount,
          this.options.stakeTokens,
          swapPath,
          txOverrides
        );

      this.logger.log(`Liquidation tx submitted: ${tx.hash}`);

      const receipt = await tx.wait();
      this.logger.log(
        `Liquidation successful. Gas used: ${receipt.gasUsed.toString()}`
      );

      // Log gas efficiency
      const efficiency = receipt.gasUsed.mul(100).div(gasEstimate);
      this.logger.log(`Gas efficiency: ${efficiency}% of estimate used`);
    } catch (error) {
      this.logger.error(`Liquidation failed: ${error}`);
      throw error; // Re-throw to allow caller to handle
    }
  }

  private logError(error: unknown) {
    this.logger.error(error);
    console.error(error);
  }
}
