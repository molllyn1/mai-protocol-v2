pragma solidity 0.5.15;
pragma experimental ABIEncoderV2; // to enable structure-type parameter

import "../lib/LibTypes.sol";
import "../interface/IPerpetual.sol";
import "../interface/IPerpetualProxy.sol";


contract PerpetualProxy {
    using LibTypes for LibTypes.Side;

    IPerpetual perpetual;

    modifier onlyAMM() {
        require(msg.sender == address(perpetual.amm()), "invalid caller");
        _;
    }

    constructor(address _perpetual) public {
        perpetual = IPerpetual(_perpetual);
    }

    function self() public view returns (address) {
        return address(this);
    }

    function status() public view returns (LibTypes.Status) {
        return perpetual.status();
    }

    function devAddress() public view returns (address) {
        return perpetual.devAddress();
    }

    function markPrice() public returns (uint256) {
        return perpetual.markPrice();
    }

    function settlementPrice() public view returns (uint256) {
        return perpetual.settlementPrice();
    }

    // note: do NOT call this function in a non-transaction request, unless you do not care about the broker appliedHeight.
    // because in a call(), block.number is the on-chain height, and it will be 1 more in a transaction
    function currentBroker(address guy) public view returns (address) {
        return perpetual.currentBroker(guy);
    }

    function availableMargin(address guy) public returns (int256) {
        return perpetual.availableMargin(guy);
    }

    function getPoolAccount() public view returns (IPerpetualProxy.PoolAccount memory pool) {
        LibTypes.MarginAccount memory position = perpetual.getMarginAccount(self());
        require(position.side != LibTypes.Side.SHORT, "pool should be long");
        pool.positionSize = position.size;
        pool.positionEntryValue = position.entryValue;
        pool.positionEntrySocialLoss = position.entrySocialLoss;
        pool.positionEntryFundingLoss = position.entryFundingLoss;
        pool.cashBalance = perpetual.getMarginAccount(self()).cashBalance;
        pool.socialLossPerContract = perpetual.socialLossPerContract(LibTypes.Side.LONG);
    }

    function cashBalance() public view returns (int256) {
        return perpetual.getMarginAccount(self()).cashBalance;
    }

    function positionSize() public view returns (uint256) {
        return perpetual.getMarginAccount(self()).size;
    }

    function positionSide() public view returns (LibTypes.Side) {
        return perpetual.getMarginAccount(self()).side;
    }

    function positionEntryValue() public view returns (uint256) {
        return perpetual.getMarginAccount(self()).entryValue;
    }

    function positionEntrySocialLoss() public view returns (int256) {
        return perpetual.getMarginAccount(self()).entrySocialLoss;
    }

    function positionEntryFundingLoss() public view returns (int256) {
        return perpetual.getMarginAccount(self()).entryFundingLoss;
    }

    function socialLossPerContract(LibTypes.Side side) public view returns (int256) {
        return perpetual.socialLossPerContract(side);
    }

    function transferBalanceIn(address from, uint256 amount) public onlyAMM {
        perpetual.transferCashBalance(from, self(), amount);
    }

    function transferBalanceOut(address to, uint256 amount) public onlyAMM {
        perpetual.transferCashBalance(self(), to, amount);
    }

    function transferBalanceTo(address from, address to, uint256 amount) public onlyAMM {
        perpetual.transferCashBalance(from, to, amount);
    }

    function trade(address guy, LibTypes.Side side, uint256 price, uint256 amount) public onlyAMM returns (uint256) {
        (uint256 opened, ) = perpetual.tradePosition(guy, self(), side, price, amount);
        return opened;
    }

    function setBrokerFor(address guy, address broker) public onlyAMM {
        perpetual.setBrokerFor(guy, broker);
    }

    function depositFor(address guy, uint256 amount) public payable onlyAMM {
        perpetual.depositFor.value(msg.value)(guy, amount);
    }

    function withdrawFor(address payable guy, uint256 amount) public onlyAMM {
        perpetual.withdrawFor(guy, amount);
    }

    function isSafe(address guy) public returns (bool) {
        return perpetual.isSafe(guy);
    }

    function isSafeWithPrice(address guy, uint256 currentMarkPrice) public returns (bool) {
        return perpetual.isSafeWithPrice(guy, currentMarkPrice);
    }

    function isProxySafe() public returns (bool) {
        return perpetual.isSafe(self());
    }

    function isProxySafeWithPrice(uint256 currentMarkPrice) public returns (bool) {
        return perpetual.isSafeWithPrice(self(), currentMarkPrice);
    }

    function isIMSafe(address guy) public returns (bool) {
        return perpetual.isIMSafe(guy);
    }

    function isIMSafeWithPrice(address guy, uint256 currentMarkPrice) public returns (bool) {
        return perpetual.isIMSafeWithPrice(guy, currentMarkPrice);
    }

    function lotSize() public view returns (uint256) {
        return perpetual.getGovernance().lotSize;
    }

    function tradingLotSize() public view returns (uint256) {
        return perpetual.getGovernance().tradingLotSize;
    }
}
