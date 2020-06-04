pragma solidity 0.5.17;

import "@openzeppelin/contracts/ownership/Ownable.sol";

import "../lib/LibAddressList.sol";

contract GlobalConfig is Ownable {
    using LibAddressList for LibAddressList.List;

    // block delays when submiting withdrawal apllication to withdraw
    uint256 public withdrawalLockBlockCount;
    uint256 public brokerLockBlockCount;

    LibAddressList.List private perpetuals;
    mapping (address => LibAddressList.List) private authroziedComponents;

    event CreateGlobalConfig();
    event UpdateGlobalParameter(bytes32 indexed key, uint256 value);

    constructor() public {
        emit CreateGlobalConfig();
    }

    function setGlobalParameter(bytes32 key, uint256 value) public onlyWhitelistAdmin {
        if (key == "withdrawalLockBlockCount") {
            withdrawalLockBlockCount = value;
        } else if (key == "brokerLockBlockCount") {
            brokerLockBlockCount = value;
        } else {
            revert("key not exists");
        }
        emit UpdateGlobalParameter(key, value);
    }

    function authenticateComponent(address perpetual, address component) external {
        require(perpetuals.has(perpetual), "unknown perpetual");
        authroziedComponents[perpetual].add(componet);
    }

    function invalidateComponent(address perpetual, address component) external {
        require(perpetuals.has(perpetual), "unknown perpetual");
        authroziedComponents[perpetual].remove(componet);
    }

    function isAuthorizedComponent(address componet) external view returns (bool) {
        require(perpetuals.has(msg.sender), "unknown perpetual");
        return authroziedComponents[msg.sender].has(componet);
    }
}