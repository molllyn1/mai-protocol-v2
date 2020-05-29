pragma solidity 0.5.8;


// see https://github.com/makerdao/median/blob/master/src/median.sol
interface IMakerMedianFeeder {
    function peek() external view returns (uint256, bool);

    function read() external view returns (uint256);

    function age() external view returns (uint32);
}
