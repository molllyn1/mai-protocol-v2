const assert = require('assert');
const BigNumber = require('bignumber.js');
const { increaseEvmBlock, increaseEvmTime, createEVMSnapshot, restoreEVMSnapshot, toBytes32, assertApproximate } = require('./funcs');
const { toWei, fromWei, toWad, fromWad, infinity, Side } = require('./constants');

const TestToken = artifacts.require('test/TestToken.sol');
const PriceFeeder = artifacts.require('test/TestPriceFeeder.sol');
const GlobalConfig = artifacts.require('perpetual/GlobalConfig.sol');
const Perpetual = artifacts.require('test/TestPerpetual.sol');
const AMM = artifacts.require('test/TestAMM.sol');
const Proxy = artifacts.require('proxy/Proxy.sol');
const ShareToken = artifacts.require('token/ShareToken.sol');

const gasLimit = 8000000;

contract('amm', accounts => {
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

    let snapshotId;

    const increaseBlockBy = async (n) => {
        for (let i = 0; i < n; i++) {
            await increaseEvmBlock();
        }
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
        amm = await AMM.new(globalConfig.address, proxy.address, priceFeeder.address, share.address);
        await share.addMinter(amm.address);
        await share.renounceMinter();

        await perpetual.setGovernanceAddress(toBytes32("amm"), amm.address);
        await globalConfig.addComponent(perpetual.address, proxy.address);
    };

    const useDefaultGovParameters = async () => {
        await perpetual.setGovernanceParameter(toBytes32("initialMarginRate"), toWad(0.1));
        await perpetual.setGovernanceParameter(toBytes32("maintenanceMarginRate"), toWad(0.05));
        await perpetual.setGovernanceParameter(toBytes32("liquidationPenaltyRate"), toWad(0.005));
        await perpetual.setGovernanceParameter(toBytes32("penaltyFundRate"), toWad(0.005));
        await perpetual.setGovernanceParameter(toBytes32("takerDevFeeRate"), toWad(0.01));
        await perpetual.setGovernanceParameter(toBytes32("makerDevFeeRate"), toWad(0.01));
        await perpetual.setGovernanceParameter(toBytes32("lotSize"), 1);
        await perpetual.setGovernanceParameter(toBytes32("tradingLotSize"), 1);
    };

    const usePoolDefaultParameters = async () => {
        await amm.setGovernanceParameter(toBytes32("poolFeeRate"), toWad(0.01));
        await amm.setGovernanceParameter(toBytes32("poolDevFeeRate"), toWad(0.005));
        await amm.setGovernanceParameter(toBytes32("updatePremiumPrize"), toWad(1));
        await amm.setGovernanceParameter(toBytes32('emaAlpha'), '3327787021630616'); // 2 / (600 + 1)
        await amm.setGovernanceParameter(toBytes32('markPremiumLimit'), toWad(0.005));
        await amm.setGovernanceParameter(toBytes32('fundingDampener'), toWad(0.0005));
    };

    const setIndexPrice = async price => {
        await priceFeeder.setPrice(toWad(price));

        // priceFeeder will modify index.timestamp, amm.timestamp should >= index.timestamp
        const index = await amm.indexPrice();
        await amm.setBlockTimestamp(index.timestamp);
    };

    const positionSize = async (user) => {
        const positionAccount = await perpetual.getMarginAccount(user);
        return positionAccount.size;
    }

    const positionSide = async (user) => {
        const positionAccount = await perpetual.getMarginAccount(user);
        return positionAccount.side;
    }

    const positionEntryValue = async (user) => {
        const positionAccount = await perpetual.getMarginAccount(user);
        return positionAccount.entryValue;
    }

    const cashBalanceOf = async (user) => {
        const cashAccount = await perpetual.getMarginAccount(user);
        return cashAccount.cashBalance;
    }

    beforeEach(async () => {
        snapshotId = await createEVMSnapshot();
        await deploy();
        await useDefaultGovParameters();
        await usePoolDefaultParameters();
    });

    afterEach(async function () {
        await restoreEVMSnapshot(snapshotId);
    });

    describe("create amm", async () => {
        return;
        beforeEach(async () => {
            // index
            await setIndexPrice(7000);
            const indexPrice = await amm.indexPrice();
            assert.equal(fromWad(indexPrice.price), 7000);

            // approve
            await collateral.transfer(u1, toWad(7000 * 3));
            await collateral.approve(perpetual.address, infinity, { from: u1 });
        });

        it('should success', async () => {
            await perpetual.setGovernanceParameter(toBytes32("tradingLotSize"), toWad(1));
            await perpetual.setGovernanceParameter(toBytes32("lotSize"), toWad(1));

            await perpetual.deposit(toWad(14700), { from: u1 });

            try {
                await amm.createPool(toWad(0.5), { from: u1 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("amount must be divisible by tradingLotSize"));
            }
            try {
                await amm.createPool(toWad(1.1), { from: u1 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("amount must be divisible by tradingLotSize"));
            }

            await amm.createPool(toWad(1), { from: u1 });

            // position
            assert.equal(fromWad(await amm.positionSize()), 1);
            assert.equal(fromWad(await share.totalSupply()), 1);
            assert.equal(fromWad(await amm.currentAvailableMargin.call()), 7000 * 1);
            assert.equal(fromWad(await positionSize(u1)), 1);
            assert.equal(fromWad(await positionSize(proxy.address)), 1); // amm.y
            assert.equal(await positionSide(u1), Side.SHORT);
            assert.equal(await positionSide(proxy.address), Side.LONG);
        });
    });

    describe("trading", async () => {
        beforeEach(async () => {
            // index
            await setIndexPrice(7000);
            const indexPrice = await amm.indexPrice();
            assert.equal(fromWad(indexPrice.price), 7000);

            // approve
            await collateral.transfer(u1, toWad(7000 * 10 * 2.1));
            await collateral.transfer(u2, toWad(7000 * 3));
            await collateral.transfer(u3, toWad(7000 * 3));
            await collateral.transfer(dev, toWad(7000 * 3));
            await collateral.approve(perpetual.address, infinity, { from: u1 });
            await collateral.approve(perpetual.address, infinity, { from: u2 });
            await collateral.approve(perpetual.address, infinity, { from: u3 });
            await collateral.approve(perpetual.address, infinity, { from: dev });

            // create amm
            await perpetual.deposit(toWad(7000 * 10 * 2.1), { from: u1 });
            await amm.createPool(toWad(10), { from: u1 });
        });


        it("addLiquidity - no position on removing liqudity", async () => {
            await perpetual.deposit(toWad(7000 * 3), { from: u2 });

            await perpetual.setGovernanceParameter(toBytes32("tradingLotSize"), toWad(1));
            await perpetual.setGovernanceParameter(toBytes32("lotSize"), toWad(1));
            try {
                await amm.addLiquidity(toWad(0.1), { from: u2 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("amount must be divisible by lotSize"));
            }
            await amm.addLiquidity(toWad(1), { from: u2 });

            assert.equal(fromWad(await cashBalanceOf(u2)), 7000);
            assert.equal(fromWad(await share.balanceOf(u2)), 1);
            assert.equal(fromWad(await positionSize(u2)), 1);
            assert.equal(await positionSide(u2), Side.SHORT);
            assert.equal(fromWad(await positionEntryValue(u2)), 7000);
        });

        it("removeLiquidity - no position on removing liqudity", async () => {
            await perpetual.setGovernanceParameter(toBytes32("tradingLotSize"), toWad(1));
            await perpetual.setGovernanceParameter(toBytes32("lotSize"), toWad(0.1));

            await perpetual.deposit(toWad(7000 * 3), { from: u2 });
            await amm.addLiquidity(toWad(1), { from: u2 });

            assert.equal(fromWad(await cashBalanceOf(u2)), 7000);
            assert.equal(fromWad(await share.balanceOf(u2)), 1);
            assert.equal(fromWad(await positionSize(u2)), 1);
            assert.equal(await positionSide(u2), Side.SHORT);
            assert.equal(fromWad(await positionEntryValue(u2)), 7000);

            // price == 7700
            await amm.buy(toWad(1), toWad('10000'), infinity, { from: u2 });
            assert.equal(fromWad(await cashBalanceOf(u2)), 6184.5 - 1e-18); //7000 - 700 - 115.5
            assert.equal(fromWad(await share.balanceOf(u2)), 1);
            assert.equal(fromWad(await positionSize(u2)), 0);
            assert.equal(await positionSide(u2), Side.FLAT);
            assert.equal(fromWad(await positionEntryValue(u2)), 0); // trade price * position

            await share.approve(amm.address, infinity, { from: u2 });
            await amm.removeLiquidity(toWad(1), { from: u2 });

            // // price == 8477.7  amount = 0.9
            // assert.equal(fromWad(await cashBalanceOf(u2)), 6184.5 + 1.8 * 8477.7);
            // assert.equal(fromWad(await share.balanceOf(u2)), 0);
            // assert.equal(fromWad(await positionSize(u2)), "0.9");
            // assert.equal(await positionSide(u2), Side.LONG);
            // assert.equal(fromWad(await positionEntryValue(u2)), 7629.93); // 8477.7 * 0.9
        });

        it("buy - success", async () => {
            // buy 1, entryPrice will be 70000 / (10 - 1) = 7777 but markPrice is still 7000
            // pnl = -777, positionMargin = 700

            await perpetual.setGovernanceParameter(toBytes32("tradingLotSize"), toWad(1));
            await perpetual.setGovernanceParameter(toBytes32("lotSize"), toWad(0.1));

            await perpetual.deposit(toWad(7000 * 1), { from: u2 });
            try {
                await amm.buy(toWad(0.1), toWad('10000'), infinity, { from: u2 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("amount must be divisible by tradingLotSize"), error);
            }
            await amm.buy(toWad(1), toWad('10000'), infinity, { from: u2 });

            assert.equal(fromWad(await amm.positionSize()), 9);
            assert.equal(fromWad(await positionSize(proxy.address)), 9);
            assert.equal(fromWad(await positionSize(u1)), 10);
            assert.equal(fromWad(await positionSize(u2)), 1);
            assert.equal(await positionSide(proxy.address), Side.LONG);
            assert.equal(await positionSide(u1), Side.SHORT);
            assert.equal(await positionSide(u2), Side.LONG);

            assert.equal(fromWad(await cashBalanceOf(u2)), '6883.333333333333333333');
            assert.equal(fromWad(await share.balanceOf(u2)), 0);
            assert.equal(fromWad(await positionEntryValue(u2)), '7777.777777777777777778'); // trade price * position
            assert.equal(fromWad(await perpetual.pnl.call(u2)), '-777.777777777777777779');

            assert.equal(fromWad(await amm.currentAvailableMargin.call()), '77855.555555555555555555'); // amm.x
            assert.equal(fromWad(await cashBalanceOf(proxy.address)), '140855.555555555555555555');
            assert.equal(fromWad(await positionEntryValue(proxy.address)), '63000');
            assert.equal(fromWad(await amm.currentFairPrice.call()), '8650.617283950617283951');
        });

        it("sell - success", async () => {
            await perpetual.setGovernanceParameter(toBytes32("tradingLotSize"), toWad(1));
            await perpetual.setGovernanceParameter(toBytes32("lotSize"), toWad(0.1));

            // sell 1, entryPrice will be 70000 / (10 + 1) = 6363 but markPrice is still 7000.
            // pnl = -636, positionMargin = 636
            await perpetual.deposit(toWad(2000), { from: u2 });
            try {
                await amm.sell(toWad(0.1), toWad(0), infinity, { from: u2 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("amount must be divisible by tradingLotSize"), error);
            }
            await amm.sell(toWad(1), toWad(0), infinity, { from: u2 });

            assert.equal(fromWad(await amm.positionSize()), 11);
            assert.equal(fromWad(await positionSize(proxy.address)), 11);
            assert.equal(fromWad(await positionSize(u1)), 10);
            assert.equal(fromWad(await positionSize(u2)), 1);
            assert.equal(await positionSide(proxy.address), Side.LONG);
            assert.equal(await positionSide(u1), Side.SHORT);
            assert.equal(await positionSide(u2), Side.SHORT);

            assert.equal(fromWad(await cashBalanceOf(u2)), '1904.545454545454545454');
            assert.equal(fromWad(await share.balanceOf(u2)), 0);
            assert.equal(fromWad(await positionEntryValue(u2)), '6363.636363636363636364'); // trade price * position
            assert.equal(fromWad(await perpetual.pnl.call(u2)), '-636.363636363636363637');

            assert.equal(fromWad(await amm.currentAvailableMargin.call()), 63700); // amm.x
            assert.equal(fromWad(await cashBalanceOf(proxy.address)), '140063.636363636363636364');
            assert.equal(fromWad(await positionEntryValue(proxy.address)), '76363.636363636363636364');
            assert.equal(fromWad(await amm.currentFairPrice.call()), '5790.909090909090909091');
        });
    });
});
