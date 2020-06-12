pragma solidity 0.5.15;
pragma experimental ABIEncoderV2; // to enable structure-type parameter

import "@openzeppelin/contracts/access/roles/WhitelistedRole.sol";

import "../lib/LibMath.sol";
import "../lib/LibTypes.sol";
import "./PerpetualStorage.sol";

contract PerpetualGovernance is PerpetualStorage {

    event EnterEmergencyStatus();
    event EnterSettledStatus();
    event UpdateGovernanceParameter(bytes32 indexed key, int256 value);
    event UpdateGovernanceAddress(bytes32 indexed key, address value);

    // Modifier to check if amm address is set.
    modifier ammRequired() {
        require(address(amm) != address(0), "no automated market maker");
        _;
    }

    /**
      * @dev Set governance parameters.
      *
      * @param key   Name of parameter.
      * @param value Value of parameter.
      */
    function setGovernanceParameter(bytes32 key, int256 value) public onlyWhitelistAdmin {
        if (key == "initialMarginRate") {
            governance.initialMarginRate = value.toUint256();
            require(governance.initialMarginRate > 0, "require im > 0");
            require(governance.initialMarginRate < 10**18, "require im < 1");
            require(governance.maintenanceMarginRate < governance.initialMarginRate, "require mm < im");
        } else if (key == "maintenanceMarginRate") {
            governance.maintenanceMarginRate = value.toUint256();
            require(governance.maintenanceMarginRate > 0, "require mm > 0");
            require(governance.maintenanceMarginRate < governance.initialMarginRate, "require mm < im");
            require(governance.liquidationPenaltyRate < governance.maintenanceMarginRate, "require lpr < mm");
            require(governance.penaltyFundRate < governance.maintenanceMarginRate, "require pfr < mm");
        } else if (key == "liquidationPenaltyRate") {
            governance.liquidationPenaltyRate = value.toUint256();
            require(governance.liquidationPenaltyRate < governance.maintenanceMarginRate, "require lpr < mm");
        } else if (key == "penaltyFundRate") {
            governance.penaltyFundRate = value.toUint256();
            require(governance.penaltyFundRate < governance.maintenanceMarginRate, "require pfr < mm");
        } else if (key == "takerDevFeeRate") {
            governance.takerDevFeeRate = value;
        } else if (key == "makerDevFeeRate") {
            governance.makerDevFeeRate = value;
        } else if (key == "lotSize") {
            require(
                governance.tradingLotSize == 0 || governance.tradingLotSize.mod(value.toUint256()) == 0,
                "require tls % ls == 0"
            );
            governance.lotSize = value.toUint256();
        } else if (key == "tradingLotSize") {
            require(governance.lotSize == 0 || value.toUint256().mod(governance.lotSize) == 0, "require tls % ls == 0");
            governance.tradingLotSize = value.toUint256();
        } else if (key == "longSocialLossPerContracts") {
            require(status == LibTypes.Status.EMERGENCY, "wrong perpetual status");
            socialLossPerContracts[uint256(LibTypes.Side.LONG)] = value;
        } else if (key == "shortSocialLossPerContracts") {
            require(status == LibTypes.Status.EMERGENCY, "wrong perpetual status");
            socialLossPerContracts[uint256(LibTypes.Side.SHORT)] = value;
        } else {
            revert("key not exists");
        }
        emit UpdateGovernanceParameter(key, value);
    }

    /**
      * @dev Set governance address. like set governance parameter.
      *
      * @param key   Name of parameter.
      * @param value Address to set.
      */
    function setGovernanceAddress(bytes32 key, address value) public onlyWhitelistAdmin {
        require(value != address(0), "invalid address");
        if (key == "dev") {
            devAddress = value;
        } else if (key == "amm") {
            amm = IAMM(value);
        } else if (key == "globalConfig") {
            globalConfig = IGlobalConfig(value);
        } else {
            revert("key not exists");
        }
        emit UpdateGovernanceAddress(key, value);
    }

    function setEmergencyStatus() internal {
        require(status != LibTypes.Status.SETTLED, "wrong perpetual status");
        status = LibTypes.Status.EMERGENCY;
        emit EnterEmergencyStatus();
    }

    function setSettledStatus() internal {
        require(status == LibTypes.Status.EMERGENCY, "wrong perpetual status");
        status = LibTypes.Status.SETTLED;
        emit EnterSettledStatus();
    }
}
