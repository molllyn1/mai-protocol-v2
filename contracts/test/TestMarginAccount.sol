pragma solidity 0.5.15;
pragma experimental ABIEncoderV2; // to enable structure-type parameter

import "../perpetual/MarginAccount.sol";


contract TestMarginAccount is MarginAccount {
    constructor(address _collateral, uint256 _decimals) public MarginAccount(_collateral, _decimals) {}

    function marginBalanceWithPricePublic(address guy, uint256 markPrice) public returns (int256) {
        return marginBalanceWithPrice(guy, markPrice);
    }

    function availableMarginWithPricePublic(address guy, uint256 markPrice) public returns (int256) {
        return availableMarginWithPrice(guy, markPrice);
    }

    function marginWithPricePublic(address guy, uint256 markPrice) public view returns (uint256) {
        return marginWithPrice(guy, markPrice);
    }

    function maintenanceMarginWithPricePublic(address guy, uint256 markPrice) public view returns (uint256) {
        return maintenanceMarginWithPrice(guy, markPrice);
    }

    function drawableBalanceWithPricePublic(address guy, uint256 markPrice) public returns (int256) {
        return drawableBalanceWithPrice(guy, markPrice);
    }

    function pnlWithPricePublic(address guy, uint256 markPrice) public returns (int256) {
        return pnlWithPrice(guy, markPrice);
    }

    function depositPublic(uint256 amount) public {
        deposit(msg.sender, amount);
    }

    function applyForWithdrawalPublic(uint256 amount, uint256 delay) public {
        applyForWithdrawal(msg.sender, amount, delay);
    }

    function withdrawPublic(uint256 amount) public {
        withdraw(msg.sender, amount, false);
    }

    function increaseTotalSizePublic(LibTypes.Side side, uint256 amount) public {
        increaseTotalSize(side, amount);
    }

    function decreaseTotalSizePublic(LibTypes.Side side, uint256 amount) public {
        decreaseTotalSize(side, amount);
    }

    function tradePublic(address guy, LibTypes.Side side, uint256 price, uint256 amount) public returns (uint256) {
        return trade(guy, side, price, amount);
    }

    function handleSocialLossPublic(LibTypes.Side side, int256 loss) public {
        handleSocialLoss(side, loss);
    }

    function liquidatePublic(address liquidator, address guy, uint256 liquidationPrice, uint256 liquidationAmount)
        public
        returns (int256)
    {
        liquidate(liquidator, guy, liquidationPrice, liquidationAmount);
    }

    function fundingLossPublic(address guy) public returns (int256) {
        LibTypes.MarginAccount memory account = getMarginAccount(guy);
        return fundingLoss(account);
    }

    function socialLossPublic(address guy) public view returns (int256) {
        LibTypes.MarginAccount memory account = getMarginAccount(guy);
        return socialLoss(account);
    }

    function remarginPublic(address guy, uint256 price) public {
        remargin(guy, price);
    }
}
