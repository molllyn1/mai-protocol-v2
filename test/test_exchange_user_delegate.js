const assert = require('assert');
const {
    initializeToken,
    call,
    send,
    increaseEvmBlock,
    toBytes32
} = require('./funcs');
const {
    toWad,
    fromWad,
    infinity,
    Side
} = require('./constants');
const {
    buildOrder,
    getOrderHash
} = require('./order');

const TestToken = artifacts.require('test/TestToken.sol');
const TestFundingMock = artifacts.require('test/TestFundingMock.sol');
const Perpetual = artifacts.require('test/TestPerpetual.sol');
const GlobalConfig = artifacts.require('perpetual/GlobalConfig.sol');
const Exchange = artifacts.require('exchange/Exchange.sol');

contract('exchange-user', accounts => {
    const FLAT = 0;
    const SHORT = 1;
    const LONG = 2;

    let collateral;
    let globalConfig;
    let funding;
    let perpetual;
    let exchange;

    const broker = accounts[9];
    const admin = accounts[0];
    const dev = accounts[1];

    const u1 = accounts[4];
    const u2 = accounts[5];
    const u3 = accounts[6];
    const u4 = accounts[7];

    const users = {
        broker,
        admin,
        u1,
        u2,
        u3,
        u4,
    };

    const increaseBlockBy = async (n) => {
        for (let i = 0; i < n; i++) {
            await increaseEvmBlock();
        }
    };

    const deploy = async (cDecimals = 18, pDecimals = 18) => {
        collateral = await TestToken.new("TT", "TestToken", cDecimals);
        globalConfig = await GlobalConfig.new();
        funding = await TestFundingMock.new();
        exchange = await Exchange.new(globalConfig.address);
        perpetual = await Perpetual.new(
            globalConfig.address,
            dev,
            collateral.address,
            cDecimals
        );
        await perpetual.setGovernanceAddress(toBytes32("amm"), funding.address);

        await globalConfig.addBroker(admin);
        await globalConfig.addComponent(perpetual.address, exchange.address);
    };

    const setDefaultGovParameters = async () => {
        await perpetual.setGovernanceParameter(toBytes32("initialMarginRate"), toWad(0.1));
        await perpetual.setGovernanceParameter(toBytes32("maintenanceMarginRate"), toWad(0.05));
        await perpetual.setGovernanceParameter(toBytes32("liquidationPenaltyRate"), toWad(0.005));
        await perpetual.setGovernanceParameter(toBytes32("penaltyFundRate"), toWad(0.005));
        await perpetual.setGovernanceParameter(toBytes32("takerDevFeeRate"), toWad(0.01));
        await perpetual.setGovernanceParameter(toBytes32("makerDevFeeRate"), toWad(0.02));
        await perpetual.setGovernanceParameter(toBytes32("lotSize"), 1);
        await perpetual.setGovernanceParameter(toBytes32("tradingLotSize"), 1);
    };

    beforeEach(async () => {
        await deploy();
        await setDefaultGovParameters();
    });

    const initialize = async (account, amount) => {
        await collateral.transfer(account, toWad(amount));
        await collateral.approve(perpetual.address, infinity, {
            from: account
        });
        await perpetual.deposit(toWad(amount), {
            from: account
        });
        assert.equal(fromWad(await cashBalanceOf(account)), amount);
    };

    const positionSize = async (user) => {
        const positionAccount = await perpetual.getMarginAccount(user);
        return positionAccount.size;
    }

    const positionEntryValue = async (user) => {
        const positionAccount = await perpetual.getMarginAccount(user);
        return positionAccount.entryValue;
    }

    const cashBalanceOf = async (user) => {
        const cashAccount = await perpetual.getMarginAccount(user);
        return cashAccount.cashBalance;
    }

    it("exceptions", async () => {
        assert.ok(!(await exchange.isDelegator(u1, perpetual.address, u3)));

        await exchange.setDelegator(perpetual.address, u3, { from: u1 });
        assert.ok(await exchange.isDelegator(u1, perpetual.address, u3));
        try {
            await exchange.setDelegator(perpetual.address, u3, { from: u1 });
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("delegate already set"));
        }

        await exchange.unsetDelegator(perpetual.address, { from: u1 });
        assert.ok(!(await exchange.isDelegator(u1, perpetual.address, u3)));
        try {
            await exchange.unsetDelegator(perpetual.address, { from: u1 });
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("delegate not set"));
        }

    });


    it("delegate trade 1v1", async () => {
        await collateral.transfer(u1, toWad(10000));
        await collateral.approve(perpetual.address, infinity, {
            from: u1
        });
        await perpetual.deposit(toWad(10000), {
            from: u1
        });
        assert.equal(fromWad(await cashBalanceOf(u1)), 10000);

        await collateral.transfer(u2, toWad(10000));
        await collateral.approve(perpetual.address, infinity, {
            from: u2
        });
        await perpetual.deposit(toWad(10000), {
            from: u2
        });
        assert.equal(fromWad(await cashBalanceOf(u2)), 10000);


        await funding.setMarkPrice(toWad(6000));


        const takerParam = await buildOrder({
            trader: u1,
            amount: 1,
            price: 6000,
            version: 2,
            side: 'sell',
            type: 'limit',
            expiredAtSeconds: 86400,
            makerFeeRate: 1000,
            takerFeeRate: 1000,
            salt: 666,
        }, perpetual.address, admin, u3);

        const makerParam = await buildOrder({
            trader: u2,
            amount: 1,
            price: 6000,
            version: 2,
            side: 'buy',
            type: 'limit',
            expiredAtSeconds: 86400,
            makerFeeRate: 1000,
            takerFeeRate: 1000,
            salt: 666,
        }, perpetual.address, admin);

        // await exchange.setDelegator(perpetual.address, u3, { from: u1 });
        try {
            await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(1)]);
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("invalid signature"));
        }
        await exchange.setDelegator(perpetual.address, u3, { from: u1 });
        await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(1)]);

        assert.equal(fromWad(await cashBalanceOf(u1)), 9880);
        assert.equal(fromWad(await positionEntryValue(u1)), 6000);
        assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 300);
        assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 9280);

        assert.equal(fromWad(await cashBalanceOf(u2)), 9820);
        assert.equal(fromWad(await positionEntryValue(u2)), 6000);
        assert.equal(fromWad(await perpetual.maintenanceMargin.call(u2)), 300);
        assert.equal(fromWad(await perpetual.availableMargin.call(u2)), 9220);

        assert.equal(fromWad(await cashBalanceOf(u3)), 0);
        assert.equal(fromWad(await positionEntryValue(u3)), 0);
        assert.equal(fromWad(await perpetual.maintenanceMargin.call(u3)), 0);
        assert.equal(fromWad(await perpetual.availableMargin.call(u3)), 0);

        assert.equal(fromWad(await cashBalanceOf(admin)), 120);
        assert.equal(fromWad(await cashBalanceOf(dev)), 180);
    });


    it("dev fee", async () => {
        await perpetual.setGovernanceParameter(toBytes32("takerDevFeeRate"), toWad(0.01));
        await perpetual.setGovernanceParameter(toBytes32("makerDevFeeRate"), toWad(0.02));

        await collateral.transfer(u1, toWad(1000));
        await collateral.approve(perpetual.address, infinity, { from: u1 });
        await collateral.transfer(u2, toWad(1000));
        await collateral.approve(perpetual.address, infinity, { from: u2 });

        await perpetual.deposit(toWad(1000), { from: u1 });
        await perpetual.deposit(toWad(1000), { from: u2 });

        await funding.setMarkPrice(toWad(6000));
        var takerParam = await buildOrder({
            trader: u1,
            amount: 1,
            price: 6000,
            version: 2,
            side: 'sell',
            type: 'limit',
            expiredAtSeconds: 86400,
            makerFeeRate: 1000,
            takerFeeRate: 1000,
            salt: 666,
        }, perpetual.address, admin, u3);

        var makerParam = await buildOrder({
            trader: u2,
            amount: 1,
            price: 6000,
            version: 2,
            side: 'buy',
            type: 'limit',
            expiredAtSeconds: 86400,
            makerFeeRate: 1000,
            takerFeeRate: 1000,
            salt: 666,
        }, perpetual.address, admin);

        // await exchange.setDelegator(perpetual.address, u3, { from: u1 });
        await exchange.setDelegator(perpetual.address, u3, { from: u1 });
        await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(1)]);

        await funding.setMarkPrice(toWad(5500));
        console.log(await perpetual.isIMSafe.call(u2));
        console.log(await perpetual.isSafe.call(u2));

        var takerParam = await buildOrder({
            trader: u1,
            amount: 1,
            price: 6000,
            version: 2,
            side: 'buy',
            type: 'limit',
            expiredAtSeconds: 86400,
            makerFeeRate: 1000,
            takerFeeRate: 1000,
            salt: 666,
        }, perpetual.address, admin, u3);

        var makerParam = await buildOrder({
            trader: u2,
            amount: 1,
            price: 6000,
            version: 2,
            side: 'sell',
            type: 'limit',
            expiredAtSeconds: 86400,
            makerFeeRate: 1000,
            takerFeeRate: 1000,
            salt: 666,
        }, perpetual.address, admin);

        await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(1)]);
    });

    it("dev fee - H01 - open/close", async () => {
        await perpetual.setGovernanceParameter(toBytes32("takerDevFeeRate"), toWad(0.01));
        await perpetual.setGovernanceParameter(toBytes32("makerDevFeeRate"), toWad(0.01));

        await collateral.transfer(u1, toWad(1000));
        await collateral.approve(perpetual.address, infinity, { from: u1 });
        await collateral.transfer(u2, toWad(1000));
        await collateral.approve(perpetual.address, infinity, { from: u2 });

        // @6000, u1 = 600, u2 = 600
        await perpetual.deposit(toWad(660), { from: u1 });
        await perpetual.deposit(toWad(660), { from: u2 });
        await funding.setMarkPrice(toWad(6000));
        var takerParam = await buildOrder({
            trader: u1,
            amount: 1,
            price: 6000,
            version: 2,
            side: 'sell',
            type: 'limit',
            expiredAtSeconds: 86400,
            makerFeeRate: 0,
            takerFeeRate: 0,
            salt: 666,
        }, perpetual.address, admin);
        var makerParam = await buildOrder({
            trader: u2,
            amount: 1,
            price: 6000,
            version: 2,
            side: 'buy',
            type: 'limit',
            expiredAtSeconds: 86400,
            makerFeeRate: 0,
            takerFeeRate: 0,
            salt: 666,
        }, perpetual.address, admin);
        await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(1)]);
        assert.equal(fromWad(await perpetual.marginBalance.call(u1)), 600);
        assert.equal(fromWad(await perpetual.marginBalance.call(u2)), 600);

        // @6539.9, u1 ~= 60.099, u2 ~= 1139.899
        await funding.setMarkPrice(toWad(6539.9));
        // u1 cannot open
        var takerParam = await buildOrder({
            trader: u1,
            amount: 0.1,
            price: 6000,
            version: 2,
            side: 'sell',
            type: 'limit',
            expiredAtSeconds: 86400,
            makerFeeRate: 1000,
            takerFeeRate: 1000,
            salt: 666,
        }, perpetual.address, admin);

        var makerParam = await buildOrder({
            trader: u2,
            amount: 0.1,
            price: 6000,
            version: 2,
            side: 'buy',
            type: 'limit',
            expiredAtSeconds: 86400,
            makerFeeRate: 1000,
            takerFeeRate: 1000,
            salt: 666,
        }, perpetual.address, admin);

        try {
            await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(0.1)]);
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("available margin too low for fee"));
        }

        // @6580, u1 ~= 20, u2 ~= 1180
        await funding.setMarkPrice(toWad(6580));
        // u1 cannot open
        var takerParam = await buildOrder({
            trader: u1,
            amount: 1,
            price: 6000,
            version: 2,
            side: 'buy',
            type: 'limit',
            expiredAtSeconds: 86400,
            makerFeeRate: 1000,
            takerFeeRate: 1000,
            salt: 666,
        }, perpetual.address, admin);

        var makerParam = await buildOrder({
            trader: u2,
            amount: 1,
            price: 6000,
            version: 2,
            side: 'sell',
            type: 'limit',
            expiredAtSeconds: 86400,
            makerFeeRate: 1000,
            takerFeeRate: 1000,
            salt: 666,
        }, perpetual.address, admin);
        await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(1)]);
    });

    it("dev fee - H01 - close + open", async () => {
        await perpetual.setGovernanceParameter(toBytes32("takerDevFeeRate"), toWad(0.01));
        await perpetual.setGovernanceParameter(toBytes32("makerDevFeeRate"), toWad(0.01));

        await collateral.transfer(u1, toWad(1000));
        await collateral.approve(perpetual.address, infinity, { from: u1 });
        await collateral.transfer(u2, toWad(1000));
        await collateral.approve(perpetual.address, infinity, { from: u2 });

        // @6000, u1 = 600, u2 = 600
        await perpetual.deposit(toWad(660), { from: u1 });
        await perpetual.deposit(toWad(660), { from: u2 });
        await funding.setMarkPrice(toWad(6000));
        var takerParam = await buildOrder({
            trader: u1,
            amount: 1,
            price: 6000,
            version: 2,
            side: 'sell',
            type: 'limit',
            expiredAtSeconds: 86400,
            makerFeeRate: 0,
            takerFeeRate: 0,
            salt: 666,
        }, perpetual.address, admin);
        var makerParam = await buildOrder({
            trader: u2,
            amount: 1,
            price: 6000,
            version: 2,
            side: 'buy',
            type: 'limit',
            expiredAtSeconds: 86400,
            makerFeeRate: 0,
            takerFeeRate: 0,
            salt: 666,
        }, perpetual.address, admin);
        await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(1)]);
        assert.equal(fromWad(await perpetual.marginBalance.call(u1)), 600);
        assert.equal(fromWad(await perpetual.marginBalance.call(u2)), 600);

        // @6533.9, u1 ~= 66.099
        // - expect dev fee = 6533.9 * 1.1 * 0.01 = 71.8729
        // - avail margin = 0
        // - actual dev fee = 0
        await funding.setMarkPrice(toWad(6533.9));
        var takerParam = await buildOrder({
            trader: u1,
            amount: 1.1,
            price: 6533.9,
            version: 2,
            side: 'buy',
            type: 'limit',
            expiredAtSeconds: 86400,
            makerFeeRate: 0,
            takerFeeRate: 0,
            salt: 666,
        }, perpetual.address, admin);
        var makerParam = await buildOrder({
            trader: u2,
            amount: 1.1,
            price: 6533.9,
            version: 2,
            side: 'sell',
            type: 'limit',
            expiredAtSeconds: 86400,
            makerFeeRate: 0,
            takerFeeRate: 0,
            salt: 666,
        }, perpetual.address, admin);
        await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(1)]);

        // 66.099999999999999999 - 65.339 = 0.760999999999999999
        assert.equal(await perpetual.availableMargin.call(u1), 760999999999999999);
    });
});