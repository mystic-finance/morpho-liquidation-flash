import {
  ILiquidationHandler,
  LiquidationParams,
} from "./LiquidationHandler.interface";
import {
  ERC20__factory,
  MorphoAaveV2,
  MorphoCompound,
} from "@morpho-labs/morpho-ethers-contract";
import {
  BigNumber,
  BigNumberish,
  constants,
  ethers,
  Overrides,
  Signer,
} from "ethers";
import { Logger } from "../interfaces/logger";

export interface EOAHandlerOptions {
  overrides: Overrides;
  checkAllowance: boolean;
  checkBalance: boolean;
  approveMax: boolean;
  maxGasLimit: BigNumber;
  minGasLimit: BigNumber;
  gasBufferPercent: number; // Percentage to add to gas estimates
}

export const defaultOptions: EOAHandlerOptions = {
  overrides: { gasLimit: 3_000_000 },
  checkAllowance: true,
  checkBalance: true,
  approveMax: true,
  maxGasLimit: BigNumber.from(5_000_000), // 5M gas
  minGasLimit: BigNumber.from(500_000), // 500k gas
  gasBufferPercent: 10, // 10% buffer
};

// A list of tokens that need to approve zero before to increase the allowance
const APPROVE_ZERO_TOKENS = ["0x0000000000000000000000000000000000000000"];

export default class EOAHandler implements ILiquidationHandler {
  options: EOAHandlerOptions;

  constructor(
    private readonly morpho: ethers.Contract,
    private readonly signer: Signer,
    private readonly logger: Logger,
    options: Partial<EOAHandlerOptions> = {}
  ) {
    this.options = { ...defaultOptions, ...options };
  }

  public async estimateGas(params: LiquidationParams): Promise<BigNumber> {
    try {
      let totalGasEstimate = BigNumber.from(0);

      // Estimate gas for potential approval transactions
      if (this.options.checkAllowance) {
        const approvalGas = await this._estimateApprovalGas(
          params.underlyingBorrowed as string,
          params.amount
        );
        totalGasEstimate = totalGasEstimate.add(approvalGas);
      }

      // Estimate gas for the liquidation transaction
      const liquidationGas = await this._estimateLiquidationGas(params);
      totalGasEstimate = totalGasEstimate.add(liquidationGas);

      // Add buffer
      const gasWithBuffer = totalGasEstimate
        .mul(100 + this.options.gasBufferPercent)
        .div(100);

      // Enforce limits
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

  public async handleLiquidation(params: LiquidationParams): Promise<void> {
    const {
      user,
      poolTokenBorrowed,
      poolTokenCollateral,
      amount,
      underlyingBorrowed,
    } = params;

    try {
      // Check balance if enabled
      if (this.options.checkBalance) {
        await this._checkBalance(underlyingBorrowed as string, amount);
      }

      // Handle allowance if enabled
      if (this.options.checkAllowance) {
        await this._handleAllowance(underlyingBorrowed as string, amount);
      }

      // Get gas estimate for liquidation
      const gasEstimate = await this.estimateGas(params);

      // Update overrides with estimated gas
      const txOverrides = {
        ...this.options.overrides,
        gasLimit: gasEstimate,
      };

      // Execute liquidation
      const tx = await this.morpho
        .connect(this.signer)
        .liquidationCall(
          poolTokenCollateral,
          poolTokenBorrowed,
          user,
          amount,
          false,
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
      throw error;
    }
  }

  private async _estimateApprovalGas(
    token: string,
    amount: BigNumberish
  ): Promise<BigNumber> {
    const erc20 = ERC20__factory.connect(token, this.signer);
    const allowance = await erc20.allowance(
      await this.signer.getAddress(),
      this.morpho.address
    );

    if (allowance.lt(amount)) {
      let totalGas = BigNumber.from(0);

      // Estimate gas for zero approval if needed
      if (APPROVE_ZERO_TOKENS.includes(token.toLowerCase())) {
        const zeroApprovalGas = await erc20.estimateGas.approve(
          this.morpho.address,
          0
        );
        totalGas = totalGas.add(zeroApprovalGas);
      }

      // Estimate gas for actual approval
      const approvalGas = await erc20.estimateGas.approve(
        this.morpho.address,
        this.options.approveMax ? constants.MaxUint256 : amount
      );
      totalGas = totalGas.add(approvalGas);

      return totalGas;
    }

    return BigNumber.from(0);
  }

  private async _estimateLiquidationGas(
    params: LiquidationParams
  ): Promise<BigNumber> {
    const { user, poolTokenBorrowed, poolTokenCollateral, amount } = params;

    return this.morpho
      .connect(this.signer)
      .estimateGas.liquidationCall(
        poolTokenCollateral,
        poolTokenBorrowed,
        user,
        amount,
        false
      );
  }

  private async _handleAllowance(
    token: string,
    amount: BigNumberish
  ): Promise<void> {
    token = token.toLowerCase();
    const erc20 = ERC20__factory.connect(token, this.signer);
    const allowance = await erc20.allowance(
      await this.signer.getAddress(),
      this.morpho.address
    );

    if (allowance.lt(amount)) {
      this.logger.log(`Increasing allowance for ${token}`);

      // Handle zero approval if needed
      if (APPROVE_ZERO_TOKENS.includes(token)) {
        const zeroTx = await erc20.approve(this.morpho.address, 0);
        await zeroTx.wait();
        this.logger.log(`Zero approval completed for ${token}`);
      }

      // Perform actual approval
      const approveTx = await erc20.approve(
        this.morpho.address,
        this.options.approveMax ? constants.MaxUint256 : amount
      );
      await approveTx.wait();
      this.logger.log(`Allowance updated for ${token}`);
    }
  }

  private async _checkBalance(
    underlyingBorrowed: string,
    amount: BigNumberish
  ): Promise<void> {
    const erc20 = ERC20__factory.connect(underlyingBorrowed, this.signer);
    const balance = await erc20.balanceOf(await this.signer.getAddress());
    if (balance.lt(amount)) {
      throw new Error(
        `Insufficient balance. Required: ${amount.toString()}, Available: ${balance.toString()}`
      );
    }
  }
}
