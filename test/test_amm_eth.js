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

contract('amm-eth', accounts => {
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

    const deploy = async (decimals = 18) => {
        priceFeeder = await PriceFeeder.new();
        globalConfig = await GlobalConfig.new();
        share = await ShareToken.new("ST", "STK", 18);
        perpetual = await Perpetual.new(
            globalConfig.address,
            dev,
            "0x0000000000000000000000000000000000000000",
            decimals
        );
        proxy = await Proxy.new(perpetual.address);
        amm = await AMM.new(proxy.address, priceFeeder.address, share.address);
        await share.addMinter(amm.address);
        await share.renounceMinter();

        await perpetual.setGovernanceAddress(toBytes32("amm"), amm.address);
        await perpetual.addWhitelisted(proxy.address);
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

    describe("composite helper", async () => {
        beforeEach(async () => {
            // index
            await setIndexPrice(7000);
            const indexPrice = await amm.indexPrice();
            assert.equal(fromWad(indexPrice.price), 7000);

            // create amm
            await perpetual.deposit(toWad(7000 * 10 * 2.1), { value: toWad(7000 * 10 * 2.1), from: u1 });
            await amm.createPool(toWad(10), { from: u1 });
        });

        it("depositAndBuy - success", async () => {
            // await amm.depositAndBuy(toWad(0), toWad(0), toWad('10000'), infinity, { value: toWad(0), from: u2 });
            await amm.depositAndBuy(toWad(7000 * 1), toWad(1), toWad('10000'), infinity, { value: toWad(7000 * 1), from: u2 });

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

        it("depositAndBuy, deposit = $0 - success", async () => {
            await perpetual.deposit(toWad(7000 * 1), { value: toWad(7000 * 1), from: u2 });
            assert.equal(fromWad(await cashBalanceOf(u2)), 7000 * 1);
            assert.equal(fromWad(await positionSize(u2)), 0);

            await amm.depositAndBuy(toWad(0), toWad(1), toWad('10000'), infinity, { from: u2 });
            assert.equal(fromWad(await cashBalanceOf(u2)), '6883.333333333333333333');
            assert.equal(fromWad(await positionSize(u2)), 1);
        });

        it("depositAndSell - success", async () => {
            await amm.depositAndSell(toWad(0), toWad(0), toWad(0), infinity, { value: toWad(0), from: u2 });
            await amm.depositAndSell(toWad(2000), toWad(1), toWad(0), infinity, { value: toWad(2000), from: u2 });

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

        it("depositAndAddLiquidity - success", async () => {
            await amm.depositAndAddLiquidity(toWad(0), toWad(0), { value: toWad(0), from: u2 });
            await amm.depositAndAddLiquidity(toWad(7000 * 3), toWad(1), { value: toWad(7000 * 3), from: u2 });

            assert.equal(fromWad(await cashBalanceOf(u2)), 7000);
            assert.equal(fromWad(await share.balanceOf(u2)), 1);
            assert.equal(fromWad(await positionSize(u2)), 1);
            assert.equal(await positionSide(u2), Side.SHORT);
            assert.equal(fromWad(await positionEntryValue(u2)), 7000);

            assert.equal(fromWad(await cashBalanceOf(proxy.address)), 154000); // 7000 * 2 * 10 when createPool + 7000 * 2 this time
            assert.equal(fromWad(await positionSize(proxy.address)), 11);
            assert.equal(await positionSide(proxy.address), Side.LONG);
            assert.equal(fromWad(await positionEntryValue(proxy.address)), 77000);
        });
    });

    describe("create amm", async () => {
        beforeEach(async () => {
            // index
            await setIndexPrice(7000);
            const indexPrice = await amm.indexPrice();
            assert.equal(fromWad(indexPrice.price), 7000);
        });

        it('should success', async () => {
            await perpetual.deposit(toWad(14700), { value: toWad(14700), from: u1 });
            await amm.createPool(toWad(1), { from: u1 });

            // await inspect(u1);
            // await inspect(proxy.address);
            // await printFunding();

            // position
            assert.equal(fromWad(await amm.positionSize()), 1);
            assert.equal(fromWad(await share.totalSupply()), 1);
            assert.equal(fromWad(await amm.currentAvailableMargin.call()), 7000 * 1);
            assert.equal(fromWad(await positionSize(u1)), 1);
            assert.equal(fromWad(await positionSize(proxy.address)), 1); // amm.y
            assert.equal(await positionSide(u1), Side.SHORT);
            assert.equal(await positionSide(proxy.address), Side.LONG);

            // perpetual
            assert.equal(await perpetual.isSafe.call(u1), true);
            assert.equal(await perpetual.isSafe.call(proxy.address), true);
            assert.equal(await perpetual.isBankrupt.call(u1), false);
            assert.equal(await perpetual.isBankrupt.call(proxy.address), false);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 0);
            assert.equal(fromWad(await perpetual.availableMargin.call(proxy.address)), 7000 * 2 - 7000 * 0.1); // amm.x
            assert.equal(fromWad(await perpetual.pnl.call(u1)), 0);
            assert.equal(fromWad(await perpetual.pnl.call(proxy.address)), 0);
            assert.equal(fromWad(await cashBalanceOf(u1)), 7000 * 0.1);
            assert.equal(fromWad(await cashBalanceOf(proxy.address)), 7000 * 2);
            assert.equal(fromWad(await positionEntryValue(u1)), 7000);
            assert.equal(fromWad(await positionEntryValue(proxy.address)), 7000);
            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 700);
            assert.equal(fromWad(await perpetual.positionMargin.call(proxy.address)), 700);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 350);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(proxy.address)), 350);

            // share
            assert.equal(fromWad(await share.balanceOf(u1)), 1);
            assert.equal(fromWad(await share.balanceOf(proxy.address)), 0);

            // funding
            const fundingState = await amm.currentFundingState.call();
            assert.equal(fromWad(await amm.currentFairPrice.call()), 7000);
            assert.equal(fromWad(await amm.currentPremium.call()), 0);
            assert.equal(fromWad(await amm.currentMarkPrice.call()), 7000);
            assert.equal(fromWad(await amm.currentPremiumRate.call()), 0);
            assert.equal(fromWad(await amm.currentFundingRate.call()), 0);
            assert.equal(fromWad(fundingState.lastIndexPrice), 7000);
            assert.equal(fromWad(fundingState.lastEMAPremium), 0);
            assert.equal(fromWad(fundingState.lastPremium), 0);
            assert.equal(fromWad(fundingState.accumulatedFundingPerContract), 0);
        });

        it('duplicated', async () => {
            await perpetual.deposit(toWad(14700), { value: toWad(14700), from: u1 });
            await amm.createPool(toWad(1), { from: u1 });
            try {
                await amm.createPool(toWad(1), { from: u1 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("pool not empty"), error);
            }
        });
    });

    describe("trading", async () => {
        beforeEach(async () => {
            // index
            await setIndexPrice(7000);
            const indexPrice = await amm.indexPrice();
            assert.equal(fromWad(indexPrice.price), 7000);

            // create amm
            await perpetual.deposit(toWad(147000), { value: toWad(147000), from: u1 });
            await amm.createPool(toWad(10), { from: u1 });
        });

        it("buy - success", async () => {
            // buy 1, entryPrice will be 70000 / (10 - 1) = 7777 but markPrice is still 7000
            // pnl = -777, positionMargin = 700

            await perpetual.deposit(toWad(7000), { value: toWad(7000), from: u2 });
            await amm.buy(toWad(1), toWad('10000'), infinity, { from: u2 });

            // await inspect(u1);
            // await inspect(u2);
            // await inspect(proxy.address);
            // await printFunding();

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

        // TODO: buy - success - amount is very close to amm.positionSize
        // TODO: buy - fail - amount >= amm.positionSize

        it("buy - fail - price limit", async () => {
            // 70000 / (10 - 1) = 7777.7
            await perpetual.deposit(toWad(7000), { value: toWad(7000), from: u2 });
            try {
                await amm.buy(toWad(1), toWad(7777), infinity, { from: u2 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("price limited"), error);
            }
            await amm.buy(toWad(1), toWad(7778), infinity, { from: u2 });
        });

        it("buy - success - pnl < 0, critical deposit amount", async () => {
            // buy 0.1, entryPrice will be 70000 / (10 - 0.1) = 7070 but markPrice is still 7000
            // deposit = positionMargin + fee - pnl
            // = markPrice * newPos * IMR + tradePrice * newPos * fee - (markPrice - newEntryPrice) * newPos
            await perpetual.deposit(toWad('87.67676767676767677'), { value: toWad('87.67676767676767677'), from: u2 });
            await amm.buy(toWad(0.1), toWad('10000'), infinity, { from: u2 });
        });

        it("buy - fail - pnl < 0, lower than critical deposit amount", async () => {
            await perpetual.deposit(toWad('87.67676767676767676'), { value: toWad('87.67676767676767676'), from: u2 });
            try {
                await amm.buy(toWad(0.1), toWad('10000'), infinity, { from: u2 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("im unsafe"), error);
            }
        });

        it("buy - fail - deadline", async () => {
            await perpetual.deposit(toWad(7000), { value: toWad(7000), from: u2 });

            const t1 = (await amm.mockBlockTimestamp()).toNumber();
            await amm.setBlockTimestamp(t1 + 600);
            try {
                await amm.buy(toWad(1), toWad('10000'), t1 + 100, { from: u2 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("deadline"), error);
            }
        });

        it("sell - fail - price unsafe", async () => {
            await perpetual.deposit(toWad(700), { value: toWad(700), from: u2 });
            try {
                await amm.sell(toWad(1), toWad(0), infinity, { from: u2 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("im unsafe"), error);
            }
        });

        it("sell - fail - price limit", async () => {
            await perpetual.deposit(toWad(7000), { value: toWad(7000), from: u2 });
            try {
                await amm.sell(toWad(1), toWad(6364), infinity, { from: u2 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("price limited"), error);
            }
            await amm.sell(toWad(1), toWad(6363), infinity, { from: u2 });
        });

        it("sell - success", async () => {
            // sell 1, entryPrice will be 70000 / (10 + 1) = 6363 but markPrice is still 7000.
            // pnl = -636, positionMargin = 636
            await perpetual.deposit(toWad(2000), { value: toWad(2000), from: u2 });
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

        it("buy and sell - success", async () => {
            await perpetual.deposit(toWad(7000), { value: toWad(7000), from: u2 });
            await amm.buy(toWad(1), toWad('8100'), infinity, { from: u2 });
            assert.equal(fromWad(await amm.positionSize()), 9);
            assert.equal(fromWad(await positionSize(proxy.address)), 9);
            assert.equal(fromWad(await positionSize(u2)), 1);
            assert.equal(await positionSide(proxy.address), Side.LONG);
            assert.equal(await positionSide(u2), Side.LONG);
            assert.equal(fromWad(await cashBalanceOf(u2)), '6883.333333333333333333');
            assert.equal(fromWad(await positionEntryValue(u2)), '7777.777777777777777778');
            assert.equal(fromWad(await perpetual.pnl.call(u2)), '-777.777777777777777779');

            assert.equal(fromWad(await amm.currentAvailableMargin.call()), '77855.555555555555555555'); // amm.x
            assert.equal(fromWad(await cashBalanceOf(proxy.address)), '140855.555555555555555555');
            assert.equal(fromWad(await positionEntryValue(proxy.address)), '63000');
            assert.equal(fromWad(await amm.currentFairPrice.call()), '8650.617283950617283951');

            await amm.sell(toWad(2), toWad(0), infinity, { from: u2 });

            assert.equal(fromWad(await amm.positionSize()), 11);
            assert.equal(fromWad(await positionSize(proxy.address)), 11);
            assert.equal(fromWad(await positionSize(u1)), 10);
            assert.equal(fromWad(await positionSize(u2)), 1);
            assert.equal(await positionSide(proxy.address), Side.LONG);
            assert.equal(await positionSide(u1), Side.SHORT);
            assert.equal(await positionSide(u2), Side.SHORT);
            assert.equal(fromWad(await cashBalanceOf(u2)), '5970.999999999999999998');
            assert.equal(fromWad(await positionEntryValue(u2)), '7077.777777777777777778');
            assert.equal(fromWad(await perpetual.pnl.call(u2)), '77.777777777777777777');

            assert.equal(fromWad(await amm.currentAvailableMargin.call()), '63841.555555555555555555'); // amm.x
            assert.equal(fromWad(await cashBalanceOf(proxy.address)), '140997.111111111111111111');
            assert.equal(fromWad(await positionEntryValue(proxy.address)), '77155.555555555555555556');
            assert.equal(fromWad(await amm.currentFairPrice.call()), '5803.777777777777777778');
        });

        it("sell - fail - deadline", async () => {
            await perpetual.deposit(toWad(1100),{ value: toWad(1100), from: u2 });
            const t1 = (await amm.mockBlockTimestamp()).toNumber();
            await amm.setBlockTimestamp(t1 + 600);
            try {
                await amm.sell(toWad(1), toWad(0), t1 + 100, { from: u2 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("deadline"), error);
            }
        });

        it('addLiquidity - fail - no marginBalance', async () => {
            try {
                await amm.addLiquidity(toWad(1), { from: u2 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("im unsafe"), error);
            }
        });

        it('addLiquidity - fail - unsafe', async () => {
            try {
                await perpetual.deposit(toWad(14000), { value: toWad(14000), from: u2 });
                await amm.addLiquidity(toWad(1), { from: u2 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("im unsafe"), error);
            }
        });

        it("addLiquidity - success", async () => {
            await perpetual.deposit(toWad(21000), { value: toWad(21000), from: u2 });
            await amm.addLiquidity(toWad(1), { from: u2 });

            assert.equal(fromWad(await cashBalanceOf(u2)), 7000);
            assert.equal(fromWad(await share.balanceOf(u2)), 1);
            assert.equal(fromWad(await positionSize(u2)), 1);
            assert.equal(await positionSide(u2), Side.SHORT);
            assert.equal(fromWad(await positionEntryValue(u2)), 7000);

            assert.equal(fromWad(await cashBalanceOf(proxy.address)), 154000); // 7000 * 2 * 10 when createPool + 7000 * 2 this time
            assert.equal(fromWad(await positionSize(proxy.address)), 11);
            assert.equal(await positionSide(proxy.address), Side.LONG);
            assert.equal(fromWad(await positionEntryValue(proxy.address)), 77000);
        });

        it('removeLiquidity - fail - shareBalance limited', async () => {
            try {
                await amm.removeLiquidity(toWad(1), { from: u2 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("shareBalance limited"), error);
            }
        });

        it("removeLiquidity - success", async () => {
            await perpetual.deposit(toWad(21000), { value: toWad(21000), from: u2 });
            await amm.addLiquidity(toWad(1), { from: u2 });
            await share.approve(amm.address, infinity, { from: u2 });

            await amm.removeLiquidity(toWad(1), { from: u2 });
            assert.equal(fromWad(await cashBalanceOf(u2)), 7000 * 3);
            assert.equal(fromWad(await share.balanceOf(u2)), 0);
            assert.equal(fromWad(await positionSize(u2)), 0);
            assert.equal(await positionSide(u2), Side.FLAT);
            assert.equal(fromWad(await positionEntryValue(u2)), 0);

            assert.equal(fromWad(await cashBalanceOf(proxy.address)), 140000);
            assert.equal(fromWad(await positionSize(proxy.address)), 10);
            assert.equal(await positionSide(proxy.address), Side.LONG);
            assert.equal(fromWad(await positionEntryValue(proxy.address)), 70000);
        });

        it("removeLiquidity - no position on removing liqudity", async () => {
            await perpetual.deposit(toWad(21000), { value: toWad(21000), from: u2 });
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

            // price == 8477.7 * amount == 7707
            assert.equal(fromWad(await cashBalanceOf(u2)), 6184.5 + 15414);
            assert.equal(fromWad(await share.balanceOf(u2)), 0);
            assert.equal(fromWad(await positionSize(u2)), "0.909090909090909091");
            assert.equal(await positionSide(u2), Side.LONG);
            assert.equal(fromWad(await positionEntryValue(u2)), 7707);
        });

        it("removeLiquidity - transfer share", async () => {
            await perpetual.deposit(toWad(21000), { value: toWad(21000), from: u2 });
            await amm.addLiquidity(toWad(1), { from: u2 });

            await perpetual.deposit(toWad(21000), { value: toWad(21000), from: u3 });

            assert.equal(fromWad(await cashBalanceOf(u2)), 7000);
            assert.equal(fromWad(await share.balanceOf(u2)), 1);
            assert.equal(fromWad(await positionSize(u2)), 1);
            assert.equal(await positionSide(u2), Side.SHORT);
            assert.equal(fromWad(await positionEntryValue(u2)), 7000);

            // price == 7000
            await share.transfer(u3, toWad(1), { from: u2 });
            assert.equal(await share.balanceOf(u2), toWad(0));
            assert.equal(await share.balanceOf(u3), toWad(1));

            try {
                await amm.removeLiquidity(toWad(1), { from: u2 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("shareBalance limited"), error);
            }

            // price == 7000 * amount == 0
            await amm.removeLiquidity(toWad(1), { from: u3 });
            assert.equal(fromWad(await cashBalanceOf(u3)), 21000 + 14000);
            assert.equal(fromWad(await share.balanceOf(u3)), 0);
            assert.equal(fromWad(await positionSize(u3)), 1);
            assert.equal(await positionSide(u3), Side.LONG);
            assert.equal(fromWad(await positionEntryValue(u3)), 7000);
        });

        it("updateIndex", async () => {
            await perpetual.deposit(toWad(7000), { value: toWad(7000), from: dev });

            //index price not change
            await amm.updateIndex({ from: u2 });
            assert.equal(fromWad(await cashBalanceOf(u2)), 0);

            //index price changed, updatePremiumPrize = 1 * 10**18
            await setIndexPrice(8000);
            await amm.updateIndex({ from: u2 });
            assert.equal(fromWad(await cashBalanceOf(u2)), 1);
        });
    });

    describe("settle", async () => {
        let u1Balance

        beforeEach(async () => {
            await setIndexPrice(1 / 160);
            // create amm
            u1Balance = new BigNumber(await web3.eth.getBalance(u1));
            await perpetual.deposit(toWad(50), { value: toWad(50), from: u1 });
            await amm.createPool(toWad(3360), { from: u1 });
            let u1Balance2 = new BigNumber(await web3.eth.getBalance(u1));
            assertApproximate(assert, fromWad(u1Balance.minus(u1Balance2)), 50, 0.5);
        });

        it("settle", async () => {
            await perpetual.beginGlobalSettlement(toWad(1 / 160));
            assert.equal(fromWad(await share.balanceOf(u1)), 3360);
            try {
                await amm.removeLiquidity(toWad(3360), { from: u1 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("wrong perpetual status"), error);
            }

            await perpetual.endGlobalSettlement();
            assert.equal(fromWad(await share.balanceOf(u1)), 3360);
            await amm.settleShare({ from: u1 });
            await perpetual.settle({ from: u1 });

            assert.equal(fromWad(await share.balanceOf(u1)), 0);
            let u1Balance2 = new BigNumber(await web3.eth.getBalance(u1));
            console.log(fromWad(u1Balance.minus(u1Balance2)))
            assertApproximate(assert, fromWad(u1Balance.minus(u1Balance2)), 0, 0.5);

            // await inspect(u1, perpetual, proxy, amm);
            // await printFunding(amm, perpetual);
        });

    });

    describe("case review", async () => {
        it("sellAndWithdraw0408", async () => {
            await setIndexPrice('0.005799583022688399');
            await perpetual.forceSetTotalSize(toWad(9280));
            await perpetual.forceSetPosition(u2, {
                cashBalance: toWad('0.964076134677459824'),
                side: Side.LONG,
                size: toWad('50'),
                entryValue: toWad('0.2891254315304948'),
                entrySocialLoss: toWad('0'),
                entryFundingLoss: toWad('0.0032030281077095'),
            });
            await perpetual.forceSetPosition(proxy.address, {
                cashBalance: toWad('97.885161577581446197'),
                side: Side.LONG,
                size: toWad('7940'),
                entryValue: toWad('51.680889367347830167'),
                entrySocialLoss: toWad('0'),
                entryFundingLoss: toWad('0.417569151810963659'),
            });
            await amm.forceSetFunding({
                lastFundingTime: Math.floor(Date.now() / 1000) - 60,
                lastPremium: toWad('0.000004159256577335'),
                lastEMAPremium: toWad('0.000020320664398204'),
                lastIndexPrice: toWad('0.005799583022688399'),
                accumulatedFundingPerContract: toWad('0.00006802615424114'),
            })
            await perpetual.deposit(toWad(3000), { value: toWad(3000), from: admin }); // force save

            // this should be success
            // await amm.sell(toWad(10), toWad(0), infinity, { from: u2 });
            // await perpetual.withdraw(toWad('0.2'), { from: u2 });
            await amm.sellAndWithdraw(toWad(10), toWad(0.005187165044749446), infinity, toWad('0.7336625472254555'), { from: u2 });
            // await inspect(u2)
        });
    });
});