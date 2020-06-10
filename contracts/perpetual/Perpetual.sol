pragma solidity 0.5.15;
pragma experimental ABIEncoderV2; // to enable structure-type parameter

import "../lib/LibOrder.sol";
import "../lib/LibTypes.sol";
import "../lib/LibMath.sol";
import "../lib/LibDelayedVariable.sol";
import "../lib/LibUtils.sol";

import "./MarginAccount.sol";

contract Perpetual is MarginAccount, ReentrancyGuard  {
    using LibMathSigned for int256;
    using LibMathUnsigned for uint256;
    using LibOrder for LibTypes.Side;
    using LibDelayedVariable for LibTypes.DelayedVariable;
    using LibUtils for address;
    using LibUtils for bytes32;

    uint256 public totalAccounts;
    address[] public accountList;
    mapping(address => bool) private accountCreated;

    event CreatePerpetual();
    event CreateAccount(uint256 indexed id, address indexed trader);
    event Buy(address indexed trader, uint256 price, uint256 amount);
    event Sell(address indexed trader, uint256 price, uint256 amount);
    event Liquidate(address indexed keeper, address indexed trader, uint256 price, uint256 amount);
    event EndGlobalSettlement();
    event BrokerUpdate(address indexed account, address indexed guy, uint256 appliedHeight);

    constructor(address _globalConfig, address _devAddress, address _collateral, uint256 _collateralDecimals)
        public
        MarginAccount(_collateral, _collateralDecimals)
    {
        setGovernanceAddress("globalConfig", _globalConfig);
        setGovernanceAddress("dev", _devAddress);

        emit CreatePerpetual();
    }

    // Admin functions
    function setCashBalance(address trader, int256 amount) public onlyWhitelistAdmin {
        require(status == LibTypes.Status.SETTLING, "wrong perpetual status");
        int256 deltaAmount = amount.sub(marginAccounts[trader].cashBalance);
        marginAccounts[trader].cashBalance = amount;
        emit InternalUpdateBalance(trader, deltaAmount, amount);
    }

    function endGlobalSettlement() public onlyWhitelistAdmin {
        require(status == LibTypes.Status.SETTLING, "wrong perpetual status");

        address ammTrader = address(amm.perpetualProxy());
        settleFor(ammTrader);
        status = LibTypes.Status.SETTLED;

        emit EndGlobalSettlement();
    }

    function depositToInsuranceFund(uint256 rawAmount) public {
        require(rawAmount > 0, "invalid amount");
        checkDepositingParameter(rawAmount);
        int256 wadAmount = pullCollateral(msg.sender, rawAmount);
        insuranceFundBalance = insuranceFundBalance.add(wadAmount);
        require(insuranceFundBalance >= 0, "negtive insurance fund");

        emit UpdateInsuranceFund(insuranceFundBalance);
    }

    function withdrawFromInsuranceFund(uint256 rawAmount) public onlyWhitelistAdmin {
        require(rawAmount > 0, "invalid amount");
        require(insuranceFundBalance > 0, "insufficient funds");

        int256 wadAmount = toWad(rawAmount);
        require(wadAmount <= insuranceFundBalance, "insufficient funds");
        insuranceFundBalance = insuranceFundBalance.sub(wadAmount);
        pushCollateral(msg.sender, rawAmount);
        require(insuranceFundBalance >= 0, "negtive insurance fund");

        emit UpdateInsuranceFund(insuranceFundBalance);
    }

    // Public functions
    function() external payable {
        revert("no payable");
    }

    function markPrice() public ammRequired returns (uint256) {
        return status == LibTypes.Status.NORMAL ? amm.currentMarkPrice() : settlementPrice;
    }

    function setBroker(address newBroker) public {
        setBrokerFor(msg.sender, newBroker);
    }

    function setBrokerFor(address trader, address newBroker) public onlyWhitelisted {
        if (currentBroker(trader) != newBroker) {
            brokers[trader].setValueDelayed(newBroker.toBytes32(), globalConfig.brokerLockBlockCount());
            emit BrokerUpdate(trader, newBroker, brokers[trader].blockHeight);
        }
    }

    // Deposit && Withdraw
    function deposit(uint256 rawAmount) public {
        checkDepositingParameter(rawAmount);
        depositToAccount(msg.sender, rawAmount);
    }

    function applyForWithdrawal(uint256 rawAmount) public {
        Collateral.applyForWithdrawal(msg.sender, rawAmount, globalConfig.withdrawalLockBlockCount());
    }

    function withdraw(uint256 amount) public {
        withdrawFromAccount(msg.sender, amount);
    }

    function settle() public nonReentrant {
        require(status == LibTypes.Status.SETTLED, "wrong perpetual status");

        address payable trader = msg.sender;
        settleFor(trader);
        int256 wadAmount = marginAccounts[trader].cashBalance;
        if (wadAmount <= 0) {
            return;
        }
        uint256 rawAmount = toCollateral(wadAmount);
        withdraw(trader, rawAmount, true);
    }

    // this is a composite function of perp.deposit + perp.setBroker
    // composite functions accept amount = 0
    function depositAndSetBroker(uint256 amount, address broker) public payable {
        setBroker(broker);
        deposit(amount);
    }

    // Whitelisted Only
    function depositFor(address trader, uint256 rawAmount) public payable onlyWhitelisted {
        checkDepositingParameter(rawAmount);
        depositToAccount(trader, rawAmount);
    }

    function withdrawFor(address payable trader, uint256 amount) public onlyWhitelisted {
        withdrawFromAccount(trader, amount);
    }

    function settleFor(address trader) private {
        uint256 currentMarkPrice = markPrice();
        LibTypes.MarginAccount memory account = marginAccounts[trader];
        if (account.size > 0) {
            int256 pnl = close(account, currentMarkPrice, account.size);
            updateBalance(trader, pnl);
            marginAccounts[trader] = account;
        }
        emit UpdatePositionAccount(trader, account, totalSize(LibTypes.Side.LONG), currentMarkPrice);
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
        return
            marginBalanceWithPrice(trader, currentMarkPrice) >=
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

    function tradePosition(address trader, LibTypes.Side side, uint256 price, uint256 amount)
        public
        onlyWhitelisted
        returns (uint256)
    {
        require(status != LibTypes.Status.SETTLING, "wrong perpetual status");
        require(side == LibTypes.Side.LONG || side == LibTypes.Side.SHORT, "invalid side");

        uint256 opened = MarginAccount.trade(trader, side, price, amount);
        if (side == LibTypes.Side.LONG) {
            emit Buy(trader, price, amount);
        } else if (side == LibTypes.Side.SHORT) {
            emit Sell(trader, price, amount);
        }
        return opened;
    }

    function transferCashBalance(address from, address to, uint256 amount) public onlyWhitelisted {
        require(status != LibTypes.Status.SETTLING, "wrong perpetual status");
        transferBalance(from, to, amount.toInt256());
    }

    function registerNewTrader(address trader) internal {
        emit CreateAccount(totalAccounts, trader);
        accountList.push(trader);
        totalAccounts++;
        accountCreated[trader] = true;
    }

    function checkDepositingParameter(uint256 rawAmount) internal view {
        bool isToken = isTokenizedCollateral();
        require(
            (isToken && msg.value == 0) || (!isToken && msg.value == rawAmount),
            "invalid depositing parameter"
        );
    }

    function depositToAccount(address trader, uint256 rawAmount) private nonReentrant {
        require(rawAmount > 0, "invalid amount");
        require(trader != address(0), "invalid trader");

        Collateral.deposit(trader, rawAmount);
        // append to the account list. make the account trackable
        if (!accountCreated[trader]) {
            registerNewTrader(trader);
        }
    }

    function withdrawFromAccount(address payable trader, uint256 amount) private nonReentrant {
        require(status == LibTypes.Status.NORMAL, "wrong perpetual status");
        require(trader != address(0), "invalid trader");

        uint256 currentMarkPrice = markPrice();
        require(isSafeWithPrice(trader, currentMarkPrice), "unsafe before withdraw");

        remargin(trader, currentMarkPrice);
        address broker = currentBroker(trader);
        bool forced = (broker == address(0));
        Collateral.withdraw(trader, amount, forced);

        require(isSafeWithPrice(trader, currentMarkPrice), "unsafe after withdraw");
        require(availableMarginWithPrice(trader, currentMarkPrice) >= 0, "withdraw margin");
    }
}
