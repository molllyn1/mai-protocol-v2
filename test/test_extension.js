const assert = require('assert');
const { increaseEvmBlock, toBytes32 } = require('./funcs');
const { toWad, fromWad, infinity } = require('./constants');

const TestToken = artifacts.require('test/TestToken.sol');
const TestFundingMock = artifacts.require('test/TestFundingMock.sol');
const TestPerpetual = artifacts.require('test/TestPerpetual.sol');
const GlobalConfig = artifacts.require('perpetual/GlobalConfig.sol');

contract('TestExtension', accounts => {
    const NORMAL = 0;
    const SETTLING = 1;
    const SETTLED = 2;

    const FLAT = 0;
    const SHORT = 1;
    const LONG = 2;

    let collateral;
    let global;
    let perpetual;

    const broker = accounts[9];
    const admin = accounts[0];
    const dev = accounts[1];

    const u1 = accounts[4];
    const u2 = accounts[5];
    const u3 = accounts[6];

    const users = {
        broker,
        admin,
        u1,
        u2,
        u3,
    };

    const increaseBlockBy = async (n) => {
        for (let i = 0; i < n; i++) {
            await increaseEvmBlock();
        }
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

    const deploy = async (cDecimals = 18) => {
        collateral = await TestToken.new("TT", "TestToken", cDecimals);
        global = await GlobalConfig.new();
        perpetual = await TestPerpetual.new(
            global.address,
            dev,
            collateral.address,
            cDecimals
        );
        await setDefaultGovParameters();
    };

    const cashBalanceOf = async (user) => {
        const cashAccount = await perpetual.getMarginAccount(user);
        return cashAccount.cashBalance;
    }

    describe("trade", async () => {
        beforeEach(deploy);

        it('buy', async () => {

            let funding7k = await TestFundingMock.new();
            await funding7k.setMarkPrice(toWad(7000));
            await perpetual.setGovernanceAddress(toBytes32("amm"), funding7k.address);

            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(perpetual.address, infinity, { from: u1 });

            await perpetual.addWhitelisted(admin);
            await perpetual.depositFor(u1, toWad(1000));

            await perpetual.oneSideTradePublic(u1, LONG, toWad(7000), toWad(1));

            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 700);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 350);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), 1000);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), 0);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 300);
            assert.equal(await perpetual.isSafe.call(u1), true);
            assert.equal(await perpetual.isBankrupt.call(u1), false);

            let funding6k = await TestFundingMock.new();
            await funding6k.setMarkPrice(toWad(6000));
            await perpetual.setGovernanceAddress(toBytes32("amm"), funding6k.address);

            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 600);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 300);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), -1e-18);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), -1000 - 1e-18);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), -600 - 1e-18);
            assert.equal(await perpetual.isSafe.call(u1), false);
            assert.equal(await perpetual.isBankrupt.call(u1), true);
        });

        it('sell', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(perpetual.address, infinity, { from: u1 });

            await perpetual.addWhitelisted(admin);
            await perpetual.depositFor(u1, toWad(1000));

            let funding7k = await TestFundingMock.new();
            await funding7k.setMarkPrice(toWad(7000));
            await perpetual.setGovernanceAddress(toBytes32("amm"), funding7k.address);

            await perpetual.oneSideTradePublic(u1, SHORT, toWad(7000), toWad(1));

            console.log(await perpetual.getMarginAccount(u1));

            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 700);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 350);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), 1000);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), 0);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 300);
            assert.equal(await perpetual.isSafe.call(u1), true);
            assert.equal(await perpetual.isBankrupt.call(u1), false);

            let funding6k = await TestFundingMock.new();
            await funding6k.setMarkPrice(toWad(6000));
            await perpetual.setGovernanceAddress(toBytes32("amm"), funding6k.address);

            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 600);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 300);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), 2000);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), 1000);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 1400);
            assert.equal(await perpetual.isSafe.call(u1), true);
            assert.equal(await perpetual.isBankrupt.call(u1), false);
        });

        // it('using dev', async () => {
        //     let funding6k = await TestFundingMock.new();
        //     await funding6k.setMarkPrice(toWad(6000));
        //     await perpetual.setGovernanceAddress(toBytes32("amm"), funding6k.address);

        //     await collateral.transfer(u1, toWad(10000));
        //     await collateral.approve(perpetual.address, infinity, { from: u1 });
        //     await perpetual.addWhitelisted(admin);

        //     await perpetual.depositFor(u1, toWad(1000));
        //     // 1%
        //     await perpetual.claimTakerDevFee(u1, toWad(6000), toWad(1), toWad(0));
        //     assert.equal(fromWad((await cashBalanceOf(await perpetual.devAddress())).toString()), 60);

        //     await perpetual.setDevAddress(u2);
        //     assert.equal(await perpetual.devAddress(), u2);

        //     await perpetual.claimTakerDevFee(u1, toWad(6000), toWad(1), toWad(0));
        //     assert.equal(fromWad(await cashBalanceOf(u2)), 60);
        //     assert.equal(fromWad(await cashBalanceOf(await perpetual.devAddress())), 60);

        //     await perpetual.applyForWithdrawal(toWad(60), { from: u2 });
        //     await increaseBlockBy(5);

        //     await perpetual.withdraw(toWad(60), { from: u2 });
        //     assert.equal(fromWad(await cashBalanceOf(u2)), 0);
        //     assert.equal(await collateral.balanceOf(u2), toWad(60));
        // });
    });
});