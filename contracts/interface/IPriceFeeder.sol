pragma solidity 0.5.8;


interface IPriceFeeder {
    function price() external view returns (uint256 lastPrice, uint256 lastTimestamp);
}
