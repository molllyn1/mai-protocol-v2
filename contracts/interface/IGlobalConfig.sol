pragma solidity 0.5.15;

interface IGlobalConfig {

    function authorizedBrokers(address broker) external view returns (bool);

    function addAuthorizedBroker() external;

    function removeAuthorizedBroker() external;
}
