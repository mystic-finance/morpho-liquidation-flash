import { BigNumber, providers, Contract } from "ethers";
import { Logger } from "./interfaces/logger";
import { IAaveFetcher, IFetcher } from "./interfaces/IFetcher";
import { formatUnits, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { IMorphoAdapter } from "./morpho/Morpho.interface";
import {
  ILiquidationHandler,
  LiquidationParams,
  UserLiquidationParams,
} from "./LiquidationHandler/LiquidationHandler.interface";
import { PercentMath } from "@morpho-labs/ethers-utils/lib/maths";
import config from "../config";

// Ambient SwapController interface
interface ISwapController {
  swap(
    tokenIn: string,
    tokenOut: string,
    amountIn: BigNumber,
    amountOutMinimum: BigNumber,
    poolFee: number
  ): Promise<BigNumber>;

  getQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: BigNumber,
    poolFee: number
  ): Promise<BigNumber>;
}

export interface LiquidationBotSettings {
  profitableThresholdUSD: BigNumber;
  batchSize: number;
  minHealthFactor: BigNumber;
  maxHealthFactor: BigNumber;
  gasPrice: BigNumber;
  slippageTolerance: number; // e.g., 0.005 for 0.5%
  defaultPoolFee: number; // e.g., 3000 for 0.3%
}

const defaultSettings: LiquidationBotSettings = {
  profitableThresholdUSD: parseUnits("1"),
  batchSize: 15,
  minHealthFactor: parseUnits("0.01"),
  maxHealthFactor: parseUnits("1"),
  gasPrice: parseUnits("50", "gwei"),
  slippageTolerance: 0.005, // 0.5%
  defaultPoolFee: 3000, // 0.3%
};

export default class LiquidationBot {
  private swapController: Contract;
  private markets: string[] = [];
  static readonly HF_THRESHOLD = parseUnits("1");
  settings: LiquidationBotSettings = defaultSettings;
  constructor(
    public readonly logger: Logger,
    public readonly fetcher: IFetcher,
    public readonly provider: providers.Provider,
    public readonly liquidationHandler: ILiquidationHandler,
    public readonly adapter: IMorphoAdapter,
    public readonly swapControllerAddress: string,
    settings: Partial<LiquidationBotSettings> = {}
  ) {
    this.settings = { ...defaultSettings, ...settings };

    // Initialize SwapController contract
    const swapControllerAbi = [
      "function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMinimum, uint24 poolFee) external returns (uint256)",
      "function getQuote(address tokenIn, address tokenOut, uint256 amountIn, uint24 poolFee) external view returns (uint256)",
    ];
    this.swapController = new Contract(
      swapControllerAddress,
      swapControllerAbi,
      provider
    );
  }

  async computeLiquidableUsers() {
    let lastId = "";
    let hasMore = true;
    let liquidableUsers: { address: string; hf: BigNumber }[] = [];

    while (hasMore) {
      const {
        hasMore: more,
        lastId: newLastId,
        users,
      } = await this.fetcher.fetchUsers(lastId);
      hasMore = more;
      lastId = newLastId;

      this.logger.log(`Fetched ${users.length} users`);

      const newLiquidatableUsers = await Promise.all(
        users.map(async (userAddress) => ({
          address: userAddress,
          hf: await this.adapter.getUserHealthFactor(userAddress),
        }))
      );

      const filteredUsers = newLiquidatableUsers.filter((userHf) => {
        const isLiquidatable =
          userHf.hf.lt(this.settings.maxHealthFactor) &&
          userHf.hf.gt(this.settings.minHealthFactor);

        if (isLiquidatable) {
          this.logger.log(
            `User ${userHf.address} has HF: ${formatUnits(userHf.hf)}`
          );
        }
        return isLiquidatable;
      });

      liquidableUsers = [...liquidableUsers, ...filteredUsers];
      await this.delay(100);
    }

    return liquidableUsers;
  }

