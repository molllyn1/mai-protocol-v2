pragma solidity 0.5.17;
pragma experimental ABIEncoderV2; // to enable structure-type parameter

import "@openzeppelin/contracts/ownership/Ownable.sol";
import "../lib/LibList.sol";

interface IRegistry {
    function register(address newPerpetual) external;
}

interface IDeployer {
    function deploy() external;
}

contract PerpetualDeployer {

    address public globalConfiguration;

    constructor(address _globalConfiguration) public {
        globalConfiguration = _globalConfiguration;
    }

    function deploy() external {
        address perpetual = new Perpetual(globalConfiguration);
        IRegistry(globalConfiguration).register(perpetual);
    }
}

contract Administration is Ownable {
    // owner is the adminstrator
}

contract DeployConfiguration is Administration {
    address public deployer;

    event SetDeployer(address indexed previous, address indexed current);

    modifier onlyDeployer() {
        require(deploy == msg.sender, "not deployer");
        _;
    }

    function setDeployer(address _deployer) external onlyOwner {
        emit SetDeployer(deployer, _deployer);
        deployer = _deployer;
    }

    function deploy() external onlyOwner {
        IDeployer(deployer).deploy();
    }
}

contract PerpetualConfiguation is DeployConfiguration {
    using LibList for LibList.AddressList;

    uint256 public withdrawalLockBlockCount;
    uint256 public brokerLockBlockCount;
    LibList.AddressList public perpetuals;

    constructor () public {
        applications.initialize(64);
    }

    event UpdateGlobalParameter(bytes32 indexed key, bytes32 value);
    event RegisterPerpetual(address indexed perpetual)

    function setGlobalParameter(bytes32 key, bytes32 value) external onlyOwner {
        if (key == "withdrawalLockBlockCount") {
            withdrawalLockBlockCount = uint256(value);
        } else if (key == "brokerLockBlockCount") {
            brokerLockBlockCount = uint256(value);
        } else {
            revert("key not exists");
        }
        emit UpdateGlobalParameter(key, value);
    }

    function register(address newPerpetual) external onlyDeployer {
        perpetuals.add(newPerpetual);
        emit RegisterPerpetual(newPerpetual);
    }
}

contract ComponentConfiguration is PerpetualConfiguation {

}