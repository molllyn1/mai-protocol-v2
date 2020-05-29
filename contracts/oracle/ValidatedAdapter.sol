pragma solidity 0.5.8;

import "@openzeppelin/contracts/ownership/Ownable.sol";

import {LibMathSigned, LibMathUnsigned} from "../lib/LibMath.sol";
import "../interface/IPriceFeeder.sol";


contract ValidatedAdapter is Ownable {
    using LibMathSigned for int256;
    using LibMathUnsigned for uint256;

    address[] public candidateList;
    mapping(address => bool) private candidates;

    address public primary;
    uint256 public maxCandidates;
    uint256 public priceBiasTolerance = 10**16 * 5; // 5%
    uint256 public priceTimeout = 60 * 60; // 3600s

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

    function setPriceBiasTolerance(uint256 _tolerance) external {
        // 0 priceBiasTolerance will pause the adapter
        emit UpdateTolerance(priceBiasTolerance, _tolerance);
        priceBiasTolerance = _tolerance;
    }

    function setPrimary(address _primary) external {
        require(candidates[_primary], "not exist");
        require(_primary != primary, "already primary");
        emit UpdatePrimary(primary, _primary);
        primary = _primary;
    }

    function setPriceTimeout(uint256 timeoutSeconds) external {
        require(timeoutSeconds > 0, "invalid timeout");
        priceTimeout = timeoutSeconds;
    }

    function isCandidate(address feeder) external view returns (bool) {
        return candidates[feeder];
    }

    function _addCandidate(address feeder) internal {
        require(feeder != address(0x0), "invalid candidate");
        candidates[feeder] = true;
        candidateList.push(feeder);
    }

    function addCandidate(address feeder) external {
        require(!candidates[feeder], "already added");
        require(candidateList.length < maxCandidates, "max feeder reached");

        _addCandidate(feeder);

        emit AddCandidate(feeder);
    }

    function removeCandidate(address feeder) external {
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

    function absDelta(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a >= b) {
            return a.sub(b);
        } else {
            return b.sub(a);
        }
    }

    function validate(uint256 targetPrice) internal view returns (bool) {
        for (uint256 i = 0; i < candidateList.length; i++) {
            if (candidateList[i] == primary) {
                continue;
            }
            (uint256 price, uint256 timestamp) = IPriceFeeder(candidateList[i]).price();
            uint256 bias = absDelta(price, targetPrice).wdiv(targetPrice);
            require(bias < priceBiasTolerance && timestamp >= block.timestamp.sub(priceTimeout), "intolerant price");
        }
    }

    function price() public view primaryRequired returns (uint256 newPrice, uint256 timestamp) {
        (newPrice, timestamp) = IPriceFeeder(primary).price();
        validate(newPrice);
    }
}
