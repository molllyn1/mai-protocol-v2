pragma solidity 0.5.17;

import "@openzeppelin/contracts/ownership/Ownable.sol";

import {LibMathSigned, LibMathUnsigned} from "../lib/LibMath.sol";
import "../interface/IChainlinkFeeder.sol";
import "../interface/IMakerMedianFeeder.sol";


contract DoubleCheckAdapter is Ownable {
    using LibMathSigned for int256;
    using LibMathUnsigned for uint256;

    int256 public constant chainlinkDecimalsAdapter = 10**10;

    IChainlinkFeeder public chainlinkOracle;
    IMakerMedianFeeder public makerOracle;
    uint256 public priceBiasTolerance = 10**16 * 5; // 5%

    event UpdateTolerance(uint256 oldValue, uint256 newValue);

    constructor(address chainlinkOracleAddress, address makerOracleAddress) public {
        require(chainlinkOracleAddress != address(0x0), "invalid chainlink");
        require(makerOracleAddress != address(0x0), "invalid maker");

        chainlinkOracle = IChainlinkFeeder(chainlinkOracleAddress);
        makerOracle = IMakerMedianFeeder(makerOracleAddress);
    }

    function setPriceBiasTolerance(uint256 _tolerance) external onlyOwner {
        // 0 priceBiasTolerance will pause the adapter
        emit UpdateTolerance(priceBiasTolerance, _tolerance);
        priceBiasTolerance = _tolerance;
    }

    function absDelta(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a >= b) {
            return a.sub(b);
        } else {
            return b.sub(a);
        }
    }

    function validate(uint256 targetPrice) internal view returns (bool) {
        require(targetPrice > 0, "invalid target price");
        uint256 price = makerOracle.read();
        uint256 bias = absDelta(price, targetPrice).wdiv(targetPrice);
        require(bias < priceBiasTolerance, "intolerant price");
    }

    function price() public view returns (uint256 newPrice, uint256 timestamp) {
        newPrice = (chainlinkOracle.latestAnswer() * chainlinkDecimalsAdapter).toUint256();
        validate(newPrice);
        timestamp = chainlinkOracle.latestTimestamp();
    }
}
