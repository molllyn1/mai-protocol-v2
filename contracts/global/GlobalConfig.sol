pragma solidity 0.5.15;

import "@openzeppelin/contracts/ownership/Ownable.sol";

import "../lib/LibList.sol";

contract GlobalConfig is Ownable {

    using LibList for mapping(address => bool);

    mapping(address => bool) public brokers;
    mapping(address => mapping(address => bool)) public components;
    mapping(address => mapping(address => bool)) public pauser;
    mapping(address => mapping(address => bool)) public pauseControllers;
    mapping(address => mapping(address => bool)) public withdrawControllers;

    event CreateGlobalConfig();
    event AddBroker(address indexed broker);
    event RemoveBroker(address indexed broker);
    event AddComponent(address indexed perpetual, address indexed component);
    event RemovedComponent(address indexed perpetual, address indexed component);
    event AddPauseController(address indexed controller);
    event RemovePauseController(address indexed controller);
    event AdddWithdrawControllers(address indexed controller);
    event RemovedWithdrawControllers(address indexed controller);

    constructor() public {
        emit CreateGlobalConfig();
    }

    function addBroker(address broker) external onlyOwner {
        brokers.add(broker);
        emit AddBroker(broker);
    }

    function removeBroker(address broker) external onlyOwner {
        brokers.remove(broker);
        emit RemoveBroker(broker);
    }

    function isComponent(address component) external view returns (bool) {
        return components[msg.sender][component];
    }
 
    function addComponent(address perpetual, address component) external onlyOwner {
        require(!components[perpetual][component], "component already exist");
        components[perpetual][component] = true;
        emit AddComponent(perpetual, component);
    }

    function removeComponent(address perpetual, address component) external onlyOwner {
        require(!components[perpetual][component], "component not exist");
        components[perpetual][component] = false;
        emit RemovedComponent(perpetual, component);
    }

    function addPauseController(address controller) external onlyOwner {
        require(!pauseControllers[controller], "controller already exist");
        pauseControllers[controller] = true;
        emit AddPauseController(controller);
    }

    function removePauseController(address controller) external onlyOwner {
        require(pauseControllers[controller], "controller not exist");
        pauseControllers[controller] = false;
        emit RemovePauseController(controller);
    }

    function addWithdrawController(address controller) external onlyOwner {
        require(!withdrawControllers[controller], "already exist");
        withdrawControllers[controller] = true;
        emit AdddWithdrawControllers(controller);
    }

    function removeWithdrawControllers(address controller) external onlyOwner {
        require(!withdrawControllers[controller], "already exist");
        withdrawControllers[controller] = false;
        emit RemovedWithdrawControllers(controller);
    }
}