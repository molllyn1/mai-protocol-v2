const assert = require('assert');
const BigNumber = require('bignumber.js');
const { increaseEvmBlock, increaseEvmTime, createEVMSnapshot, restoreEVMSnapshot, toBytes32, assertApproximate } = require('./funcs');
const { toWei, fromWei, toWad, fromWad, infinity, Side } = require('./constants');
const { inspect, printFunding } = require('./funcs')

const TestToken = artifacts.require('test/TestToken.sol');
const PriceFeeder = artifacts.require('test/TestPriceFeeder.sol');
const GlobalConfig = artifacts.require('perpetual/GlobalConfig.sol');
const Perpetual = artifacts.require('test/TestPerpetual.sol');
const AMM = artifacts.require('test/TestAMM.sol');
const Proxy = artifacts.require('proxy/Proxy.sol');
const ShareToken = artifacts.require('token/ShareToken.sol');

const gasLimit = 8000000;

contract('amm-zero-cash', accounts => {
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
            await increaseBlockBy(4);

            // create amm
            await perpetual.deposit(toWad(7000 * 10 * 2.1), { from: u1 });
            await amm.createPool(toWad(10), { from: u1 });
        });

        it("updateIndex - fail - dev account is empty", async () => {
            await setIndexPrice(7001);
            assert.equal(fromWad(await cashBalanceOf(dev)), 0);
            try {
                await amm.updateIndex({ from: u2 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("dev unsafe"), error);
            }
        });

        it("buy - success - without cash", async () => {
            // tradePrice = 7777.777777777777777778, fee = 116.666666666666666667
            // marginBalance = 8771.60493827160493828, im = 8771.60493827160493828
            await setIndexPrice('8771.604938271604938272');
            try {
                await amm.buy(toWad(1), toWad('10000'), infinity, { from: u2 });
            } catch (error) {
                assert.ok(error.message.includes("im unsafe "), error);
            }

            await setIndexPrice('8771.604938271604938273');
            await amm.buy(toWad(1), toWad('10000'), infinity, { from: u2 });

            assert.equal(fromWad(await cashBalanceOf(u2)), '-116.666666666666666667');
            assert.equal(fromWad(await positionSize(u2)), 1);
            assert.equal(await positionSide(u2), Side.LONG);
            assert.equal(fromWad(await positionEntryValue(u2)), '7777.777777777777777778');
            assert.equal(fromWad(await perpetual.positionMargin.call(u2)), '877.160493827160493827');
            assert.equal(fromWad(await perpetual.marginBalance.call(u2)), '877.160493827160493827');
            assert.equal(fromWad(await perpetual.availableMargin.call(u2)), 0);
            assert.equal(await perpetual.isSafe.call(u2), true);
            assert.equal(await perpetual.isBankrupt.call(u2), false);

            // await inspect(u2);
            // await inspect(proxy.address);
        });

        it("addLiquidity - success - using pnl", async () => {
            await perpetual.deposit(toWad(7000 * 1), { from: u2 });
            await perpetual.deposit(toWad(7000 * 1), { from: u3 });

            await amm.sell(toWad(1), toWad('5000'), infinity, { from: u3 });
            await amm.buy(toWad(1), toWad('10000'), infinity, { from: u2 });
            await setIndexPrice(20000);

            // await inspect(u2, perpetual, proxy, amm);
            // await inspect(proxy.address, perpetual, proxy, amm);
            // await printFunding(amm, perpetual);

            // markPrice = 20000, entry = 6370, cash = 6904.45, fair = 7013.37
            // now addLiquidity(x), will pay x * 7013.37 * 2 and close x long positions. if x < 1:
            // marginBalance = 6904.45 - x * 7013.37 * 2 + (7013.37 - 6370) x + (20000 - 6370) (1 - x),
            // im = (1 - x) * 20000 / leverage. let leverage = 20, x = 0.750939

            try {
                await amm.addLiquidity(toWad(0.76), { from: u2 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("sender unsafe"), error);
            }

            await amm.addLiquidity(toWad(0.75), { from: u2 });

            // await inspect(u2, perpetual, proxy, amm);

            assert.ok(fromWad(await cashBalanceOf(u2)) < -3130);
            assert.ok(fromWad(await cashBalanceOf(u2)) > -3146);
            assert.equal(fromWad(await share.balanceOf(u2)), '0.75');
            assert.equal(fromWad(await positionSize(u2)), '0.25');
            assert.equal(await positionSide(u2), Side.LONG);
            assert.ok(fromWad(await perpetual.positionMargin.call(u2)) > 499);
            assert.ok(fromWad(await perpetual.positionMargin.call(u2)) < 501);
            assert.ok(fromWad(await perpetual.maintenanceMargin.call(u2)) > 248);
            assert.ok(fromWad(await perpetual.maintenanceMargin.call(u2)) < 273);
            assert.ok(fromWad(await perpetual.marginBalance.call(u2)) > 250);
            assert.ok(fromWad(await perpetual.marginBalance.call(u2)) < 275);
        });
    });

});