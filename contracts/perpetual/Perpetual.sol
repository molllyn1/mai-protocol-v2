pragma solidity 0.5.15;
pragma experimental ABIEncoderV2; // to enable structure-type parameter

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "../lib/LibOrder.sol";
import "../lib/LibTypes.sol";
import "../lib/LibMath.sol";

import "./MarginAccount.sol";

contract Perpetual is MarginAccount, ReentrancyGuard  {
    using LibMathSigned for int256;
    using LibMathUnsigned for uint256;
    using LibOrder for LibTypes.Side;

    uint256 public totalAccounts;
    address[] public accountList;
    mapping(address => bool) private accountCreated;

    event CreatePerpetual();
    event CreateAccount(uint256 indexed id, address indexed trader);
    event Trade(address indexed taker, address indexed maker, LibTypes.Side side, uint256 price, uint256 amount);
    event Liquidate(address indexed keeper, address indexed trader, uint256 price, uint256 amount);
    event UpdateSettlementPrice(uint256 price);

    constructor(address _globalConfig, address _devAddress, address _collateral, uint256 _collateralDecimals)
        public
        MarginAccount(_collateral, _collateralDecimals)
    {
        setGovernanceAddress("globalConfig", _globalConfig);
        setGovernanceAddress("dev", _devAddress);

        emit CreatePerpetual();
    }

    // disable fallback
    function() external payable {
        revert("no payable");
    }

    // Admin functions
    function setCashBalance(address trader, int256 amount) public onlyWhitelistAdmin {
        require(status == LibTypes.Status.SETTLING, "wrong perpetual status");
        int256 deltaAmount = amount.sub(marginAccounts[trader].cashBalance);
        marginAccounts[trader].cashBalance = amount;
        emit InternalUpdateBalance(trader, deltaAmount, amount);
    }

    /**
     * @dev Set perpetual status to 'emergency'. It can be called multiple times to set price.
     *      In emergency mode, main function like trading / withdrawing is disabled to prevent unexpected loss.
     *
     * @param price Price used as mark price in emergency mode.
     */
    function beginGlobalSettlement(uint256 price) public onlyWhitelistAdmin {
        setEmergencyStatus();
        settlementPrice = price;
        emit UpdateSettlementPrice(price);
    }

    /**
     * @dev Set perpetual status to 'settled'. It can be call only once in 'emergency' mode.
     *      In settled mode, user is expected to closed positions and withdraw all the collateral.
     */
    function endGlobalSettlement() public onlyWhitelistAdmin {
        setSettledStatus();
        address ammTrader = address(amm.perpetualProxy());
        settleImplementation(ammTrader);
    }

    function depositToInsuranceFund(uint256 rawAmount) public payable nonReentrant {
        checkDepositingParameter(rawAmount);

        require(rawAmount > 0, "invalid amount");
        int256 wadAmount = pullCollateral(msg.sender, rawAmount);
        insuranceFundBalance = insuranceFundBalance.add(wadAmount);
        require(insuranceFundBalance >= 0, "negtive insurance fund");

        emit UpdateInsuranceFund(insuranceFundBalance);
    }

    function withdrawFromInsuranceFund(uint256 rawAmount) public onlyWhitelistAdmin nonReentrant {
        require(rawAmount > 0, "invalid amount");
        require(insuranceFundBalance > 0, "insufficient funds");

        int256 wadAmount = toWad(rawAmount);
        require(wadAmount <= insuranceFundBalance, "insufficient funds");
        insuranceFundBalance = insuranceFundBalance.sub(wadAmount);
        pushCollateral(msg.sender, rawAmount);
        require(insuranceFundBalance >= 0, "negtive insurance fund");

        emit UpdateInsuranceFund(insuranceFundBalance);
    }
    // End Admin functions

    // Deposit && Withdraw
    function deposit(uint256 rawAmount) public payable nonReentrant {
        depositImplementation(msg.sender, rawAmount);
    }

    function withdraw(uint256 rawAmount) public nonReentrant {
        withdrawImplementation(msg.sender, rawAmount);
    }

    function applyForWithdrawal(uint256 rawAmount) public nonReentrant {
        Collateral.applyForWithdrawal(msg.sender, rawAmount, globalConfig.withdrawalLockBlockCount());
    }

    function settle() public nonReentrant {
        require(status == LibTypes.Status.SETTLED, "wrong perpetual status");

        address payable trader = msg.sender;
        settleImplementation(trader);
        int256 wadAmount = marginAccounts[trader].cashBalance;
        if (wadAmount <= 0) {
            return;
        }
        uint256 rawAmount = toCollateral(wadAmount);
        Collateral.withdraw(trader, rawAmount, true);
    }

    // Deposit && Withdraw - Whitelisted Only
    function depositFor(address trader, uint256 rawAmount) public payable onlyWhitelisted nonReentrant {
        depositImplementation(trader, rawAmount);
    }

    function withdrawFor(address payable trader, uint256 rawAmount) public onlyWhitelisted nonReentrant {
        withdrawImplementation(trader, rawAmount);
    }

    // Method for public properties
    function markPrice() public ammRequired returns (uint256) {
        return status == LibTypes.Status.NORMAL ? amm.currentMarkPrice() : settlementPrice;
    }

    function positionMargin(address trader) public returns (uint256) {
        return MarginAccount.marginWithPrice(trader, markPrice());
    }

    function maintenanceMargin(address trader) public returns (uint256) {
        return maintenanceMarginWithPrice(trader, markPrice());
    }

    function marginBalance(address trader) public returns (int256) {
        return marginBalanceWithPrice(trader, markPrice());
    }

    function pnl(address trader) public returns (int256) {
        return pnlWithPrice(trader, markPrice());
    }

    function availableMargin(address trader) public returns (int256) {
        return availableMarginWithPrice(trader, markPrice());
    }

    function drawableBalance(address trader) public returns (int256) {
        return drawableBalanceWithPrice(trader, markPrice());
    }

    // safe for liquidation
    function isSafe(address trader) public returns (bool) {
        uint256 currentMarkPrice = markPrice();
        return isSafeWithPrice(trader, currentMarkPrice);
    }

    // safe for liquidation
    function isSafeWithPrice(address trader, uint256 currentMarkPrice) public returns (bool) {
        return marginBalanceWithPrice(trader, currentMarkPrice) >=
            maintenanceMarginWithPrice(trader, currentMarkPrice).toInt256();
    }

    function isBankrupt(address trader) public returns (bool) {
        return marginBalanceWithPrice(trader, markPrice()) < 0;
    }

    // safe for opening positions
    function isIMSafe(address trader) public returns (bool) {
        uint256 currentMarkPrice = markPrice();
        return isIMSafeWithPrice(trader, currentMarkPrice);
    }

    // safe for opening positions
    function isIMSafeWithPrice(address trader, uint256 currentMarkPrice) public returns (bool) {
        return availableMarginWithPrice(trader, currentMarkPrice) >= 0;
    }

    function liquidate(address trader, uint256 maxAmount) public returns (uint256, uint256) {
        require(msg.sender != trader, "self liquidate");
        require(status != LibTypes.Status.SETTLED, "wrong perpetual status");
        require(maxAmount.mod(governance.lotSize) == 0, "invalid lot size");
        require(!isSafe(trader), "safe account");

        uint256 liquidationPrice = markPrice();
        require(liquidationPrice > 0, "invalid price");

        uint256 liquidationAmount = calculateLiquidateAmount(trader, liquidationPrice);
        uint256 totalPositionSize = marginAccounts[trader].size;
        uint256 liquidatableAmount = totalPositionSize.sub(totalPositionSize.mod(governance.lotSize));
        liquidationAmount = liquidationAmount.ceil(governance.lotSize).min(maxAmount).min(liquidatableAmount);
        require(liquidationAmount > 0, "nothing to liquidate");

        uint256 opened = MarginAccount.liquidate(msg.sender, trader, liquidationPrice, liquidationAmount);
        if (opened > 0) {
            require(availableMarginWithPrice(msg.sender, liquidationPrice) >= 0, "liquidator margin");
        } else {
            require(isSafe(msg.sender), "liquidator unsafe");
        }
        emit Liquidate(msg.sender, trader, liquidationPrice, liquidationAmount);
        return (liquidationPrice, liquidationAmount);
    }

    function tradePosition(
        address taker,
        address maker,
        LibTypes.Side side,
        uint256 price,
        uint256 amount
    )
        public
        onlyWhitelisted
        returns (uint256 takerOpened, uint256 makerOpened)
    {
        require(status != LibTypes.Status.SETTLING, "wrong perpetual status");
        require(side == LibTypes.Side.LONG || side == LibTypes.Side.SHORT, "invalid side");
        require(amount.mod(governance.tradingLotSize) == 0, "invalid trading lot size");

        takerOpened = MarginAccount.trade(taker, side, price, amount);
        makerOpened = MarginAccount.trade(maker, side.counterSide(), price, amount);
        require(totalSize(LibTypes.Side.LONG) == totalSize(LibTypes.Side.SHORT), "imbalanced total size");

        emit Trade(taker, maker, side, price, amount);
    }

    function transferCashBalance(address from, address to, uint256 amount) public onlyWhitelisted {
        require(status != LibTypes.Status.SETTLING, "wrong perpetual status");
        Collateral.transferBalance(from, to, amount.toInt256());
    }

    function registerNewTrader(address trader) internal {
        emit CreateAccount(totalAccounts, trader);
        accountList.push(trader);
        totalAccounts++;
        accountCreated[trader] = true;
    }

    /**
     * @dev Check type of collateral. If ether, rawAmount must strictly match msg.value.
     *
     * @param rawAmount Amount to deposit
     */
    function checkDepositingParameter(uint256 rawAmount) internal view {
        bool isToken = isTokenizedCollateral();
        require(
            (isToken && msg.value == 0) || (!isToken && msg.value == rawAmount),
            "invalid depositing parameter"
        );
    }

    /**
     * @dev Implementation as underlaying of deposit and depositFor.
     *
     * @param trader    Address the collateral will be transferred from.
     * @param rawAmount Amount to deposit.
     */
    function depositImplementation(address trader, uint256 rawAmount) internal {
        checkDepositingParameter(rawAmount);
        require(rawAmount > 0, "invalid amount");
        require(trader != address(0), "invalid trader");

        Collateral.deposit(trader, rawAmount);
        // append to the account list. make the account trackable
        if (!accountCreated[trader]) {
            registerNewTrader(trader);
        }
    }

    /**
     * @dev Implementation as underlaying of withdraw and withdrawFor.
     *
     * @param trader    Address the collateral will be transferred to.
     * @param rawAmount Amount to withdraw.
     */
    function withdrawImplementation(address payable trader, uint256 rawAmount) internal {
        require(status == LibTypes.Status.NORMAL, "wrong perpetual status");
        require(rawAmount > 0, "invalid amount");
        require(trader != address(0), "invalid trader");

        uint256 currentMarkPrice = markPrice();
        require(isSafeWithPrice(trader, currentMarkPrice), "unsafe before withdraw");

        remargin(trader, currentMarkPrice);
        bool forced = (currentBroker(trader) == address(0));
        Collateral.withdraw(trader, rawAmount, forced);

        require(isSafeWithPrice(trader, currentMarkPrice), "unsafe after withdraw");
        require(availableMarginWithPrice(trader, currentMarkPrice) >= 0, "withdraw margin");
    }

    /**
     * @dev Implementation as underlaying of settle.
     *
     * @param trader    Address the collateral will be transferred to.
     */
    function settleImplementation(address trader) internal {
        uint256 currentMarkPrice = markPrice();
        LibTypes.MarginAccount memory account = marginAccounts[trader];
        if (account.size > 0) {
            close(account, currentMarkPrice, account.size);
            marginAccounts[trader] = account;
            // updateBalance(trader, rpnl);
        }
        emit UpdatePositionAccount(trader, account, totalSize(LibTypes.Side.LONG), currentMarkPrice);
    }
}
