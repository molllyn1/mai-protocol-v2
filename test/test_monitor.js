const assert = require('assert');
const BigNumber = require('bignumber.js');
const {
    increaseEvmBlock,
    toBytes32
} = require('./funcs');
const {
    toWad,
    fromWad,
    infinity
} = require('./constants');

const TestToken = artifacts.require('test/TestToken.sol');
const PriceFeeder = artifacts.require('test/TestPriceFeeder.sol');
const GlobalConfig = artifacts.require('perpetual/GlobalConfig.sol');
const Perpetual = artifacts.require('test/TestPerpetual.sol');
const AMM = artifacts.require('test/TestAMM.sol');
const Proxy = artifacts.require('proxy/PerpetualProxy.sol');
const ShareToken = artifacts.require('token/ShareToken.sol');

const gasLimit = 8000000;

const GlobalSettlementGuard = artifacts.require('test/GlobalSettlementGuard.sol');

contract('monitor', accounts => {

    let priceFeeder;
    let collateral;
    let globalConfig;
    let perpetual;
    let proxy;
    let amm;
    let share;

    const broker = accounts[9];
    const admin = accounts[0];
    const dev = accounts[1];

    const u1 = accounts[4];
    const u2 = accounts[5];
    const u3 = accounts[6];

    const users = {
        broker,
        admin,
        dev,
        u1,
        u2,
        u3,
    };

    const setIndexPrice = async price => {
        await priceFeeder.setPrice(toWad(price));

        // priceFeeder will modify index.timestamp, amm.timestamp should >= index.timestamp
        const index = await amm.indexPrice();
        await amm.setBlockTimestamp(index.timestamp);
    };

    const deploy = async () => {
        priceFeeder = await PriceFeeder.new();
        collateral = await TestToken.new("TT", "TestToken", 18);
        share = await ShareToken.new("ST", "STK", 18);
        globalConfig = await GlobalConfig.new();
        perpetual = await Perpetual.new(
            globalConfig.address,
            dev,
            collateral.address,
            18
        );
        proxy = await Proxy.new(perpetual.address);
        amm = await AMM.new(proxy.address, priceFeeder.address, share.address);
        await share.addMinter(amm.address);
        await share.renounceMinter();

        await perpetual.setGovernanceAddress(toBytes32("amm"), amm.address);
        await perpetual.addWhitelisted(proxy.address);
    };

    beforeEach(deploy);

    it("GlobalSettlementGuard", async () => {

        let guard = await GlobalSettlementGuard.new()
        await setIndexPrice(7000);

        try {
            await guard.beginGlobalSettlement(perpetual.address);
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("zero threshold"));
        }

        await guard.setThreshold(perpetual.address, toWad(10));
        try {
            await guard.beginGlobalSettlement(perpetual.address);
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("lower than threshold"));
        }

        let isAdmin = await guard.isAdministratorOf(perpetual.address);
        assert.ok(!isAdmin);

        await perpetual.addSocialLossPerContractPublic(1, toWad(10));
        try {
            await guard.beginGlobalSettlement(perpetual.address);
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("caller does not have the WhitelistAdmin role"));
        }

        await perpetual.addWhitelistAdmin(guard.address);
        isAdmin = await guard.isAdministratorOf(perpetual.address);
        assert.ok(isAdmin);

        await guard.beginGlobalSettlement(perpetual.address, { from: u1 });
    });
});