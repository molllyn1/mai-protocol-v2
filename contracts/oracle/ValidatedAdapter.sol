pragma solidity 0.5.15;

import "@openzeppelin/contracts/ownership/Ownable.sol";

import {LibMathSigned, LibMathUnsigned} from "../lib/LibMath.sol";
import "../interface/IPriceFeeder.sol";


contract ValidatedAdapter is Ownable {
    using LibMathSigned for int256;
    using LibMathUnsigned for uint256;

    // constants:
    uint256 constant public ONE_PERCENT = 10 ** 16;

    // properties:
    uint256 private lastPrice;
    uint256 private lastTimestamp;

    // stores currently primary price feeder;
    address public primary;
    // max number of candidates.
    uint256 public maxCandidates;
    uint256 public maxPriceGapPercentage = ONE_PERCENT * 5;     // 5%

    // for user to list all candidates of current system.
    address[] private candidateList;
    mapping(address => bool) private candidates;
    mapping(address => uint256) private candidateTimeouts;

    // events:
    event AddCandidate(address indexed feeder, uint256 timeout);
    event RemoveCandidate(address indexed feeder);
    event UpdateCandidateTimeout(address indexed feeder, uint256 timeout);
    event UpdatePrimary(address indexed oldPrimary, address indexed newPrimary);
    event UpdateMaxPriceGapPercentage(uint256 oldValue, uint256 newValue);
    event UpdatePrice(address indexed primary, uint256 newPrice, uint256 newTimestamp);

    // modifiers:
    // test current primary price feeder is set and is a legal address.
    modifier primaryRequired() {
        require(primary != address(0x0) && candidates[primary], "primary required");
        _;
    }

    // methods:
    /// @dev constructor of ValidatedAdapterV2
    /// @param _maxCandidates Max number of candidates, to limit max gas consumed on validation.
    constructor(uint256 _maxCandidates) public {
        require(_maxCandidates > 0, "invalid max limit");
        maxCandidates = _maxCandidates;
    }

    /// @dev Set address of primary price feeder. The feed must have already been added,
    ///      and a update will be performed immediately to sync the last price and timestamp.
    /// @param _primary Address of primary price feeder.
    function setPrimary(address _primary) external onlyOwner {
        require(candidates[_primary], "not exist");
        require(_primary != primary, "already primary");

        emit UpdatePrimary(primary, _primary);
        primary = _primary;
        // updatePrice();
    }

    /// @dev Set max price gap percentage allowed between primary and other validators.
    /// @param percentage A fixed float in decimal 18 format, say, 1 * 10**18 == 100%.
    function setMaxPriceGapPercentage(uint256 percentage) external onlyOwner {
        emit UpdateMaxPriceGapPercentage(maxPriceGapPercentage, percentage);
        maxPriceGapPercentage = percentage;
    }

    /// @dev Set timeout for price of a candidate feeder. Price from who has no update for given period will be ignored.
    /// @param timeoutSeconds Timeout in seconds.
    function setCandidateTimeout(address feeder, uint256 timeoutSeconds) external onlyOwner {
        require(timeoutSeconds > 0, "zero timeout");
        require(candidates[feeder], "not exist");

        candidateTimeouts[feeder] = timeoutSeconds;
        emit UpdateCandidateTimeout(feeder, timeoutSeconds);
    }

    /// @dev Test a address is in candidate list.
    /// @param feeder Address of feeder to be tested.
    /// @return True if the address of feeder is in candidate list.
    function isCandidate(address feeder) external view returns (bool) {
        return candidates[feeder];
    }

    function candidateTimeout(address feeder) external view returns (uint256) {
        return candidateTimeouts[feeder];
    }

    function allCandidates() external view returns (address[] memory) {
        return candidateList;
    }

    /// @dev Add a feeder to candidate list. will be used as a validator later on.
    /// @param feeder Address of feeder to be added.
    function addCandidate(address feeder, uint256 timeoutSeconds) external onlyOwner {
        require(!candidates[feeder], "duplicated");
        require(candidateList.length < maxCandidates, "max limit reached");
        require(feeder != address(0x0), "invalid candidate");
        require(timeoutSeconds > 0, "zero timeout");

        candidates[feeder] = true;
        candidateTimeouts[feeder] = timeoutSeconds;
        candidateList.push(feeder);
        emit AddCandidate(feeder, timeoutSeconds);
    }

    /// @dev Remove a feeder from candidate list.
    /// @param feeder Address of feeder to be removed.
    function removeCandidate(address feeder) external onlyOwner {
        require(candidates[feeder], "not exist");
        require(feeder != primary, "cannot remove primary");

        delete candidates[feeder];
        delete candidateTimeouts[feeder];
        for (uint256 i = 0; i < candidateList.length; i++) {
            if (candidateList[i] == feeder) {
                candidateList[i] = candidateList[candidateList.length - 1];
                candidateList.length -= 1;
                break;
            }
        }
        emit RemoveCandidate(feeder);
    }

    /// @dev Read latest price and timestamp. It will try to update  if the current price is changed.
    /// @return Latest price and timestamp.
    function price() public primaryRequired returns (uint256, uint256) {
        updatePrice();
        return (lastPrice, lastTimestamp);
    }

    /// @dev Update price from primary feeder and validate the price read with prices from validators (candidates).
    ///      This method is usually called by a keeper but also can be called by anyone if needed.
    function updatePrice() public primaryRequired {
        (uint256 newPrice, uint256 newTimestamp) = IPriceFeeder(primary).price();
        require(newPrice > 0 && newTimestamp > 0, "no value");
        require(isValidTimestamp(primary, newTimestamp), "outdated price");

        if (newPrice != lastPrice || newTimestamp != lastTimestamp) {
            require(newPrice > 0, "invalid price");
            require(isValidTimestamp(primary, newTimestamp), "timestamp out of range");
            require(isValidatePrice(newPrice), "price gap reached");

            lastPrice = newPrice;
            lastTimestamp = newTimestamp;
            emit UpdatePrice(primary, newPrice, newTimestamp);
        }
    }

    /// @dev calculate abs(diff(a, b))
    function absDelta(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a >= b) {
            return a.sub(b);
        } else {
            return b.sub(a);
        }
    }

    /// @dev Test if a timestamp is valid for a feeder (in [ts, ts + timeout])
    /// @param candidate Address of price feeder.
    /// @param timestamp Last timestamp of when the price is updated.
    /// @return True if the price is within a tolerant range.
    function isValidTimestamp(address candidate, uint256 timestamp) internal view returns (bool) {
        uint256 timeout = candidateTimeouts[candidate];
        return now <= timestamp.add(timeout) && now >= timestamp;
    }

    /// @dev Validate a price with prices from validators (candidates).
    /// @param targetPrice The price to be validated.
    /// @return True if the price is within a tolerant range.
    function isValidatePrice(uint256 targetPrice) internal view returns (bool) {
        for (uint256 i = 0; i < candidateList.length; i++) {
            if (candidateList[i] == primary) {
                continue;
            }
            (uint256 candidatePrice, uint256 timestamp) = IPriceFeeder(candidateList[i]).price();
            if (candidatePrice > 0 && isValidTimestamp(candidateList[i], timestamp)) {
                uint256 deltaPercentage = absDelta(candidatePrice, targetPrice).wdiv(targetPrice);
                if (deltaPercentage >= maxPriceGapPercentage) {
                    return false;
                }
            }
        }
        return true;
    }
}
