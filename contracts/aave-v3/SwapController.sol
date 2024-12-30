// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface ISwapper {
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMinimum,
        uint24 poolFee
    ) external returns (uint256 amountOut);

    function getQuote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint24 poolFee
    ) external view returns (uint256 expectedAmountOut);
}

contract SwapController is Ownable {
    // Current active swap provider
    ISwapper public currentSwapper;

    // Event to log swap provider changes
    event SwapperUpdated(address indexed newSwapper, address indexed oldSwapper);

    // Event to log swap operations
    event SwapExecuted(
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    constructor(address _initialSwapper) Ownable() {
        require(_initialSwapper != address(0), "Invalid swapper address");
        currentSwapper = ISwapper(_initialSwapper);
    }

    /**
     * @dev Update the swap provider contract
     * @param _newSwapper Address of the new swap provider
     */
    function updateSwapper(address _newSwapper) external onlyOwner {
        require(_newSwapper != address(0), "Invalid swapper address");

        address oldSwapper = address(currentSwapper);
        currentSwapper = ISwapper(_newSwapper);

        emit SwapperUpdated(_newSwapper, oldSwapper);
    }

    /**
     * @dev Perform a swap using the current swap provider
     * @param tokenIn Address of input token
     * @param tokenOut Address of output token
     * @param amountIn Amount of input tokens
     * @param amountOutMinimum Minimum amount of output tokens
     * @param poolFee Pool fee for the swap
     * @return amountOut Actual amount of tokens received
     */
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMinimum,
        uint24 poolFee
    ) external returns (uint256 amountOut) {
        // pull input token from caller
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).approve(address(currentSwapper), amountIn);
        amountOut = currentSwapper.swap(tokenIn, tokenOut, amountIn, amountOutMinimum, poolFee);

        // pull swapped token from swapper and allow sender take token
        IERC20(tokenOut).transferFrom(address(currentSwapper), address(this), amountOut);
        IERC20(tokenOut).approve(msg.sender, amountOut);

        emit SwapExecuted(tokenIn, tokenOut, amountIn, amountOut);

        return amountOut;
    }

    /**
     * @dev Get a quote for a potential swap from the current provider
     * @param tokenIn Address of input token
     * @param tokenOut Address of output token
     * @param amountIn Amount of input tokens
     * @param poolFee Pool fee for the swap
     * @return expectedAmountOut Expected output amount
     */
    function getQuote(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint24 poolFee
    ) external view returns (uint256 expectedAmountOut) {
        return currentSwapper.getQuote(tokenIn, tokenOut, amountIn, poolFee);
    }
}