  private async computeMarkets() {
    const markets = await this.fetcher.fetchMarkets?.();
    this.logger.log(`${markets?.markets?.length} markets fetched`);
    return (markets?.markets as string[]) || [];
  }

  private async getExpectedOutput(
    tokenIn: string,
    tokenOut: string,
    amountIn: BigNumber
  ): Promise<BigNumber> {
    try {
      return await this.swapController.getQuote(
        tokenIn,
        tokenOut,
        amountIn,
        this.settings.defaultPoolFee
      );
    } catch (error) {
      this.logError(`Failed to get quote: ${error}`);
      return BigNumber.from(0);
    }
  }

  private calculateMinimumOutput(expectedOutput: BigNumber): BigNumber {
    return expectedOutput
      .mul(
        BigNumber.from(
          Math.floor((1 - this.settings.slippageTolerance) * 10000)
        )
      )
      .div(10000);
  }

  async getUserLiquidationParams(userAddress: string, markets: string[] = []) {
    // first fetch all user balances

    const balances = await Promise.all(
      markets.map(async (market) => {
        const [
          { totalBalance: totalSupplyBalance },
          { totalBalance: totalBorrowBalance },
        ] = await Promise.all([
          this.adapter.getCurrentSupplyBalanceInOf(market, userAddress),
          this.adapter.getCurrentBorrowBalanceInOf(market, userAddress),
        ]);

        const {
          price,
          balances: [totalSupplyBalanceUSD, totalBorrowBalanceUSD],
        } = await this.adapter.normalize(market, [
          totalSupplyBalance,
          totalBorrowBalance,
        ]);
        const liquidationBonus = await this.adapter.getLiquidationBonus(market);
        return {
          market,
          liquidationBonus,
          totalSupplyBalance,
          totalBorrowBalance,
          price,
          totalSupplyBalanceUSD,
          totalBorrowBalanceUSD,
        };
      })
    );
    const [debtMarket] = balances.sort((a, b) =>
      a.totalBorrowBalanceUSD.gt(b.totalBorrowBalanceUSD) ? -1 : 1
    );
    const [collateralMarket] = balances
      .filter((b) => b.liquidationBonus.gt(0))
      .sort((a, b) =>
        a.totalSupplyBalanceUSD.gt(b.totalSupplyBalanceUSD) ? -1 : 1
      );
    this.logger.table({
      user: userAddress,
      debt: {
        market: debtMarket.market,
        totalBorrowBalanceUSD: formatUnits(debtMarket.totalBorrowBalanceUSD),
        price: formatUnits(debtMarket.price),
        totalSupplyBalanceUSD: formatUnits(debtMarket.totalSupplyBalanceUSD),
      },
      collateral: {
        market: collateralMarket.market,
        totalBorrowBalanceUSD: formatUnits(
          collateralMarket.totalBorrowBalanceUSD
        ),
        price: formatUnits(collateralMarket.price),
        totalSupplyBalanceUSD: formatUnits(
          collateralMarket.totalSupplyBalanceUSD
        ),
      },
    });
    const { toLiquidate, rewardedUSD } =
      await this.adapter.getMaxLiquidationAmount(debtMarket, collateralMarket);
    return {
      collateralMarket,
      debtMarket,
      toLiquidate,
      rewardedUSD,
      userAddress,
    };
  }

  getPath(borrowMarket: string, collateralMarket: string) {
    borrowMarket = borrowMarket.toLowerCase();
    collateralMarket = collateralMarket.toLowerCase();
    if (borrowMarket === collateralMarket) return "0x";
    return ethers.utils.solidityPack(
      ["address", "uint24", "address"],
      [borrowMarket, collateralMarket, config.swapFees.classic]
    );
  }

