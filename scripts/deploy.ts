import { ethers } from "hardhat";
import config, { AVAILABLE_PROTOCOLS } from "../config";
import { formatUnits } from "ethers/lib/utils";

require("dotenv").config();

const contractsNames: Record<string, string> = {
  aave: "FlashMintLiquidatorBorrowRepayAave",
  compound: "FlashMintLiquidatorBorrowRepayCompound",
};
const params: Record<string, any[]> = {
  aave: [
    "0xd7ecf5312aa4FE7ddcAAFba779494fBC5f5f459A",
    "0x2646b8a4d8fF94264c2F68843FA472f3dFD8DE7c",
    "0x36Ded1E98d43a74679eF43589c59DBE34AdDc80c",
    "0x5507878b33C06EfD1ed0c1eB712EEd52fa99E658",
    config.slippageTolerance,
  ],
  compound: [
    config.lender,
    config.univ3Router,
    config.morphoCompound,
    config.tokens.dai.cToken,
    config.slippageTolerance,
  ],
};

// IERC3156FlashLender _lender,
//         SwapController _swapController,
//         ILendingPoolAddressesProvider _addressesProvider,
//         IAToken _aDai,
//         uint256 _slippageTolerance

async function main() {
  // const [signer] = await ethers.getSigners();
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.PLUME_DEVNET
  );
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY as string, provider);
  console.log("signer", signer.address);

  // Check protocols
  const protocols = process.env.PROTOCOLS?.split(",");
  if (!protocols) throw new Error("No protocols found");
  protocols.forEach((protocol) => {
    if (!AVAILABLE_PROTOCOLS.includes(protocol))
      throw new Error(`Invalid protocol ${protocol}`);
  });

  for (const protocol of protocols) {
    console.log(`Deploying ${protocol} liquidator`);

    const FlashMintLiquidator = await ethers.getContractFactory(
      contractsNames[protocol]
    );

    const balance = await signer.getBalance();
    console.log("ETH balance", formatUnits(balance));
    console.log("doc", params[protocol]);
    const transaction = await FlashMintLiquidator.deploy(...params[protocol]);
    console.log(transaction);
    const deploymentAddress = transaction.address;
    console.log(
      `Deploying liquidator for Morpho ${protocol} at address`,
      deploymentAddress
    );
    await transaction.deployed();

    console.log("Successfully deployed to", deploymentAddress);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// liquidator 0x53cf36Ffb753c1873534bE2afa0238048E399f91
