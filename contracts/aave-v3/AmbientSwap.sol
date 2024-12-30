// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface ICrocSwapRouter {
    function swap(
        address base,
        address quote,
        uint256 poolIdx,
        bool isBuy,
        bool inBaseQty,
        uint128 qty,
        uint16 tip,
        uint128 limitPrice,
        uint128 minOut,
        uint8 settleFlags
    ) external payable returns (int128 baseFlow, int128 quoteFlow);
}

contract AmbientSwapp is Ownable {
    using SafeERC20 for IERC20;

    // Croc Swap Router
    ICrocSwapRouter public immutable swapRouter;

    // Minimum swap amount to prevent dust transactions
    uint256 public constant MIN_SWAP_AMOUNT = 1;

    // Default pool index
    uint256 public constant DEFAULT_POOL_INDEX = 420;

    // Events for tracking swaps
    event TokensSwapped(
        address indexed base,
        address indexed quote,
        uint256 amountIn,
        int256 amountOut,
        bool isBuy
    );

    event QuoteReceived(address base, address quote, uint256 amountIn, uint256 expectedAmountOut);

    constructor(address _swapRouterAddress) Ownable() {
        swapRouter = ICrocSwapRouter(_swapRouterAddress);
    }

    /**
     * @dev Performs a swap on Ambient (Croc) swap router
     * @param base Address of the base token
     * @param quote Address of the quote token
     * @param amountIn Amount of input tokens to swap
     * @param amountOutMinimum Minimum amount of output tokens expected
     */
    function swap(
        address base,
        address quote,
        uint256 amountIn,
        uint256 amountOutMinimum
    ) external returns (int256 amountOut) {
        // Validate inputs
        require(amountIn >= MIN_SWAP_AMOUNT, "Swap amount too low");
        require(base != address(0) && quote != address(0), "Invalid token address");

        // Determine which token is being swapped based on isBuy
        bool isBuy = true;
        address inputToken = base;
        // address inputToken = isBuy ? quote : base;

        // Transfer tokens from sender to contract
        IERC20(inputToken).safeTransferFrom(msg.sender, address(this), amountIn);

        // Approve router to spend tokens
        IERC20(inputToken).approve(address(swapRouter), amountIn);

        // Prepare swap parameters
        // Use default pool index, no tip, no limit price, default settle flags

        (int128 baseFlow, int128 quoteFlow) = swapRouter.swap(
            base,
            quote,
            DEFAULT_POOL_INDEX,
            true,
            true, // inBaseQty - false means qty is in quote token
            uint128(amountIn),
            0, // tip
            0, // limitPrice (0 means no limit)
            uint128(amountOutMinimum),
            0 // settleFlags
        );

        // Determine amount out based on flow
        amountOut = isBuy
            ? int256(baseFlow > 0 ? baseFlow : -baseFlow)
            : int256(quoteFlow > 0 ? quoteFlow : -quoteFlow);

        IERC20(quote).approve(msg.sender, uint256(amountOut));

        // Emit swap event
        emit TokensSwapped(base, quote, amountIn, amountOut, isBuy);

        return amountOut;
    }

    /**
     * @dev Retrieves a simulated quote for a potential swap
     * @param base Address of the base token
     * @param quote Address of the quote token
     * @param amountIn Amount of input tokens to swap
     * @return expectedAmountOut Expected output amount
     */
    function getQuote(
        address base,
        address quote,
        uint256 amountIn,
        uint256
    ) external view returns (uint256 expectedAmountOut) {
        // Validate inputs
        require(amountIn >= MIN_SWAP_AMOUNT, "Swap amount too low");
        require(base != address(0) && quote != address(0), "Invalid token address");

        // Placeholder quote simulation - in a real implementation,
        // you would use an on-chain quoter or oracle
        expectedAmountOut = _simulateQuote(base, quote, amountIn, false);

        // emit QuoteReceived(base, quote, amountIn, expectedAmountOut);

        return expectedAmountOut;
    }

    /**
     * @dev Simulated quote function (replace with actual quote logic)
     */
    function _simulateQuote(
        address base,
        address quote,
        uint256 amountIn,
        bool isBuy
    ) internal pure returns (uint256) {
        // Placeholder implementation - in reality, this would interact with
        // an on-chain price oracle or quoter
        // This is just a simple example and should NOT be used in production
        return isBuy ? (amountIn * 95) / 100 : (amountIn * 105) / 100;
    }

    /**
     * @dev Rescue tokens accidentally sent to the contract
     */
    function rescueTokens(address tokenAddress, uint256 amount) external onlyOwner {
        IERC20(tokenAddress).safeTransfer(owner(), amount);
    }

    /**
     * @dev Fallback function to prevent accidental ETH transfers
     */
    receive() external payable {
        revert("Direct ETH transfers not allowed");
    }
}
