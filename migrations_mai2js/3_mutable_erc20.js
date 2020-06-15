const BigNumber = require('bignumber.js');
const { toWad } = require('../test/constants');

const TestToken = artifacts.require('test/TestToken.sol');
const ShareToken = artifacts.require('token/ShareToken.sol');
const PriceFeeder = artifacts.require('test/TestPriceFeeder.sol');
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
    
    await deployer.deploy(ShareToken, "ShareToken", "STK", 18);
    await deployer.deploy(TestToken, "Test", "DAI", 18); ctk = TestToken.address;
    await deployer.deploy(PriceFeeder);
    await deployer.deploy(GlobalConfig);
    await deployer.deploy(Perpetual, GlobalConfig.address, dev, ctk, 18);
    await deployer.deploy(Proxy, Perpetual.address);
    await deployer.deploy(AMM, Proxy.address, PriceFeeder.address, ShareToken.address);
    await deployer.deploy(Exchange, GlobalConfig.address);
    console.log('  「 Address summary 」--------------------------------------');
    console.log('   > TestToken:      ', ctk);
    console.log('   > ShareToken:     ', ShareToken.address);
    console.log('   > PriceFeeder:    ', PriceFeeder.address);
    console.log('   > GlobalConfig:   ', GlobalConfig.address);
    console.log('   > Perpetual:      ', Perpetual.address);
    console.log('   > Proxy:          ', Proxy.address);
    console.log('   > AMM:            ', AMM.address);
    console.log('   > Exchange:       ', Exchange.address);
    console.log('');
    const shareToken = await ShareToken.deployed();
    const testToken = await TestToken.at(ctk);
    const priceFeeder = await PriceFeeder.deployed();
    const globalConfig = await GlobalConfig.deployed();
    const perpetual = await Perpetual.deployed();
    const proxy = await Proxy.deployed();
    const amm = await AMM.deployed();
    const exchange = await Exchange.deployed();

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

    console.log('feed price (test only)...');
    const price = (new BigNumber('1')).div('200').shiftedBy(18).dp(0, BigNumber.ROUND_DOWN);
    await priceFeeder.setPrice(price);

    const saver = require("./save_address.js");
    saver("transactTestAddress", {
        shareToken: ShareToken.address,
        testToken: TestToken.address,
        priceFeeder: PriceFeeder.address,
        globalConfig: GlobalConfig.address,
        perpetual: Perpetual.address,
        proxy: Proxy.address,
        amm: AMM.address,
        exchange: Exchange.address,
    });
};
