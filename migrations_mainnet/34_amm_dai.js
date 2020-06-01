const PriceFeeder = artifacts.require('test/TestPriceFeeder.sol');
const ShareToken = artifacts.require('token/ShareToken.sol');
const Perpetual = artifacts.require('perpetual/Perpetual.sol');
const AMM = artifacts.require('liquidity/AMM.sol');
const Proxy = artifacts.require('proxy/PerpetualProxy.sol');

module.exports = async function (deployer, network, accounts) {
    const priceFeeder = await PriceFeeder.deployed();
    const shareToken = await ShareToken.deployed();
    const perpetual = await Perpetual.deployed();
    const proxy = await Proxy.deployed();

    await deployer.deploy(AMM, proxy.address, priceFeeder.address, shareToken.address);

    const amm = await AMM.deployed();
    console.log('  「 Address summary 」--------------------------------------');
    console.log('   > shareToken:     ', shareToken.address);
    console.log('   > perpetual:      ', perpetual.address);
    console.log('   > proxy:          ', proxy.address);
    console.log('   > amm:            ', amm.address);
    console.log('');
};