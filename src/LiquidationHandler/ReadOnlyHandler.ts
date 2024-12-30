import {
  ILiquidationHandler,
  LiquidationParams,
} from "./LiquidationHandler.interface";
import { Logger } from "../interfaces/logger";
import { BigNumber } from "ethers";

export default class ReadOnlyHandler implements ILiquidationHandler {
  constructor(private logger: Logger) {}
  async handleLiquidation(): Promise<void> {
    this.logger.log("Read only mode, no liquidation will be performed");
  }

  async estimateGas({
    poolTokenCollateral,
    poolTokenBorrowed,
    user,
    amount,
    swapPath,
  }: LiquidationParams): Promise<BigNumber> {
    return BigNumber.from("10000");
  }
}
