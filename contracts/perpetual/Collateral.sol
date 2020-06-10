pragma solidity 0.5.15;
pragma experimental ABIEncoderV2; // to enable structure-type parameter

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";

import "../lib/LibDelayedVariable.sol";
import "../lib/LibMath.sol";
import "../lib/LibTypes.sol";
import "../lib/LibUtils.sol";
import "./PerpetualGovernance.sol";

/**
 *  Contract Collateral handles operations of underlaying collateral.
 *  Supplies methods to manipulate cash balance.
 */
contract Collateral is PerpetualGovernance {
    using LibMathSigned for int256;
    using LibMathUnsigned for uint256;
    using LibDelayedVariable for LibTypes.DelayedVariable;
    using SafeERC20 for IERC20;

    // Available decimals should be within [0, 18]
    uint256 private constant MAX_DECIMALS = 18;

    event Deposit(address indexed trader, int256 wadAmount, int256 balance);
    event Withdraw(address indexed trader, int256 wadAmount, int256 balance, int256 appliedCashBalance);
    event ApplyForWithdrawal(address indexed trader, int256 wadAmount, uint256 appliedHeight);
    event Transfer(address indexed from, address indexed to, int256 wadAmount, int256 balanceFrom, int256 balanceTo);
    event InternalUpdateBalance(address indexed trader, int256 wadAmount, int256 balance);

    /**
     * @dev Constructor of Collateral contract. Initialize collateral type and decimals.
     * @param _collateral   Address of collateral token. 0x0 means using ether instead of erc20 token.
     * @param _decimals     Decimals of collateral token. The value should be within range [0, 18].
     */
    constructor(address _collateral, uint256 _decimals) public {
        require(_decimals <= MAX_DECIMALS, "decimals out of range");
        require(_collateral != address(0) || _decimals == 18, "invalid decimals");

        collateral = IERC20(_collateral);
        // This statement will trigger a 'InternalCompilerError: Assembly exception for bytecode'
        // scaler = (_decimals == MAX_DECIMALS ? 1 : 10**(MAX_DECIMALS.sub(_decimals))).toInt256();
        // But this will not.
        scaler = int256(10**(MAX_DECIMALS - _decimals));
    }

    // ** All interface call from upper layer use the decimals of the collateral, called 'rawAmount'.

    /**
     * @dev Indicates that whether current collateral is an erc20 token.
     * @return True if current collateral is an erc20 token.
     */
    function isTokenizedCollateral() internal view returns (bool) {
        return address(collateral) != address(0);
    }

    /**
     * @dev Deposit collateral into trader's colleteral account. Decimals of collateral will be converted into internal
     *      decimals (18) then.
     *      For example:
     *          For a USDT-ETH contract, depositing 10 ** 6 USDT will increase the cash balance by 10 ** 18.
     *          But for a DAI-ETH contract, the depositing amount should be 10 ** 18 to get the same cash balance.
     *
     * @param trader    Address of account owner.
     * @param rawAmount Amount of collateral to be deposited in its original decimals.
     * @return  True if current collateral is an erc20 token.
     */
    function deposit(address trader, uint256 rawAmount) internal {
        int256 wadAmount = pullCollateral(trader, rawAmount);
        marginAccounts[trader].cashBalance = marginAccounts[trader].cashBalance.add(wadAmount);
        emit Deposit(trader, wadAmount, marginAccounts[trader].cashBalance);
    }

    /**
     * @dev Apply to withdraw cash balance. The applied part will become unavailable for opening position.
     *      The applied amount could be greater than cash balance.
     *
     * @param trader    Address of account owner.
     * @param rawAmount Amount of collateral to be deposited in its original decimals.
     * @param delay     Number of blocks required for the application to take effect.
     */
    function applyForWithdrawal(address trader, uint256 rawAmount, uint256 delay) internal {
        int256 wadAmount = toWad(rawAmount);
        withdrawalLocks[trader].setValueDelayed(bytes32(wadAmount), delay);
        emit ApplyForWithdrawal(trader, wadAmount, withdrawalLocks[trader].blockHeight);
    }

    /**
     * @dev Withdraw collaterals from trader's margin account to his ethereum address.
     *      The amount to withdraw is in its original decimals.
     *
     * @param trader    Address of account owner.
     * @param rawAmount Amount of collateral to be deposited in its original decimals.
     * @param forced    If true, the applied balance will be checked before decreasing balance.
     */
    function withdraw(address payable trader, uint256 rawAmount, bool forced) internal {
        require(rawAmount > 0, "invalid amount");
        int256 wadAmount = toWad(rawAmount);
        require(wadAmount <= marginAccounts[trader].cashBalance, "insufficient balance");

        int256 appliedCashBalance = int256(withdrawalLocks[trader].appliedValue());
        if (!forced) {
            require(wadAmount <= appliedCashBalance, "insufficient applied balance");
            appliedCashBalance = appliedCashBalance.sub(wadAmount);
        } else {
            appliedCashBalance = appliedCashBalance.sub(wadAmount.min(appliedCashBalance));
        }
        withdrawalLocks[trader].setValueInstant(bytes32(appliedCashBalance));
        marginAccounts[trader].cashBalance = marginAccounts[trader].cashBalance.sub(wadAmount);
        pushCollateral(trader, rawAmount);

        emit Withdraw(trader, wadAmount, marginAccounts[trader].cashBalance, appliedCashBalance);
    }

    /**
     * @dev Transfer collateral from user if collateral is erc20 token.
     *
     * @param trader    Address of account owner.
     * @param rawAmount Amount of collateral to be transferred into contract.
     * @return Internal representation of the raw amount.
     */
    function pullCollateral(address trader, uint256 rawAmount) internal returns (int256 wadAmount) {
        require(rawAmount > 0, "invalid amount");
        if (isTokenizedCollateral()) {
            collateral.safeTransferFrom(trader, address(this), rawAmount);
        }
        wadAmount = toWad(rawAmount);
    }

    /**
     * @dev Transfer collateral to user no matter erc20 token or ether.
     *
     * @param trader    Address of account owner.
     * @param rawAmount Amount of collateral to be transferred to user.
     * @return Internal representation of the raw amount.
     */
    function pushCollateral(address payable trader, uint256 rawAmount) internal returns (int256 wadAmount) {
        if (isTokenizedCollateral()) {
            collateral.safeTransfer(trader, rawAmount);
        } else {
            Address.sendValue(trader, rawAmount);
        }
        return toWad(rawAmount);
    }

    /**
     * @dev Update the cash balance of a collateral account. Depends on the signed of given amount,
     *      it could be increasing (for positive amount) or decreasing (for negative amount).
     *
     * @param trader    Address of account owner.
     * @param wadAmount Amount of balance to be update. Both positive and negative are avaiable.
     * @return Internal representation of the raw amount.
     */
    function updateBalance(address trader, int256 wadAmount) internal {
        marginAccounts[trader].cashBalance = marginAccounts[trader].cashBalance.add(wadAmount);
        emit InternalUpdateBalance(trader, wadAmount, marginAccounts[trader].cashBalance);
    }

    /**
     * @dev Check a trader's cash balance, return the negative part and set the cash balance to 0
     *      if possible.
     *
     * @param trader    Address of account owner.
     * @return A loss equals to the negative part of trader's cash balance before operating.
     */
    function ensurePositiveBalance(address trader) internal returns (uint256 loss) {
        if (marginAccounts[trader].cashBalance < 0) {
            loss = marginAccounts[trader].cashBalance.neg().toUint256();
            marginAccounts[trader].cashBalance = 0;
        }
    }

    /**
     * @dev Like erc20's 'transferFrom', transfer internal balance from one account to another.
     *
     * @param from      Address of the cash balance transferred from.
     * @param to        Address of the cash balance transferred to.
     * @param wadAmount Amount of the balance to be transferred.
     */
    function transferBalance(address from, address to, int256 wadAmount) internal {
        if (wadAmount == 0) {
            return;
        }
        require(wadAmount > 0, "invalid transfer amount");
        marginAccounts[from].cashBalance = marginAccounts[from].cashBalance.sub(wadAmount); // may be negative balance
        marginAccounts[to].cashBalance = marginAccounts[to].cashBalance.add(wadAmount);
        emit Transfer(from, to, wadAmount, marginAccounts[from].cashBalance, marginAccounts[to].cashBalance);
    }

    /**
     * @dev Convert the represention of amount from raw to internal.
     *
     * @param rawAmount Amount with decimals of collateral.
     * @return Amount with internal decimals.
     */
    function toWad(uint256 rawAmount) internal view returns (int256) {
        return rawAmount.toInt256().mul(scaler);
    }

    /**
     * @dev Convert the represention of amount from internal to raw.
     *
     * @param wadAmount Amount with internal decimals.
     * @return Amount with decimals of collateral.
     */
    function toCollateral(int256 wadAmount) internal view returns (uint256) {
        return wadAmount.div(scaler).toUint256();
    }
}
