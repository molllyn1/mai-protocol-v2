pragma solidity 0.5.15;
pragma experimental ABIEncoderV2; // to enable structure-type parameter

import "../perpetual/MarginAccount.sol";


contract TestMarginAccount is MarginAccount {
    constructor(address _globalConfig, address _collateral, uint256 _decimals)
        public
        MarginAccount(_globalConfig, _collateral, _decimals)
    {}

    function marginBalanceWithPricePublic(address trader, uint256 markPrice) public returns (int256) {
        return marginBalanceWithPrice(trader, markPrice);
    }

    function availableMarginWithPricePublic(address trader, uint256 markPrice) public returns (int256) {
        return availableMarginWithPrice(trader, markPrice);
    }

    function marginWithPricePublic(address trader, uint256 markPrice) public view returns (uint256) {
        return marginWithPrice(trader, markPrice);
    }

    function maintenanceMarginWithPricePublic(address trader, uint256 markPrice) public view returns (uint256) {
        return maintenanceMarginWithPrice(trader, markPrice);
    }

    function pnlWithPricePublic(address trader, uint256 markPrice) public returns (int256) {
        return pnlWithPrice(trader, markPrice);
    }

    function depositPublic(uint256 amount) public {
        deposit(msg.sender, amount);
    }

    function withdrawPublic(uint256 amount) public {
        withdraw(msg.sender, amount);
    }

    function increaseTotalSizePublic(LibTypes.Side side, uint256 amount) public {
        increaseTotalSize(side, amount);
    }

    function decreaseTotalSizePublic(LibTypes.Side side, uint256 amount) public {
        decreaseTotalSize(side, amount);
    }

    function tradePublic(address trader, LibTypes.Side side, uint256 price, uint256 amount) public returns (uint256) {
        return trade(trader, side, price, amount);
    }

    function handleSocialLossPublic(LibTypes.Side side, int256 loss) public {
        handleSocialLoss(side, loss);
    }

    function liquidatePublic(address liquidator, address trader, uint256 liquidationPrice, uint256 liquidationAmount)
        public
        returns (int256)
    {
        liquidate(liquidator, trader, liquidationPrice, liquidationAmount);
    }

    function fundingLossPublic(address trader) public returns (int256) {
        LibTypes.MarginAccount memory account = getMarginAccount(trader);
        return fundingLoss(account);
    }

    function socialLossPublic(address trader) public view returns (int256) {
        LibTypes.MarginAccount memory account = getMarginAccount(trader);
        return socialLoss(account);
    }

    function remarginPublic(address trader, uint256 price) public {
        remargin(trader, price);
    }

    function updateBalancePublic(int256 amount) public {
        updateCashBalance(msg.sender, amount);
    }

    function ensurePositiveBalancePublic() public returns (uint256 loss) {
        return ensurePositiveBalance(msg.sender);
    }

    function transferBalancePublic(address from, address to, uint256 amount) public {
        transferBalance(from, to, amount.toInt256());
    }

    function addSocialLossPerContractPublic(LibTypes.Side side, int256 amount) public {
        require(amount >= 0, "negtive social loss");
        int256 newVal = socialLossPerContracts[uint256(side)].add(amount);
        socialLossPerContracts[uint256(side)] = newVal;
    }

    function setSocialLossPerContractPublic(LibTypes.Side side, int256 value) public {
        addSocialLossPerContractPublic(side, value.sub(socialLossPerContract(side)));
    }
}
