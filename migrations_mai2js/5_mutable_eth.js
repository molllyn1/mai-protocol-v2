const BigNumber = require('bignumber.js');
const { toWad } = require('../test/constants');

const PriceFeeder = artifacts.require('test/TestPriceFeeder.sol');
const ShareToken = artifacts.require('token/ShareToken.sol');
const GlobalConfig = artifacts.require('perpetual/GlobalConfig.sol');
const Perpetual = artifacts.require('perpetual/Perpetual.sol');
const AMM = artifacts.require('liquidity/AMM.sol');
const Proxy = artifacts.require('proxy/Proxy.sol');
const Exchange = artifacts.require('exchange/Exchange.sol');

const toBytes32 = s => {
    return web3.utils.fromAscii(s);
};

module.exports = async function (deployer, network, accounts) {
    const dev = accounts[0];
    ctk = '0x0000000000000000000000000000000000000000';

    const priceFeeder = await PriceFeeder.deployed();
    const globalConfig = await GlobalConfig.deployed();

    await deployer.deploy(ShareToken, "ShareToken", "STK", 18);
    await deployer.deploy(Perpetual, globalConfig.address, dev, ctk, 18);
    await deployer.deploy(Proxy, Perpetual.address);
    await deployer.deploy(AMM, Proxy.address, priceFeeder.address, ShareToken.address);
    console.log('  「 Address summary 」--------------------------------------');
    console.log('   > ShareToken:     ', ShareToken.address);
    console.log('   > Perpetual:      ', Perpetual.address);
    console.log('   > Proxy:          ', Proxy.address);
    console.log('   > AMM:            ', AMM.address);
    console.log('');
    const perpetual = await Perpetual.deployed();
    const proxy = await Proxy.deployed();
    const amm = await AMM.deployed();
    const exchange = await Exchange.deployed();
    const shareToken = await ShareToken.deployed();

    console.log('default gov...');

    await perpetual.setGovernanceParameter(toBytes32("initialMarginRate"), toWad(0.10)); // 10%, should < 1
    await perpetual.setGovernanceParameter(toBytes32("maintenanceMarginRate"), toWad(0.05)); // 5%, should < initialMarginRate
    await perpetual.setGovernanceParameter(toBytes32("liquidationPenaltyRate"), toWad(0.005)); // 0.5%, should < maintenanceMarginRate
    await perpetual.setGovernanceParameter(toBytes32("penaltyFundRate"), toWad(0.005)); // 0.5%, should < maintenanceMarginRate
    await perpetual.setGovernanceParameter(toBytes32("takerDevFeeRate"), toWad(0.00075)); // 0.075%
    await perpetual.setGovernanceParameter(toBytes32("makerDevFeeRate"), toWad(-0.00025)); // -0.025%
    await perpetual.setGovernanceParameter(toBytes32("lotSize"), 1);
    await perpetual.setGovernanceParameter(toBytes32("tradingLotSize"), 1);

    await amm.setGovernanceParameter(toBytes32("poolFeeRate"), toWad(0.000375)); // 0.0375%
    await amm.setGovernanceParameter(toBytes32("poolDevFeeRate"), toWad(0.000375)); // 0.0375%
    await amm.setGovernanceParameter(toBytes32('emaAlpha'), '3327787021630616'); // 2 / (600 + 1)
    await amm.setGovernanceParameter(toBytes32("updatePremiumPrize"), toWad(0));
    await amm.setGovernanceParameter(toBytes32('markPremiumLimit'), toWad(0.005));
    await amm.setGovernanceParameter(toBytes32('fundingDampener'), toWad(0.0005));

    console.log('set minter...');
    await shareToken.addMinter(AMM.address);
    await shareToken.renounceMinter();

    console.log('set funding...');
    await perpetual.setGovernanceAddress(toBytes32("amm"), amm.address);

    console.log('whitelist');
    await perpetual.addWhitelisted(proxy.address);
    await perpetual.addWhitelisted(exchange.address);

    const saver = require("./save_address.js");
    saver("transactEthTestAddress", {
        testToken: "0x0000000000000000000000000000000000000000",
        priceFeeder: priceFeeder.address,
        globalConfig: globalConfig.address,
        shareToken: ShareToken.address,
        perpetual: Perpetual.address,
        proxy: Proxy.address,
        amm: AMM.address,
        exchange: Exchange.address,
    });
};