  // async checkPoolLiquidity(borrowMarket: string, collateralMarket: string) {
  //   borrowMarket = borrowMarket.toLowerCase();
  //   collateralMarket = collateralMarket.toLowerCase();
  //   let pools: UniswapPool[][] = [];
  //   if (
  //     stablecoins.includes(borrowMarket) &&
  //     stablecoins.includes(collateralMarket)
  //   ) {
  //     const data = await getPoolData(
  //       underlyings[borrowMarket],
  //       underlyings[collateralMarket]
  //     );
  //     pools.push(data);
  //   } else if (
  //     [underlyings[borrowMarket], underlyings[collateralMarket]].includes(
  //       LiquidationBot.W_ETH
  //     )
  //   ) {
  //     const data = await getPoolData(
  //       underlyings[borrowMarket],
  //       underlyings[collateralMarket]
  //     );
  //     pools.push(data);
  //   } else {
  //     const newPools = await Promise.all([
  //       getPoolData(underlyings[borrowMarket], LiquidationBot.W_ETH),
  //       getPoolData(underlyings[collateralMarket], LiquidationBot.W_ETH),
  //     ]);
  //     pools = [...pools, ...newPools];
  //   }
  //   console.log(JSON.stringify(pools, null, 4));
  //   return pools;
  // }

  async run() {
    try {
      const users = await this.computeLiquidableUsers();
      this.logger.log(`Found ${users.length} liquidatable users`);

      const markets = await this.computeMarkets();
      const liquidationPromises = [];

      for (let i = 0; i < users.length; i += this.settings.batchSize) {
        const batch = users.slice(i, i + this.settings.batchSize);
        const batchPromises = batch.map(async (user) => {
          try {
            const liquidationParams = await this.getUserLiquidationParams(
              user.address,
              markets
            );
            if (await this.isLiquidationProfitable(liquidationParams)) {
              return this.executeLiquidation(liquidationParams);
            }
          } catch (error) {
            this.logError(error);
            return null;
          }
        });

        liquidationPromises.push(...batchPromises);
      }

      await Promise.all(liquidationPromises);
    } catch (error) {
      this.logError(error);
    }
  }

  private async isLiquidationProfitable(
    params: UserLiquidationParams
  ): Promise<boolean> {
    const gasEstimate = await this.estimateGas(params);
    const gasCost = gasEstimate.mul(this.settings.gasPrice);

    const expectedProfit = await this.calculateExpectedProfit(params);
    return expectedProfit.gt(gasCost.add(this.settings.profitableThresholdUSD));
  }

  private async estimateGas(params: UserLiquidationParams): Promise<BigNumber> {
    try {
      const swapPath = this.getPath(
        params.debtMarket.market,
        params.collateralMarket.market
      );

      const liquidationParams: LiquidationParams = {
        poolTokenBorrowed: params.debtMarket.market,
        poolTokenCollateral: params.collateralMarket.market,
        underlyingBorrowed: params.debtMarket.market,
        user: params.userAddress,
        amount: params.toLiquidate,
        swapPath,
      };

      return await this.liquidationHandler.estimateGas(liquidationParams);
    } catch {
      return BigNumber.from(500000); // fallback estimate
    }
  }

  private async calculateExpectedProfit(
    params: UserLiquidationParams
  ): Promise<BigNumber> {
    const { debtMarket, collateralMarket, toLiquidate } = params;

    // Get expected output from swap
    const expectedOutput = await this.getExpectedOutput(
      debtMarket.market,
      collateralMarket.market,
      toLiquidate
    );

    // Calculate profit considering liquidation bonus
    const liquidationBonus = await this.adapter.getLiquidationBonus(
      collateralMarket.market
    );
    const debtValue = await this.adapter.toUsd(
      debtMarket.market,
      toLiquidate,
      debtMarket.price
    );

    return PercentMath.percentMul(
      debtValue,
      liquidationBonus.sub(PercentMath.BASE_PERCENT)
    );
  }

