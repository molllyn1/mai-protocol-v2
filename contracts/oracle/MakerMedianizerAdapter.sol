pragma solidity 0.5.15;

import "@openzeppelin/contracts/ownership/Ownable.sol";

import "../lib/LibList.sol";
import "../lib/LibMath.sol";

import "../interface/IMakerMedianizerFeeder.sol";

contract MakerMedianizerAdapter is Ownable {
    using LibMathUnsigned for uint256;
    using LibList for LibList.AddressList;

    IMakerMedianFeeder public feeder;
    uint256 public decimals;
    uint256 public converter;
    LibList.AddressList private whitelist;

    event AddWhitelisted(address indexed guy);
    event RemoveWhitelisted(address indexed guy);

    constructor(address _feeder, uint256 _decimals, uint256 _limit) public {
        feeder = IMakerMedianFeeder(_feeder);
        setDecimals(_decimals);
        whitelist.limit = _limit;
    }

    function setDecimals(uint256 _decimals) public onlyOwner {
        require(_decimals <= 18, "unsupported decimals");
        decimals = _decimals;
        converter = 10 ** (18 - _decimals);
    }

    function addWhitelisted(address guy) public onlyOwner {
        whitelist.add(guy);
        emit AddWhitelisted(guy);
    }

    function removeWhitelisted(address guy) public onlyOwner {
        whitelist.remove(guy);
        emit RemoveWhitelisted(guy);
    }

    function isWhitelisted(address guy) public view returns (bool) {
        return whitelist.has(guy);
    }

    function allWhitelisted() public view returns (address[] memory) {
        return whitelist.all();
    }

    function price() public view returns (uint256 newPrice, uint256 newTimestamp) {
        require(whitelist.has(msg.sender), "not whitelisted");
        newPrice = feeder.read().mul(converter);
        newTimestamp = uint256(feeder.age());
    }
}