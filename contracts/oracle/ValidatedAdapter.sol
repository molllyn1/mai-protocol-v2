pragma solidity 0.5.17;

import "@openzeppelin/contracts/ownership/Ownable.sol";

import {LibMathSigned, LibMathUnsigned} from "../lib/LibMath.sol";
import "../interface/IPriceFeeder.sol";


contract ValidatedAdapter is Ownable {
    using LibMathSigned for int256;
    using LibMathUnsigned for uint256;

    uint256 constant public ONE_PERCENT = 10 ** 16;
    uint256 constant public HOUR = 60 * 60;

    address public primary;
    uint256 public maxCandidates;

    uint256 public priceBiasTolerance = ONE_PERCENT * 5;    // 5%
    uint256 public candidatePriceTimeout = HOUR * 1;        // 1 hours
    uint256 public primaryPriceTimeout = HOUR * 3;          // 3 hours

    address[] public candidateList;
    mapping(address => bool) private candidates;

    event AddCandidate(address indexed feeder);
    event RemoveCandidate(address indexed feeder);
    event UpdateTolerance(uint256 oldValue, uint256 newValue);
    event UpdatePrimary(address indexed oldPrimary, address indexed newPrimary);

    modifier primaryRequired() {
        require(candidates[primary], "primary required");
        _;
    }

    constructor(address primaryFeeder, uint256 _maxCandidates) public {
        require(_maxCandidates > 0, "invalid parameter");

        _addCandidate(primaryFeeder);
        primary = primaryFeeder;
        maxCandidates = _maxCandidates;
    }

    function setPriceBiasTolerance(uint256 _tolerance) external onlyOwner {
        // 0 priceBiasTolerance will pause the adapter
        emit UpdateTolerance(priceBiasTolerance, _tolerance);
        priceBiasTolerance = _tolerance;
    }

    function setPrimary(address _primary) external onlyOwner {
        require(candidates[_primary], "not exist");
        require(_primary != primary, "already primary");
        emit UpdatePrimary(primary, _primary);
        primary = _primary;
    }

    function setCandidatePriceTimeout(uint256 timeoutSeconds) external onlyOwner {
        require(timeoutSeconds > 0, "invalid timeout");
        candidatePriceTimeout = timeoutSeconds;
    }

    function setPrimaryPriceTimeout(uint256 timeoutSeconds) external onlyOwner {
        require(timeoutSeconds > 0, "invalid timeout");
        primaryPriceTimeout = timeoutSeconds;
    }

    function isCandidate(address feeder) external view returns (bool) {
        return candidates[feeder];
    }

    function addCandidate(address feeder) external onlyOwner {
        require(!candidates[feeder], "already added");
        require(candidateList.length < maxCandidates, "max feeder reached");

        _addCandidate(feeder);

        emit AddCandidate(feeder);
    }

    function removeCandidate(address feeder) external onlyOwner {
        require(candidates[feeder], "not added");
        require(feeder != primary, "cannot remove primary");
        delete candidates[feeder];
        for (uint256 i = 0; i < candidateList.length; i++) {
            if (candidateList[i] == feeder) {
                candidateList[i] = candidateList[candidateList.length - 1];
                candidateList.length -= 1;
                break;
            }
        }
        emit RemoveCandidate(feeder);
    }

    function price() public view primaryRequired returns (uint256 newPrice, uint256 timestamp) {
        (newPrice, timestamp) = IPriceFeeder(primary).price();
        require(newPrice > 0, "invalid target price");
        require(timestamp >= block.timestamp.sub(primaryPriceTimeout), "target price timeout");
        require(timestamp <= block.timestamp, "future target timestamp");
        validate(newPrice);
    }

    function absDelta(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a >= b) {
            return a.sub(b);
        } else {
            return b.sub(a);
        }
    }

    function _addCandidate(address feeder) internal {
        require(feeder != address(0x0), "invalid candidate");
        candidates[feeder] = true;
        candidateList.push(feeder);
    }

    function validate(uint256 targetPrice) internal view returns (bool) {
        for (uint256 i = 0; i < candidateList.length; i++) {
            if (candidateList[i] == primary) {
                continue;
            }
            (uint256 candidatePrice, uint256 timestamp) = IPriceFeeder(candidateList[i]).price();
            if (candidatePrice > 0 && timestamp >= block.timestamp.sub(candidatePriceTimeout) && timestamp <= block.timestamp) {
                uint256 bias = absDelta(candidatePrice, targetPrice).wdiv(targetPrice);
                require(bias < priceBiasTolerance, "intolerant price");
            }
        }
    }
}
