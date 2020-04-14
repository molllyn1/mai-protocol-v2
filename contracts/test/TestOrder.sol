pragma solidity ^0.5.2;
pragma experimental ABIEncoderV2; // to enable structure-type parameter

import "../lib/LibOrder.sol";
import "../lib/LibSignature.sol";
import "../perpetual/Perpetual.sol";


contract TestOrder {
    using LibOrder for LibOrder.OrderParam;
    using LibOrder for LibOrder.Order;
    using LibSignature for LibSignature.OrderSignature;

    function getOrder(LibOrder.OrderParam memory orderParam, address perpetual, address broker)
        public
        pure
        returns (LibOrder.Order memory order)
    {
        order = orderParam.getOrder(perpetual, broker);
    }

    function hashOrder(LibOrder.Order memory order) public pure returns (bytes32) {
        return order.hashOrder();
    }

    function getOrderHash(LibOrder.OrderParam memory orderParam, address perpetual, address broker)
        public
        pure
        returns (bytes32)
    {
        return orderParam.getOrderHash(perpetual, broker);
    }

    function getOrderHash(LibOrder.Order memory order) public pure returns (bytes32) {
        return order.getOrderHash();
    }

    function getOrderExpiredAt(LibOrder.OrderParam memory orderParam) public pure returns (uint256) {
        return orderParam.getExpiredAt();
    }

    function isValidSignature(LibOrder.OrderParam memory orderParam, bytes32 orderHash) public pure returns (bool) {
        return orderParam.signature.isValidSignature(orderHash, orderParam.trader);
    }
}
