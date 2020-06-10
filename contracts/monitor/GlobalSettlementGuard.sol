pragma solidity 0.5.15;
pragma experimental ABIEncoderV2; // to enable structure-type parameter

import "@openzeppelin/contracts/ownership/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../interface/IPerpetual.sol";
import "../interface/IAMM.sol";

import {LibMathSigned} from "../lib/LibMath.sol";
import "../lib/LibTypes.sol";


contract GlobalSettlementGuard is Ownable {
    using LibMathSigned for int256;

    mapping(address => int256) configurations;

    event ThresholdUpdated(address indexed perpetualAddress, int256 oldValue, int256 newValue);
    event GlobalSettlementTriggered(address indexed perpetualAddress, address indexed guy, int256 loss, uint256 price);

    function setThreshold(address perpetualAddress, int256 threshold) external onlyOwner {
        require(configurations[perpetualAddress] != threshold, "not changed");

        emit ThresholdUpdated(perpetualAddress, configurations[perpetualAddress], threshold);
        configurations[perpetualAddress] = threshold;
    }

    function totalSocialLoss(address perpetualAddress) public view returns (int256) {
        IPerpetual perpetual = IPerpetual(perpetualAddress);
        return
            perpetual.socialLossPerContract(LibTypes.Side.SHORT).add(
                perpetual.socialLossPerContract(LibTypes.Side.LONG)
            );
    }

    function isAdministratorOf(address perpetualAddress) public view returns (bool) {
        IPerpetual perpetual = IPerpetual(perpetualAddress);
        return perpetual.isWhitelistAdmin(address(this));
    }

    function beginGlobalSettlement(address perpetualAddress) external {
        require(configurations[perpetualAddress] > 0, "zero threshold");

        int256 totalLoss = totalSocialLoss(perpetualAddress);
        require(totalLoss >= configurations[perpetualAddress], "lower than threshold");

        IPerpetual perpetual = IPerpetual(perpetualAddress);
        IAMM amm = IAMM(perpetual.amm());
        LibTypes.FundingState memory lastFundingState = amm.lastFundingState();
        uint256 price = lastFundingState.lastIndexPrice;
        perpetual.beginGlobalSettlement(price);

        emit GlobalSettlementTriggered(perpetualAddress, msg.sender, totalLoss, price);
    }
}
