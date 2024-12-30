import { ethers } from "hardhat";
import config, { AVAILABLE_PROTOCOLS } from "../config";
import { formatUnits } from "ethers/lib/utils";

require("dotenv").config();

const contractsNames: Record<string, string> = {
  controller: "SwapController",
  provider: "AmbientSwapp",
};
const params: Record<string, any[]> = {
  aave: [
    config.lender,
    config.univ3Router,
    config.addressesProvider,
    config.aToken,
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

async function main() {
  // const [signer] = await ethers.getSigners();
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.PLUME_DEVNET
  );
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY as string, provider);
  let swapProvider = process.env.SWAP_PROVIDER;

  if (!swapProvider) {
    const SwapProvider = await ethers.getContractFactory(
      contractsNames["provider"]
    );

    const balance = await signer.getBalance();
    console.log("ETH balance", formatUnits(balance));
    console.log("doc", params["aave"]);
    console.log("swap", process.env.AMBIENT_SWAP);
    const transaction = await SwapProvider.deploy(process.env.AMBIENT_SWAP);
    // console.log(transaction);
    const deploymentAddress = transaction.address;
    swapProvider = deploymentAddress;
    console.log(
      `Deploying liquidator for Swap Provider Ambient at address`,
      deploymentAddress
    );
    await transaction.deployed();
  }

  // Check protocols

  console.log(`Deploying swap controller`);

  const SwapController = await ethers.getContractFactory(
    contractsNames["controller"]
  );

  const balance = await signer.getBalance();
  console.log("ETH balance", formatUnits(balance));
  console.log("doc", params["aave"]);
  const transaction = await SwapController.deploy(swapProvider);
  // console.log(transaction);
  const deploymentAddress = transaction.address;
  console.log(`Deploying swap controller  at address`, deploymentAddress);
  await transaction.deployed();

  console.log("Successfully deployed to", deploymentAddress);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

// ambient swap - 0x21B5E1aC7154A34d0ae38684A4c27CbE6b9c4f1E
// swap controller - 0x2646b8a4d8fF94264c2F68843FA472f3dFD8DE7c
