pragma solidity 0.5.15;
pragma experimental ABIEncoderV2; // to enable structure-type parameter

import "@openzeppelin/contracts/access/roles/WhitelistedRole.sol";

import {LibMathSigned, LibMathUnsigned} from "../lib/LibMath.sol";
import "../lib/LibTypes.sol";
import "../interface/IPriceFeeder.sol";
import "../interface/IPerpetualProxy.sol";


contract AMMGovernance is WhitelistedRole {
    using LibMathSigned for int256;
    using LibMathUnsigned for uint256;

    LibTypes.AMMGovernanceConfig internal governance;
    LibTypes.FundingState internal fundingState;

    // auto-set when calling setGovernanceParameter
    int256 public emaAlpha2; // 1 - emaAlpha
    int256 public emaAlpha2Ln; // ln(emaAlpha2)

    IPerpetualProxy public perpetualProxy;
    IPriceFeeder public priceFeeder;

    event UpdateGovernanceParameter(bytes32 indexed key, int256 value);

    function setGovernanceParameter(bytes32 key, int256 value) public onlyWhitelistAdmin {
        if (key == "poolFeeRate") {
            governance.poolFeeRate = value.toUint256();
        } else if (key == "poolDevFeeRate") {
            governance.poolDevFeeRate = value.toUint256();
        } else if (key == "emaAlpha") {
            require(value > 0, "alpha should be > 0");
            require(value <= 10**18, "alpha should be <= 1");
            governance.emaAlpha = value;
            emaAlpha2 = 10**18 - governance.emaAlpha;
            emaAlpha2Ln = emaAlpha2.wln();
        } else if (key == "updatePremiumPrize") {
            governance.updatePremiumPrize = value.toUint256();
        } else if (key == "markPremiumLimit") {
            governance.markPremiumLimit = value;
        } else if (key == "fundingDampener") {
            governance.fundingDampener = value;
        } else if (key == "accumulatedFundingPerContract") {
            require(perpetualProxy.status() == LibTypes.Status.SETTLING, "wrong perpetual status");
            fundingState.accumulatedFundingPerContract = value;
        } else {
            revert("key not exists");
        }
        emit UpdateGovernanceParameter(key, value);
    }

    function getGovernance() public view returns (LibTypes.AMMGovernanceConfig memory) {
        return governance;
    }
}
