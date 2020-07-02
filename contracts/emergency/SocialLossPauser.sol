pragma solidity 0.5.15;
pragma experimental ABIEncoderV2; // to enable structure-type parameter

import "@openzeppelin/contracts/ownership/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../interface/IPerpetual.sol";
import "../interface/IAMM.sol";

import "../lib/LibMath.sol";
import "../lib/LibTypes.sol";

contract SocialLossPauser is Ownable {
    using LibMathSigned for int256;

    mapping(address => int256) socialLossThresholds;

    event UpdateSocialLossThreshold(address indexed perpetual, int256 oldValue, int256 newValue);
    event TriggerSocialLossPause(address indexed perpetual, address indexed guy, int256 loss);

    function setSocialLossThreshold(address perpetual, int256 threshold) external onlyOwner {
        require(socialLossThresholds[perpetual] != threshold, "not changed");

        emit UpdateSocialLossThreshold(perpetual, socialLossThresholds[perpetual], threshold);
        socialLossThresholds[perpetual] = threshold;
    }

    function totalSocialLoss(address perpetual) public view returns (int256) {
        IPerpetual perpetualInstance = IPerpetual(perpetual);
        return perpetualInstance.socialLossPerContract(LibTypes.Side.SHORT)
            .add(perpetualInstance.socialLossPerContract(LibTypes.Side.LONG));
    }

    function pausePerpetual(address perpetual) external {
        require(socialLossThresholds[perpetual] > 0, "no threshold set");

        int256 totalLoss = totalSocialLoss(perpetual);
        require(totalLoss >= socialLossThresholds[perpetual], "lower than threshold");
        IPerpetual(perpetual).pause();

        emit TriggerSocialLossPause(perpetual, msg.sender, totalLoss);
    }
}
