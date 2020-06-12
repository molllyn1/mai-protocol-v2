pragma solidity 0.5.15;

import "@openzeppelin/contracts/ownership/Ownable.sol";


contract GlobalConfig is Ownable {

    mapping (address => bool) public authorizedBrokers;

    event CreateGlobalConfig();
    event AddAuthorizedBroker(address indexed broker);
    event RemoveAuthorizedBroker(address indexed broker);

    constructor() public {
        emit CreateGlobalConfig();
    }

    function addAuthorizedBroker(address broker) external onlyOwner {
        require(!authorizedBrokers[broker], "already added");
        authorizedBrokers[broker] = true;
        emit AddAuthorizedBroker(broker);
    }

    function removeAuthorizedBroker(address broker) external onlyOwner {
        require(authorizedBrokers[broker], "not added");
        authorizedBrokers[broker] = false;
        emit RemoveAuthorizedBroker(broker);
    }

}