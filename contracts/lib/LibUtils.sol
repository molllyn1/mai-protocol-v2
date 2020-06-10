pragma solidity 0.5.15;

library LibUtils {
    function toAddress(bytes32 b) internal pure returns (address) {
        return address(uint160(uint256(b)));
    }

    function toBytes32(address a) internal pure returns (bytes32) {
        return bytes32(uint256(a));
    }
}