  private async executeLiquidation(params: UserLiquidationParams) {
    const expectedOutput = await this.getExpectedOutput(
      params.debtMarket.market,
      params.collateralMarket.market,
      params.toLiquidate
    );

    const minimumOutput = this.calculateMinimumOutput(expectedOutput);
    const swapPath = this.getPath(
      params.debtMarket.market,
      params.collateralMarket.market
    );

    const liquidationParams: LiquidationParams = {
      poolTokenBorrowed: params.debtMarket.market,
      poolTokenCollateral: params.collateralMarket.market,
      underlyingBorrowed: params.debtMarket.market,
      user: params.userAddress,
      amount: params.toLiquidate,
      swapPath,
    };

    return this.liquidationHandler.handleLiquidation(liquidationParams);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private logError(error: unknown) {
    console.error(error);
    this.logger.log(error);
  }
}

// import { BigNumber, providers } from "ethers";
// import { Logger } from "./interfaces/logger";
// import { IAaveFetcher, IFetcher } from "./interfaces/IFetcher";
// import { formatUnits, parseUnits } from "ethers/lib/utils";
// import { ethers } from "hardhat";
// import config from "../config";
// import { getPoolData, UniswapPool } from "./uniswap/pools";
// import { IMorphoAdapter } from "./morpho/Morpho.interface";
// import {
//   ILiquidationHandler,
//   LiquidationParams,
//   UserLiquidationParams,
// } from "./LiquidationHandler/LiquidationHandler.interface";
// import { PercentMath } from "@morpho-labs/ethers-utils/lib/maths";

// // Configuration interfaces
// interface TokenConfig {
//   address: string;
//   decimals: number;
//   isStablecoin: boolean;
// }

// interface PoolConfig {
//   fee: number;
//   minLiquidity: BigNumber;
// }

// export interface LiquidationBotSettings {
//   profitableThresholdUSD: BigNumber;
//   batchSize: number;
//   minHealthFactor: BigNumber;
//   maxHealthFactor: BigNumber;
//   gasPrice: BigNumber;
// }

// const defaultSettings: LiquidationBotSettings = {
//   profitableThresholdUSD: parseUnits("1"),
//   batchSize: 15,
//   minHealthFactor: parseUnits("0.01"),
//   maxHealthFactor: parseUnits("1"),
//   gasPrice: parseUnits("50", "gwei"),
// };

// export default class LiquidationBot {
//   private tokenList: Map<string, TokenConfig> = new Map();
//   private poolConfigs: Map<string, PoolConfig> = new Map();
//   private markets: string[] = [];
//   static readonly HF_THRESHOLD = parseUnits("1");
//   settings: LiquidationBotSettings = defaultSettings;
//   constructor(
//     public readonly logger: Logger,
//     public readonly fetcher: IFetcher,
//     public readonly provider: providers.Provider,
//     public readonly liquidationHandler: ILiquidationHandler,
//     public readonly adapter: IMorphoAdapter,
//     settings: Partial<LiquidationBotSettings> = {}
//   ) {
//     this.settings = { ...defaultSettings, ...settings };
//   }

//   // Initialize token configurations
//   async initializeTokens() {
//     const markets = await this.computeMarkets();
//     for (const market of markets) {
//       const tokenData = await this.adapter.getTokenData(market);
//       this.tokenList.set(market.toLowerCase(), {
//         address: tokenData.address,
//         decimals: tokenData.decimals,
//         isStablecoin: tokenData.isStablecoin,
//       });
//     }
//   }

//   private async computeLiquidableUsers() {
//     let lastId = "";
//     let hasMore = true;
//     let liquidableUsers: { address: string; hf: BigNumber }[] = [];

//     while (hasMore) {
//       const {
//         hasMore: more,
//         lastId: newLastId,
//         users,
//       } = await this.fetcher.fetchUsers(lastId);
//       hasMore = more;
//       lastId = newLastId;

//       this.logger.log(`Fetched ${users.length} users`);

//       const newLiquidatableUsers = await Promise.all(
//         users.map(async (userAddress) => ({
//           address: userAddress,
//           hf: await this.adapter.getUserHealthFactor(userAddress),
//         }))
//       );

//       const filteredUsers = newLiquidatableUsers.filter((userHf) => {
//         const isLiquidatable =
//           userHf.hf.lt(this.settings.maxHealthFactor) &&
//           userHf.hf.gt(this.settings.minHealthFactor);

//         if (isLiquidatable) {
//           this.logger.log(
//             `User ${userHf.address} has HF: ${formatUnits(userHf.hf)}`
//           );
//         }
//         return isLiquidatable;
//       });

//       liquidableUsers = [...liquidableUsers, ...filteredUsers];
//       await this.delay(100);
//     }

//     return liquidableUsers;
//   }

//   private async computeMarkets() {
//     const markets = await this.fetcher.fetchMarkets?.();
//     this.logger.log(`${markets?.markets?.length} markets fetched`);
//     return (markets?.markets as string[]) || [];
//   }

//   private async generateSwapPath(
//     borrowToken: string,
//     collateralToken: string,
//     amount: BigNumber
//   ): Promise<{ path: string; expectedOutput: BigNumber }> {
//     const borrowConfig = this.tokenList.get(borrowToken.toLowerCase());
//     const collateralConfig = this.tokenList.get(collateralToken.toLowerCase());

//     if (!borrowConfig || !collateralConfig) {
//       throw new Error("Token config not found");
//     }

//     // Direct path for same token
//     if (borrowToken.toLowerCase() === collateralToken.toLowerCase()) {
//       return { path: "0x", expectedOutput: amount };
//     }

//     // Find best path considering liquidity and fees
//     const paths = await this.findAllPossiblePaths(
//       borrowConfig.address,
//       collateralConfig.address,
//       amount
//     );

//     const bestPath = await this.findBestPath(paths, amount);
//     return bestPath;
//   }

//   private async findAllPossiblePaths(
//     tokenIn: string,
//     tokenOut: string,
//     amount: BigNumber
//   ) {
//     // Implementation for finding all possible paths between tokens
//     // Consider direct paths and paths through intermediate tokens
//     // Return array of possible paths with their expected outputs
//     // This is a simplified version - you'd want to expand this based on your needs
//     const directPool = await getPoolData(tokenIn, tokenOut);
//     const paths = [directPool];

//     // Add paths through common intermediate tokens (like USDC, ETH, etc)
//     const intermediateTokens = Array.from(this.tokenList.values())
//       .filter((token) => token.isStablecoin)
//       .map((token) => token.address);

//     for (const intermediate of intermediateTokens) {
//       if (intermediate !== tokenIn && intermediate !== tokenOut) {
//         const firstHop = await getPoolData(tokenIn, intermediate);
//         const secondHop = await getPoolData(intermediate, tokenOut);
//         if (firstHop[0]?.liquidity.gt(0) && secondHop[0]?.liquidity.gt(0)) {
//           paths.push([...firstHop, ...secondHop]);
//         }
//       }
//     }

//     return paths;
//   }

//   private async findBestPath(paths: UniswapPool[][], amount: BigNumber) {
//     let bestPath = { path: "0x", expectedOutput: BigNumber.from(0) };
//     let maxOutput = BigNumber.from(0);

//     for (const path of paths) {
//       // Calculate expected output considering slippage and fees
//       const output = await this.calculateExpectedOutput(path, amount);
//       if (output.gt(maxOutput)) {
//         maxOutput = output;
//         bestPath = {
//           path: this.encodePath(path),
//           expectedOutput: output,
//         };
//       }
//     }

//     return bestPath;
//   }

//   private encodePath(pools: UniswapPool[]): string {
//     // Encode the path for the Uniswap router
//     const path = pools.reduce((encoded, pool, index) => {
//       if (index === 0) {
//         return [pool.token0, pool.fee, pool.token1];
//       }
//       return [...encoded, pool.fee, pool.token1];
//     }, [] as (string | number)[]);

//     return ethers.utils.solidityPack(
//       Array(path.length).fill((index) =>
//         index % 2 === 0 ? "address" : "uint24"
//       ),
//       path
//     );
//   }

//   private async calculateExpectedOutput(
//     pools: UniswapPool[],
//     amountIn: BigNumber
//   ): Promise<BigNumber> {
//     // Calculate expected output considering slippage and fees
//     // This is a simplified version - you'd want to expand this
//     let amount = amountIn;
//     for (const pool of pools) {
//       amount = await this.adapter.getExpectedOutput(pool, amount);
//     }
//     return amount;
//   }

//   async run() {
//     try {
//       await this.initializeTokens();
//       const users = await this.computeLiquidableUsers();
//       this.logger.log(`Found ${users.length} liquidatable users`);

//       const markets = await this.computeMarkets();
//       const liquidationPromises = [];

//       for (let i = 0; i < users.length; i += this.settings.batchSize) {
//         const batch = users.slice(i, i + this.settings.batchSize);
//         const batchPromises = batch.map(async (user) => {
//           try {
//             const liquidationParams = await this.getUserLiquidationParams(
//               user.address,
//               markets
//             );
//             if (await this.isLiquidationProfitable(liquidationParams)) {
//               return this.executeLiquidation(liquidationParams);
//             }
//           } catch (error) {
//             this.logError(error);
//             return null;
//           }
//         });

//         liquidationPromises.push(...batchPromises);
//       }

//       await Promise.all(liquidationPromises);
//     } catch (error) {
//       this.logError(error);
//     }
//   }

//   private async isLiquidationProfitable(
//     params: UserLiquidationParams
//   ): Promise<boolean> {
//     const gasEstimate = await this.estimateGas(params);
//     const gasCost = gasEstimate.mul(this.settings.gasPrice);

//     const expectedProfit = await this.calculateExpectedProfit(params);
//     return expectedProfit.gt(gasCost.add(this.settings.profitableThresholdUSD));
//   }

//   private async estimateGas(params: UserLiquidationParams): Promise<BigNumber> {
//     try {
//       return await this.liquidationHandler.estimateGas(params);
//     } catch {
//       return BigNumber.from(500000); // fallback estimate
//     }
//   }

//   private async calculateExpectedProfit(
//     params: UserLiquidationParams
//   ): Promise<BigNumber> {
//     const { debtMarket, collateralMarket, toLiquidate } = params;
//     const liquidationBonus = await this.adapter.getLiquidationBonus(
//       collateralMarket.market
//     );

//     const debtValue = await this.adapter.toUsd(
//       debtMarket.market,
//       toLiquidate,
//       debtMarket.price
//     );

//     return PercentMath.percentMul(
//       debtValue,
//       liquidationBonus.sub(PercentMath.BASE_PERCENT)
//     );
//   }

//   private async executeLiquidation(params: UserLiquidationParams) {
//     const { path, expectedOutput } = await this.generateSwapPath(
//       params.debtMarket.market,
//       params.collateralMarket.market,
//       params.toLiquidate
//     );

//     const liquidationParams: LiquidationParams = {
//       poolTokenBorrowed: params.debtMarket.market,
//       poolTokenCollateral: params.collateralMarket.market,
//       underlyingBorrowed: this.tokenList.get(
//         params.debtMarket.market.toLowerCase()
//       )?.address!,
//       user: params.userAddress,
//       amount: params.toLiquidate,
//       swapPath: path,
//     };

//     return this.liquidationHandler.handleLiquidation(liquidationParams);
//   }

//   private delay(ms: number): Promise<void> {
//     return new Promise((resolve) => setTimeout(resolve, ms));
//   }

//   private logError(error: unknown) {
//     console.error(error);
//     this.logger.log(error);
//   }
// }
