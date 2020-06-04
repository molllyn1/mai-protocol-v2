pragma solidity 0.5.17;

import "@openzeppelin/contracts/access/roles/WhitelistedRole.sol";

import "../lib/LibAddressList.sol";

contract ComponentConfig {
    using LibAddressList for LibAddressList.List;

    // perpetual => ( name => component )
    mapping (address => mapping (bytes32 => address)) public components;

    function isAuthorizedComponent() public view returns (bool) {
        return authorizedComponents.has(msg.sender);
    }

    function upgradeComponent(address perpetual, bytes32 name, address componenet) internal {
    }

}