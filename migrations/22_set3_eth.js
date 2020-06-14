const Exchange = artifacts.require('exchange/Exchange.sol');
const Perpetual = artifacts.require('perpetual/Perpetual.sol');
const Proxy = artifacts.require('proxy/Proxy.sol');
const GlobalConfig = artifacts.require('perpetual/GlobalConfig.sol');

module.exports = async function (deployer, network, accounts) {
    const exchange = await Exchange.deployed();
    const perpetual = await Perpetual.deployed();
    const proxy = await Proxy.deployed();
    const globalConfig = await GlobalConfig.deployed();

    console.log('whitelist 1');
    await globalConfig.addComponent(perpetual.address, proxy.address);

    console.log('whitelist 2');
    await globalConfig.addComponent(perpetual.address, exchange.address);
};
