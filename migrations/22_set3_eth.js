const Exchange = artifacts.require('exchange/Exchange.sol');
const Perpetual = artifacts.require('perpetual/Perpetual.sol');
const Proxy = artifacts.require('proxy/Proxy.sol');

module.exports = async function (deployer, network, accounts) {
    const exchange = await Exchange.deployed();
    const perpetual = await Perpetual.deployed();
    const proxy = await Proxy.deployed();

    console.log('whitelist 1');
    await perpetual.addWhitelisted(proxy.address);

    console.log('whitelist 2');
    await perpetual.addWhitelisted(exchange.address);
};
