pragma solidity 0.5.17;
pragma experimental ABIEncoderV2; // to enable structure-type parameter

import {LibMathSigned, LibMathUnsigned} from "../lib/LibMath.sol";


interface IWhitelist {
    function isWhitelisted(address guy) external view returns (bool);
}


contract ExchangeStorage {
    using LibMathSigned for int256;
    using LibMathUnsigned for uint256;

    event SetDelegate(address indexed perpetual, address indexed owner, address indexed delegate);
    event UnsetDelegate(address indexed perpetual, address indexed owner, address indexed lastDelegate);

    struct State {
        mapping(bytes32 => uint256) filled;
        mapping(bytes32 => bool) cancelled;
        mapping(address => address) delegates;
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

    function getDelegate(address perpetual, address owner) public view returns (address) {
        return states[perpetual].delegates[owner];
    }

    function isDelegate(
        address perpetual,
        address owner,
        address delegate
    ) public view returns (bool) {
        return getDelegate(perpetual, owner) == delegate;
    }

    function setDelegate(address perpetual, address delegate) external {
        require(!isDelegate(perpetual, msg.sender, delegate), "delegate already set");
        states[perpetual].delegates[msg.sender] = delegate;
        emit SetDelegate(perpetual, msg.sender, delegate);
    }

    function unsetDelegate(address perpetual) external {
        require(!isDelegate(perpetual, msg.sender, address(0x0)), "delegate unset");
        emit UnsetDelegate(perpetual, msg.sender, states[perpetual].delegates[msg.sender]);
        states[perpetual].delegates[msg.sender] = address(0x0);
    }
}
