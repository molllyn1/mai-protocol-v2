pragma solidity 0.5.15;
pragma experimental ABIEncoderV2; // to enable structure-type parameter

import "../perpetual/Collateral.sol";


contract TestCollateral is Collateral {
    constructor(address _collateral, uint256 decimals) public Collateral(_collateral, decimals) {}

    function depositPublic(uint256 amount) public payable {
        deposit(msg.sender, amount);
    }

    function applyForWithdrawalPublic(uint256 amount, uint256 delay) public {
        applyForWithdrawal(msg.sender, amount, delay);
    }

    function withdrawPublic(uint256 amount) public {
        withdraw(msg.sender, amount, false);
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
}
