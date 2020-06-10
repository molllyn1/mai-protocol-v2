pragma solidity 0.5.15;

import "@openzeppelin/contracts/token/ERC20/ERC20Mintable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Detailed.sol";

contract ShareToken is ERC20Mintable, ERC20Detailed {

    constructor(string memory _name, string memory _symbol, uint8 _decimals)
        ERC20Detailed(_name, _symbol, _decimals)
        public
    {
    }

    function burn(address account, uint256 amount) public onlyMinter returns (bool) {
        _burn(account, amount);
        return true;
    }
}
