// import { expect } from "chai";
// import { ethers, network } from "hardhat";
// import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
// import {
//   FlashMintLiquidatorBorrowRepayAave,
//   SwapController,
//   IERC20,
//   ILendingPool,
//   IAToken,
//   IERC3156FlashLender,
//   ILendingPoolAddressesProvider,
// } from "../../typechain";
// import { BigNumber } from "ethers";

// describe("FlashMintLiquidatorBorrowRepayAave", () => {
//   // Contract instances
//   let liquidator: FlashMintLiquidatorBorrowRepayAave;
//   let swapController: SwapController;
//   let lendingPool: ILendingPool;
//   let addressesProvider: ILendingPoolAddressesProvider;
//   let flashLender: IERC3156FlashLender;
//   let aDai: IAToken;
//   let dai: IERC20;

//   // Test accounts
//   let owner: SignerWithAddress;
//   let borrower: SignerWithAddress;
//   let liquidatorAccount: SignerWithAddress;
//   let others: SignerWithAddress[];

//   // Constants
//   const SLIPPAGE_TOLERANCE = 200; // 2%
//   const BASIS_POINTS = 10000;

//   beforeEach(async () => {
//     [owner, borrower, liquidatorAccount, ...others] = await ethers.getSigners();

//     // // Deploy mock contracts for testing
//     // const MockFlashLender = await ethers.getContractFactory("MockFlashLender");
//     // flashLender = await MockFlashLender.connect(owner).deploy();

//     // const MockAddressesProvider = await ethers.getContractFactory(
//     //   "MockAddressesProvider"
//     // );
//     // addressesProvider = await MockAddressesProvider.connect(owner).deploy();

//     // const MockAToken = await ethers.getContractFactory("MockAToken");
//     // aDai = await MockAToken.deploy();
//     // dai = await (
//     //   await ethers.getContractFactory("MockERC20")
//     // ).deploy("DAI", "DAI", 18);

//     // const MockSwapController = await ethers.getContractFactory(
//     //   "MockSwapController"
//     // );
//     // swapController = await MockSwapController.connect(owner).deploy();

//     // // Deploy the main contract
//     // const FlashMintLiquidator = await ethers.getContractFactory(
//     //   "FlashMintLiquidatorBorrowRepayAave"
//     // );
//     // liquidator = await FlashMintLiquidator.deploy(
//     //   flashLender.address,
//     //   swapController.address,
//     //   addressesProvider.address,
//     //   aDai.address,
//     //   SLIPPAGE_TOLERANCE
//     // );

//     liquidator = await ethers.getContractAt(
//       "FlashMintLiquidatorBorrowRepayAave",
//       "0xBdf2dC39aEd22e8CC605b76a6024197acDF93Bc4"
//     );

//     // Setup mock behaviors
//     // await aDai.setUnderlying(dai.address);
//     // await addressesProvider.setPool(lendingPool.address);
//   });

//   describe("Constructor & Initial State", () => {
//     it("should set correct initial values", async () => {
//       expect(await liquidator.lender()).to.equal(flashLender.address);
//       expect(await liquidator.swapController()).to.equal(
//         swapController.address
//       );
//       expect(await liquidator.addressesProvider()).to.equal(
//         addressesProvider.address
//       );
//       expect(await liquidator.aDai()).to.equal(aDai.address);
//       expect(await liquidator.slippageTolerance()).to.equal(SLIPPAGE_TOLERANCE);
//     });

//     it("should emit SlippageToleranceSet event during construction", async () => {
//       const FlashMintLiquidator = await ethers.getContractFactory(
//         "FlashMintLiquidatorBorrowRepayAave"
//       );
//       await expect(
//         FlashMintLiquidator.deploy(
//           flashLender.address,
//           swapController.address,
//           addressesProvider.address,
//           aDai.address,
//           SLIPPAGE_TOLERANCE
//         )
//       )
//         .to.emit(liquidator, "SlippageToleranceSet")
//         .withArgs(SLIPPAGE_TOLERANCE);
//     });
//   });

//   describe("setSlippageTolerance", () => {
//     it("should allow owner to set slippage tolerance", async () => {
//       const newTolerance = 300;
//       await expect(liquidator.setSlippageTolerance(newTolerance))
//         .to.emit(liquidator, "SlippageToleranceSet")
//         .withArgs(newTolerance);

//       expect(await liquidator.slippageTolerance()).to.equal(newTolerance);
//     });

//     it("should revert if non-owner tries to set slippage tolerance", async () => {
//       await expect(
//         liquidator.connect(others[0]).setSlippageTolerance(300)
//       ).to.be.revertedWith("Ownable: caller is not the owner");
//     });

//     // it("should revert if tolerance is above BASIS_POINTS", async () => {
//     //   await expect(
//     //     liquidator.setSlippageTolerance(BASIS_POINTS + 1)
//     //   ).to.be.revertedWithCustomError(liquidator, "ValueAboveBasisPoints");
//     // });
//   });

//   describe("liquidate", () => {
//     const repayAmount = ethers.utils.parseEther("1000");
//     const poolTokenBorrowed = "0x1234..."; // Example address
//     const poolTokenCollateral = "0x5678..."; // Example address

//     beforeEach(async () => {
//       // Setup liquidator permissions
//       await liquidator.addLiquidator(liquidatorAccount.address);
//     });

//     it("should revert if caller is not a liquidator", async () => {
//       await expect(
//         liquidator
//           .connect(others[0])
//           .liquidate(
//             poolTokenBorrowed,
//             poolTokenCollateral,
//             borrower.address,
//             repayAmount,
//             false,
//             "0x"
//           )
//       ).to.be.revertedWith("NotLiquidator");
//     });

//     it("should execute liquidation without flash loan if contract has enough balance", async () => {
//       // Setup contract with enough balance
//       await dai.transfer(liquidator.address, repayAmount);

//       await expect(
//         liquidator
//           .connect(liquidatorAccount)
//           .liquidate(
//             poolTokenBorrowed,
//             poolTokenCollateral,
//             borrower.address,
//             repayAmount,
//             false,
//             "0x"
//           )
//       ).to.emit(liquidator, "Liquidated");
//     });

//     it("should execute liquidation with flash loan if contract lacks balance", async () => {
//       const path = ethers.utils.defaultAbiCoder.encode(
//         ["address", "address", "uint24"],
//         [dai.address, poolTokenBorrowed, 3000]
//       );

//       await expect(
//         liquidator
//           .connect(liquidatorAccount)
//           .liquidate(
//             poolTokenBorrowed,
//             poolTokenCollateral,
//             borrower.address,
//             repayAmount,
//             false,
//             path
//           )
//       )
//         .to.emit(liquidator, "FlashLoan")
//         .to.emit(liquidator, "Liquidated");
//     });
//   });
// });
