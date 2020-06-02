pragma solidity 0.5.17;

library LibAddressList {

    struct List {
        // max limit of address added to list
        uint256 limit;
        address[] addressList;
        mapping (address => bool) addresses;
    }

    /// @dev Get if an addresses is in list
    function has(List storage list, address _address) internal view returns (bool) {
        return list.addresses[_address];
    }

    /// @dev Get all addresses in list
    function all(List storage list) internal view returns (address[] memory) {
        return list.addressList;
    }

    /// @dev add Address into list
    /// @param list Storage of list
    /// @param _address Address to add
    function add(List storage list, address _address) internal {
        require(!list.addresses[_address], "duplicated");
        require(list.addressList.length < list.limit, "full");

        list.addresses[_address] = true;
        list.addressList.push(_address);
    }

    /// @dev remove Address from list
    /// @param list Storage of list
    /// @param _address Address to add
    function remove(List storage list, address _address) internal {
        require(list.addresses[_address], "not exist");

        delete list.addresses[_address];
        for (uint i = 0; i < list.addressList.length; i++){
            if(list.addressList[i] == _address) {
                list.addressList[i] = list.addressList[list.addressList.length - 1];
                list.addressList.length -= 1;
                break;
            }
        }
    }
}