const TestToken = artifacts.require('test/TestToken.sol');
const GlobalConfig = artifacts.require('perpetual/GlobalConfig.sol');
const Perpetual = artifacts.require('perpetual/Perpetual.sol');

module.exports = async function (deployer, network, accounts) {
    const dev = accounts[0];
    const globalConfig = await GlobalConfig.deployed();
    const ctk = await TestToken.deployed();
    const ctkAddress = ctk.address;
    
    await deployer.deploy(Perpetual, globalConfig.address, dev, ctkAddress, 18);
};
