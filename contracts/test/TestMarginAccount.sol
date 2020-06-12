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

    function pnlWithPricePublic(address guy, uint256 markPrice) public returns (int256) {
        return pnlWithPrice(guy, markPrice);
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

    function updateBalancePublic(int256 amount) public {
        updateBalance(msg.sender, amount);
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
