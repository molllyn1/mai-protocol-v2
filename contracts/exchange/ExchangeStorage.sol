pragma solidity 0.5.8;
pragma experimental ABIEncoderV2; // to enable structure-type parameter

import {LibMathSigned, LibMathUnsigned} from "../lib/LibMath.sol";


interface IWhitelist {
    function isWhitelisted(address guy) external view returns (bool);
}


contract ExchangeStorage {
    using LibMathSigned for int256;
    using LibMathUnsigned for uint256;

    event SetAgent(address indexed perpetual, address indexed owner, address indexed agent);
    event UnsetAgent(address indexed perpetual, address indexed owner, address indexed lastAgent);

    struct State {
        mapping(bytes32 => uint256) filled;
        mapping(bytes32 => bool) cancelled;
        mapping(address => address) agents;
    }

    mapping(address => State) states;

    constructor() public {}

    function isWhitelisted(address perpetual) public view returns (bool) {
        return IWhitelist(perpetual).isWhitelisted(msg.sender);
    }

    function filled(address perpetual, bytes32 orderHash) public view returns (uint256) {
        return states[perpetual].filled[orderHash];
    }

    function setFilled(
        address perpetual,
        bytes32 orderHash,
        uint256 amount
    ) external {
        require(isWhitelisted(perpetual), "caller not whitelisted");

        State storage state = states[perpetual];
        require(amount >= state.filled[orderHash], "decreasing filled");
        state.filled[orderHash] = state.filled[orderHash].add(amount);
    }

    function isCancelled(address perpetual, bytes32 orderHash) public view returns (bool) {
        return states[perpetual].cancelled[orderHash];
    }

    function setCancelled(address perpetual, bytes32 orderHash) external returns (uint256) {
        require(isWhitelisted(perpetual), "caller not whitelisted");
        states[perpetual].cancelled[orderHash] = true;
    }

    function getAgent(address perpetual, address owner) public view returns (address) {
        return states[perpetual].agents[owner];
    }

    function isAgent(
        address perpetual,
        address owner,
        address agent
    ) public view returns (bool) {
        return getAgent(perpetual, owner) == agent;
    }

    function setAgent(address perpetual, address agent) external {
        require(!isAgent(perpetual, msg.sender, agent), "agent already set");
        states[perpetual].agents[msg.sender] = agent;
        emit SetAgent(perpetual, msg.sender, agent);
    }

    function unsetAgent(address perpetual) external {
        require(!isAgent(perpetual, msg.sender, address(0x0)), "agent unset");
        emit UnsetAgent(perpetual, msg.sender, states[perpetual].agents[msg.sender]);
        states[perpetual].agents[msg.sender] = address(0x0);
    }
}
