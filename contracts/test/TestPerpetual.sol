pragma solidity 0.5.15;
pragma experimental ABIEncoderV2; // to enable structure-type parameter

import "../perpetual/Perpetual.sol";


contract TestPerpetual is Perpetual {
    constructor(address _globalConfig, address _devAddress, address collateral, uint256 collateralDecimals)
        public
        Perpetual(_globalConfig, _devAddress, collateral, collateralDecimals)
    {}

    function transferCashBalancePublic(address from, address to, uint256 amount) public {
        transferCashBalance(from, to, amount);
    }

    function forceSetCollateral(address trader, LibTypes.MarginAccount memory value) public {
        marginAccounts[trader] = value;
    }

    function forceSetPosition(address trader, LibTypes.MarginAccount memory value) public {
        marginAccounts[trader] = value;
    }

    function forceSetTotalSize(uint256 value) public {
        totalSizes[1] = value;
        totalSizes[2] = value;
    }
}
