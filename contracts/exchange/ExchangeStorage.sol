pragma solidity 0.5.15;
pragma experimental ABIEncoderV2; // to enable structure-type parameter

import "@openzeppelin/contracts/ownership/Ownable.sol";
import {LibMathSigned, LibMathUnsigned} from "../lib/LibMath.sol";

interface IWhitelist {
    function isWhitelisted(address guy) external view returns (bool);
}


contract ExchangeStorage is Ownable {
    using LibMathSigned for int256;
    using LibMathUnsigned for uint256;

    address public authorizedExchange;

    mapping(bytes32 => uint256) public filled;
    mapping(bytes32 => bool) public cancelled;
    mapping(address => mapping(address => address)) public delegates;

    event UpdateAuthorizedExchange(address indexed oldExchange, address indexed newExchange);
    event UpdateDelegate(address indexed owner, address indexed perpetual, address indexed delegate);

    constructor() public {}

    function setAuthorizedExchange(address newExchange) external onlyOwner {
        require(authorizedExchange != newExchange, "already authorized");
        emit UpdateAuthorizedExchange(authorizedExchange, newExchange);
        authorizedExchange = newExchange;
    }

    modifier authorizedExchangeOnly() {
        require(msg.sender == authorizedExchange, "unauthorized exchange");
        _;
    }

    function setFilled(bytes32 orderHash, uint256 amount)
        external
        authorizedExchangeOnly
    {
        require(amount >= filled[orderHash], "decreasing filled");
        filled[orderHash] = filled[orderHash].add(amount);
    }

    function setCancelled(bytes32 orderHash)
        external
        authorizedExchangeOnly
    {
        cancelled[orderHash] = true;
    }

    function getDelegate(address perpetual, address owner)
        public
        view
        returns (address)
    {
        return delegates[perpetual][owner];
    }

    function isDelegate(
        address perpetual,
        address owner,
        address delegate
    )
        public
        view
        returns (bool)
    {
        return getDelegate(perpetual, owner) == delegate;
    }

    function setDelegate(address perpetual, address delegate) public {
        require(!isDelegate(perpetual, msg.sender, delegate), "delegate already set");
        delegates[perpetual][msg.sender] = delegate;
        emit UpdateDelegate(perpetual, msg.sender, delegate);
    }

    function unsetDelegate(address perpetual) public {
        setDelegate(perpetual, address(0x0));
    }
}
