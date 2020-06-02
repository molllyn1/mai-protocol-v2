pragma solidity 0.5.17;

import {LibMathSigned, LibMathUnsigned} from "../lib/LibMath.sol";


contract TestPriceFeeder {
    using LibMathSigned for int256;
    using LibMathUnsigned for uint256;

    int256 public latestAnswer;
    uint256 public latestTimestamp;

    function setPrice(int256 newPrice) public {
        latestAnswer = newPrice;

        // solium-disable-next-line security/no-block-members
        latestTimestamp = block.timestamp;
    }

    function setPriceAndTimestamp(int256 newPrice, uint256 timestamp) public {
        latestAnswer = newPrice;
        latestTimestamp = timestamp;
    }

    function price() public view returns (uint256 newPrice, uint256 timestamp) {
        newPrice = latestAnswer.max(0).toUint256();
        timestamp = latestTimestamp;
    }

    function read() public view returns (uint256) {
        return latestAnswer.max(0).toUint256();
    }

    function age() public view returns (uint32) {
        return uint32(latestTimestamp);
    }
}
