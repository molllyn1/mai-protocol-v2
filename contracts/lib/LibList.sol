pragma solidity 0.5.15;

library LibList {
    /// @dev add Address into list
    /// @param list Storage of list
    /// @param target Address to add
    function add(mapping(address => bool) storage list, address target) internal {
        require(!list[target], "address already exist");
        list[target] = true;
    }

    /// @dev remove Address from list
    /// @param list Storage of mapping(address => bool)
    /// @param target Address to add
    function remove(mapping(address => bool) storage list, address target) internal {
        require(list[target], "address not exist");
        delete list[target];
    }
}