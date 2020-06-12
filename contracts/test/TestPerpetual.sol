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

    function oneSideTradePublic(address trader, LibTypes.Side side, uint256 price, uint256 amount)
        public
        returns (uint256)
    {
        require(status != LibTypes.Status.EMERGENCY, "wrong perpetual status");
        require(side == LibTypes.Side.LONG || side == LibTypes.Side.SHORT, "invalid side");
        require(amount.mod(governance.tradingLotSize) == 0, "invalid trading lot size");
        return MarginAccount.trade(trader, side, price, amount);
    }

    function addSocialLossPerContract(LibTypes.Side side, int256 amount) internal {
        require(amount >= 0, "negtive social loss");
        int256 newVal = socialLossPerContracts[uint256(side)].add(amount);
        socialLossPerContracts[uint256(side)] = newVal;
    }

    function setSocialLossPerContractPublic(LibTypes.Side side, int256 value) public {
        addSocialLossPerContract(side, value.sub(socialLossPerContract(side)));
    }
}
