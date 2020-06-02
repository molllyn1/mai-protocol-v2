pragma solidity 0.5.17;

import {LibMathSigned, LibMathUnsigned} from "../lib/LibMath.sol";
import "../interface/IMakerMedianFeeder.sol";


contract MakerMedianAdapter {
    using LibMathSigned for int256;
    IMakerMedianFeeder public feeder;

    constructor(address _feeder) public {
        feeder = IMakerMedianFeeder(_feeder);
    }

    function price() public view returns (uint256 newPrice, uint256 timestamp) {
        newPrice = feeder.read();
        timestamp = uint256(feeder.age());
    }
}
