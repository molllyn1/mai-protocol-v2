const Exchange = artifacts.require('exchange/Exchange.sol');
const Perpetual = artifacts.require('perpetual/Perpetual.sol');
const Proxy = artifacts.require('proxy/Proxy.sol');
const GlobalConfig = artifacts.require('global/GlobalConfig.sol');
const AMM = artifacts.require('liquidity/AMM.sol');

module.exports = async function (deployer, network, accounts) {
    const exchange = await Exchange.deployed();
    const perpetual = await Perpetual.deployed();
    const proxy = await Proxy.deployed();
    const globalConfig = await GlobalConfig.deployed();
    const amm = await AMM.deployed()

    console.log('whitelist perpetual -> proxy');
    await globalConfig.addComponent(perpetual.address, proxy.address);

    console.log('whitelist perpetual -> exchange');
    await globalConfig.addComponent(perpetual.address, exchange.address);

    console.log('whitelist amm -> exchange');
    await globalConfig.addComponent(amm.address, exchange.address);
};
