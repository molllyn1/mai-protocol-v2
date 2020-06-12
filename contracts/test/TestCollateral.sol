pragma solidity 0.5.15;
pragma experimental ABIEncoderV2; // to enable structure-type parameter

import "../perpetual/Collateral.sol";


contract TestCollateral is Collateral {
    constructor(address _collateral, uint256 decimals) public Collateral(_collateral, decimals) {}

    function isTokenizedCollateralPublic() public view returns (bool) {
        return isTokenizedCollateral();
    }

    function depositPublic(uint256 amount) public payable {
        deposit(msg.sender, amount);
    }

    function withdrawPublic(uint256 amount) public {
        withdraw(msg.sender, amount);
    }

    function pullCollateralPublic(address trader, uint256 rawAmount) public returns (int256 wadAmount) {
        return pullCollateral(trader, rawAmount);
    }

    function pushCollateralPublic(address payable trader, uint256 rawAmount) public returns (int256 wadAmount) {
        return pushCollateral(trader, rawAmount);
    }

    function toWadPublic(uint256 rawAmount) public view returns (int256) {
        return toWad(rawAmount);
    }

    function toCollateralPublic(int256 amount) public view returns (uint256) {
        return toCollateral(amount);
    }
}
