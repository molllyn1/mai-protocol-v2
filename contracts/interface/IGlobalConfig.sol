pragma solidity 0.5.15;

interface IGlobalConfig {

    function owner() external view returns (address);

    function isOwner() external view returns (bool);

    function renounceOwnership() external;

    function transferOwnership(address newOwner) external;

    function authorizedBrokers(address broker) external view returns (bool);

    function addAuthorizedBroker() external;

    function removeAuthorizedBroker() external;

    function isAuthorizedComponent(address component) external view returns (bool);

    function addAuthorizedComponent(address perpetual, address component) external;

    function removeAuthorizedComponent(address perpetual, address component) external;
}
