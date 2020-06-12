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
    let global;
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
        global = await GlobalConfig.new();
        funding = await TestFundingMock.new();
        exchange = await Exchange.new();
        perpetual = await Perpetual.new(
            global.address,
            dev,
            collateral.address,
            cDecimals
        );
        await perpetual.setGovernanceAddress(toBytes32("amm"), funding.address);

        await perpetual.addWhitelisted(exchange.address);
        await perpetual.addWhitelisted(admin);
        await perpetual.setBroker(admin, {
            from: u1
        });
        await perpetual.setBroker(admin, {
            from: u2
        });
        await perpetual.setBroker(admin, {
            from: u3
        });
        await perpetual.setBroker(admin, {
            from: u4
        });

        await increaseBlockBy(4);
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
        await perpetual.setBroker(admin, {
            from: account
        });
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

    describe("exceptions", async () => {
        it("wrong status", async () => {
            await initialize(u1, 10000);
            await initialize(u2, 10000);
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
            }, perpetual.address, admin);

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

            await perpetual.beginGlobalSettlement(toWad(6700));

            try {
                await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(1)]);
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("wrong perpetual status"));
            }

            await perpetual.endGlobalSettlement();

            try {
                await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(1)]);
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("wrong perpetual status"));
            }
        });

        it("self trade", async () => {
            await initialize(u1, 10000);
            await initialize(u2, 10000);
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
            }, perpetual.address, admin);

            const makerParam = await buildOrder({
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
            try {
                await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(1)]);
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("self trade"));
            }
        });

        it("invalid side", async () => {
            await initialize(u1, 10000);
            await initialize(u2, 10000);
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
            }, perpetual.address, admin);

            const makerParam = await buildOrder({
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
            try {
                await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(1)]);
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("invalid side"));
            }
        });

        it("market order cannot be maker", async () => {
            await initialize(u1, 10000);
            await initialize(u2, 10000);
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
            }, perpetual.address, admin);

            const makerParam = await buildOrder({
                trader: u2,
                amount: 1,
                price: 6000,
                version: 2,
                side: 'buy',
                type: 'market',
                expiredAtSeconds: 86400,
                makerFeeRate: 1000,
                takerFeeRate: 1000,
                salt: 666,
            }, perpetual.address, admin);
            try {
                await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(1)]);
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("market order cannot be maker"));
            }
        });

        it("taker overfilled", async () => {
            await initialize(u1, 10000);
            await initialize(u2, 10000);
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
            }, perpetual.address, admin);

            const makerParam = await buildOrder({
                trader: u2,
                amount: 2,
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
                await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(2)]);
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("taker overfilled"), error);
            }
        });

        it("maker overfilled", async () => {
            await initialize(u1, 10000);
            await initialize(u2, 10000);
            await funding.setMarkPrice(toWad(6000));

            const takerParam = await buildOrder({
                trader: u1,
                amount: 2,
                price: 6000,
                version: 2,
                side: 'sell',
                type: 'limit',
                expiredAtSeconds: 86400,
                makerFeeRate: 1000,
                takerFeeRate: 1000,
                salt: 666,
            }, perpetual.address, admin);

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
            try {
                await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(2)]);
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("maker overfilled"), error);
            }
        });

        it("invalid trading lot size", async () => {
            await initialize(u1, 10000);
            await initialize(u2, 10000);
            await perpetual.setGovernanceParameter(toBytes32("tradingLotSize"), toWad(10));
            await funding.setMarkPrice(toWad(6000));

            const takerParam = await buildOrder({
                trader: u1,
                amount: 2,
                price: 6000,
                version: 2,
                side: 'sell',
                type: 'market',
                expiredAtSeconds: 86400,
                makerFeeRate: 1000,
                takerFeeRate: 1000,
                salt: 666,
            }, perpetual.address, admin);

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

            try {
                await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(1)]);
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("invalid trading lot size"), error);
            }
        });

        it("maker margin", async () => {
            await initialize(u1, 10000);
            await initialize(u2, 580);
            await funding.setMarkPrice(toWad(6000));
            await perpetual.setGovernanceParameter(toBytes32("takerDevFeeRate"), toWad(0.01));
            await perpetual.setGovernanceParameter(toBytes32("makerDevFeeRate"), toWad(0));

            const takerParam = await buildOrder({
                trader: u1,
                amount: 2,
                price: 6000,
                version: 2,
                side: 'sell',
                type: 'market',
                expiredAtSeconds: 86400,
                makerFeeRate: 1000,
                takerFeeRate: 1000,
                salt: 666,
            }, perpetual.address, admin);

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

            try {
                await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(1)]);
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("maker margin"), error);
            }
        });

        it("cancel order", async () => {
            const takerParam = await buildOrder({
                trader: u1,
                amount: 2,
                price: 6000,
                version: 2,
                side: 'sell',
                type: 'market',
                expiredAtSeconds: 86400,
                makerFeeRate: 1000,
                takerFeeRate: 1000,
                salt: 666,
            }, perpetual.address, admin);
            try {
                await exchange.cancelOrder(takerParam, { from: u2 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("invalid caller"), error);
            }
        });

        it("cancel order - taker", async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u1
            });
            await perpetual.deposit(toWad(10000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);
            await perpetual.setBroker(admin, {
                from: u1
            });

            await collateral.transfer(u2, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u2
            });
            await perpetual.deposit(toWad(10000), {
                from: u2
            });
            assert.equal(fromWad(await cashBalanceOf(u2)), 10000);
            await perpetual.setBroker(admin, {
                from: u2
            });

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
            }, perpetual.address, admin);

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

            await exchange.cancelOrder(takerParam);

            try {
                await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(1)]);
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("cancelled order"), error);
            }
        });

        it("cancel order - maker", async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u1
            });
            await perpetual.deposit(toWad(10000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);
            await perpetual.setBroker(admin, {
                from: u1
            });

            await collateral.transfer(u2, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u2
            });
            await perpetual.deposit(toWad(10000), {
                from: u2
            });
            assert.equal(fromWad(await cashBalanceOf(u2)), 10000);
            await perpetual.setBroker(admin, {
                from: u2
            });

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
            }, perpetual.address, admin);

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

            await exchange.cancelOrder(makerParam);

            try {
                await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(1)]);
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("cancelled order"), error);
            }
        });

        it("taker margin", async () => {
            await initialize(u1, 580);
            await initialize(u2, 5800);
            await funding.setMarkPrice(toWad(6000));
            await perpetual.setGovernanceParameter(toBytes32("takerDevFeeRate"), toWad(0));
            await perpetual.setGovernanceParameter(toBytes32("makerDevFeeRate"), toWad(0.01));

            const takerParam = await buildOrder({
                trader: u1,
                amount: 2,
                price: 6000,
                version: 2,
                side: 'sell',
                type: 'market',
                expiredAtSeconds: 86400,
                makerFeeRate: 1000,
                takerFeeRate: 1000,
                salt: 666,
            }, perpetual.address, admin);

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

            try {
                await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(1)]);
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("taker margin"), error);
            }
        });

        it("dev safe", async () => {
            await initialize(u1, 660);
            await initialize(u2, 5800);
            await funding.setMarkPrice(toWad(6000));
            await perpetual.setGovernanceParameter(toBytes32("takerDevFeeRate"), toWad(0.01));
            await perpetual.setGovernanceParameter(toBytes32("makerDevFeeRate"), toWad(-0.01));

            const takerParam = await buildOrder({
                trader: u1,
                amount: 1,
                price: 6000,
                version: 2,
                side: 'sell',
                type: 'market',
                expiredAtSeconds: 86400,
                salt: 666,
            }, perpetual.address, admin);

            const makerParam = await buildOrder({
                trader: u2,
                amount: 1,
                price: 6000,
                version: 2,
                side: 'buy',
                type: 'limit',
                expiredAtSeconds: 86400,
                salt: 666,
            }, perpetual.address, admin);
            await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(1)]);
        });

        it("no dev", async () => {
            await initialize(u1, 650);
            await initialize(u2, 5800);
            await funding.setMarkPrice(toWad(6000));
            await perpetual.setGovernanceParameter(toBytes32("takerDevFeeRate"), toWad(0.00));
            await perpetual.setGovernanceParameter(toBytes32("makerDevFeeRate"), toWad(0.00));

            const takerParam = await buildOrder({
                trader: u1,
                amount: 1,
                price: 6000,
                version: 2,
                side: 'sell',
                type: 'market',
                expiredAtSeconds: 86400,
                salt: 666,
            }, perpetual.address, admin);

            const makerParam = await buildOrder({
                trader: u2,
                amount: 1,
                price: 6000,
                version: 2,
                side: 'buy',
                type: 'limit',
                expiredAtSeconds: 86400,
                salt: 666,
            }, perpetual.address, admin);
            await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(1)]);
        });

        it("dev unsafe", async () => {
            await initialize(u1, 580);
            await initialize(u2, 5800);
            await funding.setMarkPrice(toWad(6000));
            await perpetual.setGovernanceParameter(toBytes32("takerDevFeeRate"), toWad(-0.01));
            await perpetual.setGovernanceParameter(toBytes32("makerDevFeeRate"), toWad(-0.01));

            const takerParam = await buildOrder({
                trader: u1,
                amount: 2,
                price: 6000,
                version: 2,
                side: 'sell',
                type: 'market',
                expiredAtSeconds: 86400,
                makerFeeRate: 1000,
                takerFeeRate: 1000,
                salt: 666,
            }, perpetual.address, admin);

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

            try {
                await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(1)]);
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("dev unsafe"), error);
            }
        });

        it("maker unsafe", async () => {
            await initialize(u1, 5800);
            await initialize(u2, 700);
            await funding.setMarkPrice(toWad(6000));
            await perpetual.setGovernanceParameter(toBytes32("takerDevFeeRate"), toWad(0.01));
            await perpetual.setGovernanceParameter(toBytes32("makerDevFeeRate"), toWad(0));

            let takerParam = await buildOrder({
                trader: u1,
                amount: 2,
                price: 6000,
                version: 2,
                side: 'buy',
                type: 'market',
                expiredAtSeconds: 86400,
                makerFeeRate: 1000,
                takerFeeRate: 1000,
                salt: 666,
            }, perpetual.address, admin);

            let makerParam = await buildOrder({
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

            await funding.setMarkPrice(toWad(16000));
            takerParam = await buildOrder({
                trader: u1,
                amount: 2,
                price: 6000,
                version: 2,
                side: 'sell',
                type: 'market',
                expiredAtSeconds: 86400,
                makerFeeRate: 1000,
                takerFeeRate: 1000,
                salt: 666,
            }, perpetual.address, admin);
            makerParam = await buildOrder({
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
            try {
                await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(0.1)]);
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("maker unsafe"), error);
            }
        });

        it("taker unsafe", async () => {
            await initialize(u1, 700);
            await initialize(u2, 5800);
            await funding.setMarkPrice(toWad(6000));
            await perpetual.setGovernanceParameter(toBytes32("takerDevFeeRate"), toWad(0));
            await perpetual.setGovernanceParameter(toBytes32("makerDevFeeRate"), toWad(0.01));

            let takerParam = await buildOrder({
                trader: u1,
                amount: 2,
                price: 6000,
                version: 2,
                side: 'sell',
                type: 'market',
                expiredAtSeconds: 86400,
                makerFeeRate: 1000,
                takerFeeRate: 1000,
                salt: 666,
            }, perpetual.address, admin);
            let makerParam = await buildOrder({
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
            await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(1)]);

            await funding.setMarkPrice(toWad(16000));
            takerParam = await buildOrder({
                trader: u1,
                amount: 2,
                price: 3000,
                version: 2,
                side: 'buy',
                type: 'market',
                expiredAtSeconds: 86400,
                makerFeeRate: 1000,
                takerFeeRate: 1000,
                salt: 666,
            }, perpetual.address, admin);
            makerParam = await buildOrder({
                trader: u2,
                amount: 1,
                price: 3000,
                version: 2,
                side: 'sell',
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
                assert.ok(error.message.includes("maker unsafe"), error);
            }
        });

        it("market order", async () => {
            await initialize(u1, 10000);
            await initialize(u2, 10000);
            await funding.setMarkPrice(toWad(6000));

            const takerParam = await buildOrder({
                trader: u1,
                amount: 2,
                price: 6000,
                version: 2,
                side: 'sell',
                type: 'market',
                expiredAtSeconds: 86400,
                makerFeeRate: 1000,
                takerFeeRate: 1000,
                salt: 666,
            }, perpetual.address, admin);

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
            await exchange.matchOrders(takerParam, [makerParam], perpetual.address, [toWad(1)]);
        });
    });

    it("trade", async () => {
        console.log("+++++++++++++", await exchange.getChainId());

        await collateral.transfer(u1, toWad(10000));
        await collateral.approve(perpetual.address, infinity, { from: u1 });
        await perpetual.deposit(toWad(10000), { from: u1 });
        assert.equal(fromWad(await cashBalanceOf(u1)), 10000);
        await perpetual.setBroker(admin, {from: u1});

        await perpetual.oneSideTradePublic(u1, LONG, toWad(6000), toWad(1));
        assert.ok(await perpetual.isSafe.call(u1));

        assert.equal(await positionSize(u1), toWad(1));
        assert.equal(await positionEntryValue(u1), toWad(6000));

        await funding.setMarkPrice(toWad(6000));

        assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 10000 - 600);
    });

    it("soft fee", async () => {
        await initialize(u1, 720);
        await initialize(u2, 720);
        await funding.setMarkPrice(toWad(6000));

        await exchange.matchOrders(
            await buildOrder({
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
            },
                perpetual.address,
                admin
            ),
            [
                await buildOrder({
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
                },
                    perpetual.address,
                    admin
                )
            ],
            perpetual.address,
            [
                toWad(1)
            ]
        );
        assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 60);
        assert.equal(fromWad(await perpetual.availableMargin.call(u2)), 0);

        await exchange.matchOrders(
            await buildOrder({
                trader: u1,
                amount: 1,
                price: 6000,
                version: 2,
                side: 'buy',
                type: 'limit',
                expiredAtSeconds: 86400,
                makerFeeRate: 0,
                takerFeeRate: 0,
                salt: 666,
            },
                perpetual.address,
                admin
            ),
            [
                await buildOrder({
                    trader: u2,
                    amount: 1,
                    price: 6000,
                    version: 2,
                    side: 'sell',
                    type: 'limit',
                    expiredAtSeconds: 86400,
                    makerFeeRate: 0,
                    takerFeeRate: 0,
                    salt: 666,
                },
                    perpetual.address,
                    admin
                )
            ],
            perpetual.address,
            [
                toWad(1)
            ]
        );
        assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 600);
        assert.equal(fromWad(await perpetual.availableMargin.call(u2)), 480);
    });

    it("soft fee - hit floor", async () => {
        await initialize(u1, 660);
        await initialize(u2, 720);
        await funding.setMarkPrice(toWad(6000));

        await exchange.matchOrders(
            await buildOrder({
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
            },
                perpetual.address,
                admin
            ),
            [
                await buildOrder({
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
                },
                    perpetual.address,
                    admin
                )
            ],
            perpetual.address,
            [
                toWad(1)
            ]
        );
        assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 0);
        assert.equal(fromWad(await perpetual.availableMargin.call(u2)), 0);

        try {
            await funding.setMarkPrice(toWad(50));
            await exchange.matchOrders(
                await buildOrder({
                    trader: u1,
                    amount: 1,
                    price: 5399,
                    version: 2,
                    side: 'buy',
                    type: 'limit',
                    expiredAtSeconds: 86400,
                    makerFeeRate: 0,
                    takerFeeRate: 0,
                    salt: 666,
                },
                    perpetual.address,
                    admin
                ),
                [
                    await buildOrder({
                        trader: u2,
                        amount: 1,
                        price: 5399,
                        version: 2,
                        side: 'sell',
                        type: 'limit',
                        expiredAtSeconds: 86400,
                        makerFeeRate: 0,
                        takerFeeRate: 0,
                        salt: 666,
                    },
                        perpetual.address,
                        admin
                    )
                ],
                perpetual.address,
                [
                    toWad(1)
                ]
            );
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("dev margin"));
        }

        await funding.setMarkPrice(toWad("5400.000000000000000001"));
        await exchange.matchOrders(
            await buildOrder({
                trader: u1,
                amount: 1,
                price: "5400.000000000000000001",
                version: 2,
                side: 'buy',
                type: 'limit',
                expiredAtSeconds: 86400,
                makerFeeRate: 0,
                takerFeeRate: 0,
                salt: 666,
            },
                perpetual.address,
                admin
            ),
            [
                await buildOrder({
                    trader: u2,
                    amount: 1,
                    price: "5400.000000000000000001",
                    version: 2,
                    side: 'sell',
                    type: 'limit',
                    expiredAtSeconds: 86400,
                    makerFeeRate: 0,
                    takerFeeRate: 0,
                    salt: 666,
                },
                    perpetual.address,
                    admin
                )
            ],
            perpetual.address,
            [
                toWad(1)
            ]
        );
        // 600 - 5400 * 0.01 = 546
        // 600 ether + 546 ether -1 -1 = 1145.999999999999999998
        assert.equal(fromWad(await perpetual.availableMargin.call(u1)), "1145.999999999999999998");
        // 600 close
        assert.equal(fromWad(await perpetual.availableMargin.call(u2)), 0);
    });

    it("trade 1v1", async () => {
        await collateral.transfer(u1, toWad(10000));
        await collateral.approve(perpetual.address, infinity, {
            from: u1
        });
        await perpetual.deposit(toWad(10000), {
            from: u1
        });
        assert.equal(fromWad(await cashBalanceOf(u1)), 10000);
        await perpetual.setBroker(admin, {
            from: u1
        });

        await collateral.transfer(u2, toWad(10000));
        await collateral.approve(perpetual.address, infinity, {
            from: u2
        });
        await perpetual.deposit(toWad(10000), {
            from: u2
        });
        assert.equal(fromWad(await cashBalanceOf(u2)), 10000);
        await perpetual.setBroker(admin, {
            from: u2
        });

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
        }, perpetual.address, admin);

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

        const tx = await exchange.matchOrders(
            takerParam,
            [
                makerParam
            ],
            perpetual.address,
            [
                toWad(1)
            ]
        );

        console.log(tx);

        assert.equal(fromWad(await cashBalanceOf(u1)), 9880);
        assert.equal(fromWad(await positionEntryValue(u1)), 6000);
        assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 300);
        assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 9280);

        assert.equal(fromWad(await cashBalanceOf(u2)), 9820);
        assert.equal(fromWad(await positionEntryValue(u2)), 6000);
        assert.equal(fromWad(await perpetual.maintenanceMargin.call(u2)), 300);
        assert.equal(fromWad(await perpetual.availableMargin.call(u2)), 9220);

        assert.equal(fromWad(await cashBalanceOf(admin)), 120);
        assert.equal(fromWad(await cashBalanceOf(dev)), 180);
    });

    it("trade 0 amount", async () => {
        await collateral.transfer(u1, toWad(10000));
        await collateral.approve(perpetual.address, infinity, {
            from: u1
        });
        await perpetual.deposit(toWad(10000), {
            from: u1
        });
        assert.equal(fromWad(await cashBalanceOf(u1)), 10000);
        await perpetual.setBroker(admin, {
            from: u1
        });

        await collateral.transfer(u2, toWad(10000));
        await collateral.approve(perpetual.address, infinity, {
            from: u2
        });
        await perpetual.deposit(toWad(10000), {
            from: u2
        });
        assert.equal(fromWad(await cashBalanceOf(u2)), 10000);
        await perpetual.setBroker(admin, {
            from: u2
        });

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
        }, perpetual.address, admin);

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

        const tx = await exchange.matchOrders(
            takerParam,
            [
                makerParam
            ],
            perpetual.address,
            [
                toWad(0)
            ]
        );

        console.log(tx);

        assert.equal(fromWad(await cashBalanceOf(u1)), 10000);
        assert.equal(fromWad(await positionEntryValue(u1)), 0);
        assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 0);
        assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 10000);

        assert.equal(fromWad(await cashBalanceOf(u2)), 10000);
        assert.equal(fromWad(await positionEntryValue(u2)), 0);
        assert.equal(fromWad(await perpetual.maintenanceMargin.call(u2)), 0);
        assert.equal(fromWad(await perpetual.availableMargin.call(u2)), 10000);

        assert.equal(fromWad(await cashBalanceOf(admin)), 0);
        assert.equal(fromWad(await cashBalanceOf(dev)), 0);
    });

    it("close", async () => {
        await initialize(u1, 10000);
        await initialize(u2, 10000);
        await funding.setMarkPrice(toWad(6000));

        await exchange.matchOrders(
            await buildOrder({
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
            },
                perpetual.address,
                admin
            ),
            [
                await buildOrder({
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
                },
                    perpetual.address,
                    admin
                )
            ],
            perpetual.address,
            [
                toWad(1)
            ]
        );

        assert.equal(fromWad(await cashBalanceOf(u1)), 9880);
        assert.equal(fromWad(await positionEntryValue(u1)), 6000);
        assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 300);
        assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 9280);

        assert.equal(fromWad(await cashBalanceOf(u2)), 9820);
        assert.equal(fromWad(await positionEntryValue(u2)), 6000);
        assert.equal(fromWad(await perpetual.maintenanceMargin.call(u2)), 300);
        assert.equal(fromWad(await perpetual.availableMargin.call(u2)), 9220);

        assert.equal(fromWad(await cashBalanceOf(admin)), 120);
        assert.equal(fromWad(await cashBalanceOf(dev)), 180);

        await exchange.matchOrders(
            await buildOrder({
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
            },
                perpetual.address,
                admin
            ),
            [
                await buildOrder({
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
                },
                    perpetual.address,
                    admin
                )
            ],
            perpetual.address,
            [
                toWad(1)
            ]
        );

        assert.equal(fromWad(await cashBalanceOf(u1)), 9760);
        assert.equal(fromWad(await positionEntryValue(u1)), 0);
        assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 0);
        assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 9760);

        assert.equal(fromWad(await cashBalanceOf(u2)), 9640);
        assert.equal(fromWad(await positionEntryValue(u2)), 0);
        assert.equal(fromWad(await perpetual.maintenanceMargin.call(u2)), 0);
        assert.equal(fromWad(await perpetual.availableMargin.call(u2)), 9640);

        assert.equal(fromWad(await cashBalanceOf(admin)), 240);
        assert.equal(fromWad(await cashBalanceOf(dev)), 360);
    });

    it("fail to match", async () => {
        await initialize(u1, 10000);
        await initialize(u2, 10000);
        await funding.setMarkPrice(toWad(6000));

        try {
            await exchange.matchOrders(
                await buildOrder({
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
                },
                    perpetual.address,
                    admin
                ),
                [
                    await buildOrder({
                        trader: u2,
                        amount: 1,
                        price: 5800,
                        version: 2,
                        side: 'buy',
                        type: 'limit',
                        expiredAtSeconds: 86400,
                        makerFeeRate: 1000,
                        takerFeeRate: 1000,
                        salt: 666,
                    },
                        perpetual.address,
                        admin
                    )
                ],
                perpetual.address,
                [
                    toWad(1)
                ]
            );
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("price not match"), error);
        }
    });

    it("maker only", async () => {
        await initialize(u1, 10000);
        await initialize(u2, 10000);
        await funding.setMarkPrice(toWad(6000));

        try {
            await exchange.matchOrders(
                await buildOrder({
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
                    makerOnly: true,
                },
                    perpetual.address,
                    admin
                ),
                [
                    await buildOrder({
                        trader: u2,
                        amount: 1,
                        price: 5800,
                        version: 2,
                        side: 'buy',
                        type: 'limit',
                        expiredAtSeconds: 86400,
                        makerFeeRate: 1000,
                        takerFeeRate: 1000,
                        salt: 666,
                        makerOnly: true,
                    },
                        perpetual.address,
                        admin
                    )
                ],
                perpetual.address,
                [
                    toWad(1)
                ]
            );
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("taker order is maker only"), error);
        }
    });

    it("invalid broker", async () => {
        await initialize(u1, 10000);
        await initialize(u2, 10000);
        await funding.setMarkPrice(toWad(6000));

        try {
            await exchange.matchOrders(
                await buildOrder({
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
                },
                    perpetual.address,
                    admin
                ),
                [
                    await buildOrder({
                        trader: u2,
                        amount: 1,
                        price: 5800,
                        version: 2,
                        side: 'buy',
                        type: 'limit',
                        expiredAtSeconds: 86400,
                        makerFeeRate: 1000,
                        takerFeeRate: 1000,
                        salt: 666,
                    },
                        perpetual.address,
                        admin
                    )
                ],
                perpetual.address,
                [
                    toWad(1)
                ], {
                from: u1
            }
            );
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("invalid broker"), error);
        }
    });

    it("invalid broker", async () => {
        await initialize(u1, 10000);
        await initialize(u2, 10000);
        await funding.setMarkPrice(toWad(6000));

        try {
            await exchange.matchOrders(
                await buildOrder({
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
                },
                    perpetual.address,
                    admin
                ),
                [
                    await buildOrder({
                        trader: u2,
                        amount: 1,
                        price: 5800,
                        version: 2,
                        side: 'buy',
                        type: 'limit',
                        expiredAtSeconds: 86400,
                        makerFeeRate: 1000,
                        takerFeeRate: 1000,
                        salt: 666,
                    },
                        perpetual.address,
                        admin
                    )
                ],
                perpetual.address,
                [
                    toWad(1)
                ], {
                from: u1
            }
            );
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("invalid broker"), error);
        }
    });

    it("invalid signature", async () => {
        await initialize(u1, 10000);
        await initialize(u2, 10000);
        await funding.setMarkPrice(toWad(6000));

        try {
            await exchange.matchOrders(
                await buildOrder({
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
                },
                    perpetual.address,
                    admin
                ),
                [
                    await buildOrder({
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
                    },
                        exchange.address,
                        admin
                    )
                ],
                perpetual.address,
                [
                    toWad(1)
                ]
            );
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("invalid signature"), error);
        }
    });



    describe("trades", async () => {
        const copy = (obj) => {
            return JSON.parse(JSON.stringify(obj));
        };

        it("validate", async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u1
            });
            await perpetual.deposit(toWad(10000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);
            await perpetual.setBroker(admin, {
                from: u1
            });

            await collateral.transfer(u2, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u2
            });
            await perpetual.deposit(toWad(10000), {
                from: u2
            });
            assert.equal(fromWad(await cashBalanceOf(u2)), 10000);
            await perpetual.setBroker(admin, {
                from: u2
            });

            await funding.setMarkPrice(toWad(6000));
            const takerParam = {
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
            };

            const makerParam = {
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
            };

            const takerOrder = await buildOrder(takerParam, perpetual.address, admin);

            await exchange.matchOrders(
                takerOrder,
                [await buildOrder(makerParam, perpetual.address, admin)],
                perpetual.address,
                [toWad(1)]
            );
            const takerOrderHash = getOrderHash(takerOrder);
            assert.equal(await exchange.filled(takerOrderHash), toWad(1));

            try {
                await exchange.matchOrders(
                    takerOrder,
                    [await buildOrder(makerParam, perpetual.address, admin)],
                    perpetual.address,
                    [toWad(1)]
                );
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("fullfilled order"), error);
            }
        });

        it("trade 1v1, trading size", async () => {

            await perpetual.setGovernanceParameter(toBytes32("tradingLotSize"), toWad(1));
            await perpetual.setGovernanceParameter(toBytes32("lotSize"), toWad(0.1));

            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u1
            });
            await perpetual.deposit(toWad(10000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);
            await perpetual.setBroker(admin, {
                from: u1
            });

            await collateral.transfer(u2, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u2
            });
            await perpetual.deposit(toWad(10000), {
                from: u2
            });
            assert.equal(fromWad(await cashBalanceOf(u2)), 10000);
            await perpetual.setBroker(admin, {
                from: u2
            });

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
            }, perpetual.address, admin);

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

            try {
                await exchange.matchOrders(
                    takerParam,
                    [makerParam],
                    perpetual.address,
                    [toWad(0.1)]
                );
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("invalid trading lot size"), error);
            }
            await exchange.matchOrders(
                takerParam,
                [makerParam],
                perpetual.address,
                [toWad(1)]
            );

            assert.equal(fromWad(await cashBalanceOf(u1)), 9880);
            assert.equal(fromWad(await positionEntryValue(u1)), 6000);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 300);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 9280);

            assert.equal(fromWad(await cashBalanceOf(u2)), 9820);
            assert.equal(fromWad(await positionEntryValue(u2)), 6000);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u2)), 300);
            assert.equal(fromWad(await perpetual.availableMargin.call(u2)), 9220);

            assert.equal(fromWad(await cashBalanceOf(admin)), 120);
            assert.equal(fromWad(await cashBalanceOf(dev)), 180);
        });

        it("trade 1v1", async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u1
            });
            await perpetual.deposit(toWad(10000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);
            await perpetual.setBroker(admin, {
                from: u1
            });

            await collateral.transfer(u2, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u2
            });
            await perpetual.deposit(toWad(10000), {
                from: u2
            });
            assert.equal(fromWad(await cashBalanceOf(u2)), 10000);
            await perpetual.setBroker(admin, {
                from: u2
            });

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
            }, perpetual.address, admin);

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

            await exchange.matchOrders(
                takerParam,
                [
                    makerParam
                ],
                perpetual.address,
                [
                    toWad(1)
                ]
            );

            assert.equal(fromWad(await cashBalanceOf(u1)), 9880);
            assert.equal(fromWad(await positionEntryValue(u1)), 6000);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 300);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 9280);

            assert.equal(fromWad(await cashBalanceOf(u2)), 9820);
            assert.equal(fromWad(await positionEntryValue(u2)), 6000);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u2)), 300);
            assert.equal(fromWad(await perpetual.availableMargin.call(u2)), 9220);

            assert.equal(fromWad(await cashBalanceOf(admin)), 120);
            assert.equal(fromWad(await cashBalanceOf(dev)), 180);
        });

        it("broker balance", async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u1
            });
            await perpetual.deposit(toWad(10000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);
            await perpetual.setBroker(u3, {
                from: u1
            });

            await collateral.transfer(u2, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u2
            });
            await perpetual.deposit(toWad(10000), {
                from: u2
            });
            assert.equal(fromWad(await cashBalanceOf(u2)), 10000);
            await perpetual.setBroker(u3, {
                from: u2
            });

            await increaseBlockBy(5);

            await funding.setMarkPrice(toWad(6000));

            const takerParam = await buildOrder({
                trader: u1,
                amount: 1,
                price: 6000,
                version: 2,
                side: 'sell',
                type: 'limit',
                expiredAtSeconds: 86400,
                makerFeeRate: -1000,
                takerFeeRate: 1000,
                salt: 666,
            }, perpetual.address, u3);

            const makerParam = await buildOrder({
                trader: u2,
                amount: 1,
                price: 6000,
                version: 2,
                side: 'buy',
                type: 'limit',
                expiredAtSeconds: 86400,
                makerFeeRate: -1000,
                takerFeeRate: 1000,
                salt: 666,
            }, perpetual.address, u3);

            await exchange.matchOrders(
                takerParam,
                [makerParam],
                perpetual.address,
                [toWad(1)], {
                from: u3
            }
            );

            // taker dev0.01 + trade0.01 = 120
            assert.equal(fromWad(await cashBalanceOf(u1)), 9880);
            assert.equal(fromWad(await positionEntryValue(u1)), 6000);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 300);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 9280);

            // maker dev00.02 + trade-0.01 = 60
            assert.equal(fromWad(await cashBalanceOf(u2)), 9940);
            assert.equal(fromWad(await positionEntryValue(u2)), 6000);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u2)), 300);
            assert.equal(fromWad(await perpetual.availableMargin.call(u2)), 9940 - 600);

            assert.equal(fromWad(await cashBalanceOf(u3)), 0);
            assert.equal(fromWad(await cashBalanceOf(dev)), 180);
        });

        it("broker unsafe", async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u1
            });
            await perpetual.deposit(toWad(10000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);
            await perpetual.setBroker(u3, {
                from: u1
            });

            await collateral.transfer(u2, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u2
            });
            await perpetual.deposit(toWad(10000), {
                from: u2
            });
            assert.equal(fromWad(await cashBalanceOf(u2)), 10000);
            await perpetual.setBroker(u3, {
                from: u2
            });

            await increaseBlockBy(5);

            await funding.setMarkPrice(toWad(6000));

            const takerParam = await buildOrder({
                trader: u1,
                amount: 1,
                price: 6000,
                version: 2,
                side: 'sell',
                type: 'limit',
                expiredAtSeconds: 86400,
                makerFeeRate: -1010,
                takerFeeRate: 1000,
                salt: 666,
            }, perpetual.address, u3);

            const makerParam = await buildOrder({
                trader: u2,
                amount: 1,
                price: 6000,
                version: 2,
                side: 'buy',
                type: 'limit',
                expiredAtSeconds: 86400,
                makerFeeRate: -1010,
                takerFeeRate: 1000,
                salt: 666,
            }, perpetual.address, u3);

            try {
                await exchange.matchOrders(
                    takerParam,
                    [makerParam],
                    perpetual.address,
                    [toWad(1)], {
                    from: u3
                }
                );
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("broker unsafe"), error);
            }
        });

        it("dev unsafe", async () => {
            await perpetual.setGovernanceParameter(toBytes32("takerDevFeeRate"), toWad(-0.01));
            await perpetual.setGovernanceParameter(toBytes32("makerDevFeeRate"), toWad(-0.01));

            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u1
            });
            await perpetual.deposit(toWad(10000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);
            await perpetual.setBroker(u3, {
                from: u1
            });

            await collateral.transfer(u2, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u2
            });
            await perpetual.deposit(toWad(10000), {
                from: u2
            });
            assert.equal(fromWad(await cashBalanceOf(u2)), 10000);
            await perpetual.setBroker(u3, {
                from: u2
            });

            await increaseBlockBy(5);

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
            }, perpetual.address, u3);

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
            }, perpetual.address, u3);

            try {
                await exchange.matchOrders(
                    takerParam,
                    [makerParam],
                    perpetual.address,
                    [toWad(1)], {
                    from: u3
                }
                );
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("dev unsafe"), error);
            }
        });

        it("validate", async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u1
            });
            await perpetual.deposit(toWad(10000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);
            await perpetual.setBroker(admin, {
                from: u1
            });

            await collateral.transfer(u2, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u2
            });
            await perpetual.deposit(toWad(10000), {
                from: u2
            });
            assert.equal(fromWad(await cashBalanceOf(u2)), 10000);
            await perpetual.setBroker(admin, {
                from: u2
            });

            await funding.setMarkPrice(toWad(6000));
            const takerParam = {
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
            };

            const makerParam = {
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
            };

            try {
                let tp = copy(takerParam);
                let mp = copy(makerParam);
                tp.expiredAtSeconds = -10;

                await exchange.matchOrders(
                    await buildOrder(tp, perpetual.address, admin),
                    [await buildOrder(mp, perpetual.address, admin)],
                    perpetual.address,
                    [toWad(1)]
                );
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("order expired"), error);
            }

            try {
                let tp = copy(takerParam);
                let mp = copy(makerParam);
                mp.expiredAtSeconds = -10;

                await exchange.matchOrders(
                    await buildOrder(tp, perpetual.address, admin),
                    [await buildOrder(mp, perpetual.address, admin)],
                    perpetual.address,
                    [toWad(1)]
                );
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("order expired"), error);
            }

            try {
                let tp = copy(takerParam);
                let mp = copy(makerParam);

                await exchange.matchOrders(
                    await buildOrder(tp, perpetual.address, admin),
                    [await buildOrder(mp, perpetual.address, admin)],
                    perpetual.address,
                    [toWad(1)], {
                    from: u3
                }
                );
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("invalid broker"), error);
            }

            try {
                let tp = copy(takerParam);
                let mp = copy(makerParam);

                await exchange.matchOrders(
                    await buildOrder(tp, perpetual.address, u1),
                    [await buildOrder(mp, perpetual.address, admin)],
                    perpetual.address,
                    [toWad(1)]
                );
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("invalid signature"), error);
            }

            try {
                let tp = copy(takerParam);
                let mp = copy(makerParam);
                tp.version = 1;

                await exchange.matchOrders(
                    await buildOrder(tp, perpetual.address, admin),
                    [await buildOrder(mp, perpetual.address, admin)],
                    perpetual.address,
                    [toWad(1)]
                );
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("unsupported version"), error);
            }

        });
        it("cancel order", async () => {
            const order = await buildOrder({
                trader: u1,
                amount: 1,
                price: 6000,
                version: 2,
                side: 'buy',
                type: 'limit',
                expiredAtSeconds: 86400,
                makerFeeRate: 0,
                takerFeeRate: 0,
                salt: 666,
            },
                perpetual.address,
                admin
            );
            const orderHash = getOrderHash(order);
            await exchange.cancelOrder(order);
            assert.ok(await exchange.cancelled(orderHash));
        });
    });

});