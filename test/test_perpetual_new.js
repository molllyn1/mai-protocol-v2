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
const TestFundingMock = artifacts.require('test/TestFundingMock.sol');
const TestPerpetual = artifacts.require('test/TestPerpetual.sol');
const GlobalConfig = artifacts.require('globalConfig/GlobalConfig.sol');

contract('TestPerpetual', async accounts => {
    const NORMAL = 0;
    const EMERGENCY = 1;
    const SETTLED = 2;

    const FLAT = 0;
    const SHORT = 1;
    const LONG = 2;

    let collateral;
    let globalConfig;
    let funding;
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
        globalConfig = await GlobalConfig.new();
        assert.equal(await globalConfig.owner(), admin);
        collateral = await TestToken.new("TT", "TestToken", cDecimals);
        funding = await TestFundingMock.new();
        perpetual = await TestPerpetual.new(
            globalConfig.address,
            dev,
            collateral.address,
            cDecimals
        );
        assert.equal(await globalConfig.owner(), admin);
        await perpetual.setGovernanceAddress(toBytes32("amm"), funding.address);
        await setDefaultGovParameters();
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
    const positionEntrySocialLoss = async (user) => {
        const positionAccount = await perpetual.getMarginAccount(user);
        return positionAccount.entrySocialLoss;
    }
    const positionEntryFundingLoss = async (user) => {
        const positionAccount = await perpetual.getMarginAccount(user);
        return positionAccount.entryFundingLoss;
    }
    const cashBalanceOf = async (user) => {
        const cashAccount = await perpetual.getMarginAccount(user);
        return cashAccount.cashBalance;
    }
    const isPositionBalanced = async () => {
        const long = (await perpetual.totalSize(LONG)).toString();
        const short = (await perpetual.totalSize(SHORT)).toString();
        const flat = (await perpetual.totalSize(FLAT)).toString();
        return (long == short) && (flat == "0")
    }

    it('exceptions', async () => {
        await deploy();

        await globalConfig.addComponent(perpetual.address, admin);
        await funding.setMarkPrice(toWad(7000));

        try {
            await perpetual.tradePosition(u1, u2, FLAT, toWad(7000), toWad(1));
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("invalid side"))
        }

        await perpetual.setGovernanceParameter(toBytes32("tradingLotSize"), toWad(1));
        await perpetual.setGovernanceParameter(toBytes32("lotSize"), toWad(1));
        try {
            await perpetual.tradePosition(u1, u2, LONG, toWad(7000), toWad(0.5));
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("invalid lot size"))
        }
    })

    describe("tradePosition", async () => {
        beforeEach(async () => {
            await deploy();

            await collateral.transfer(u1, toWad(1000));
            await collateral.approve(perpetual.address, infinity, { from: u1 });

            await globalConfig.addComponent(perpetual.address, admin);
            await perpetual.depositFor(u1, toWad(1000));

            await collateral.transfer(u2, toWad(1000));
            await collateral.approve(perpetual.address, infinity, { from: u2 });

            await perpetual.depositFor(u2, toWad(1000));
 
            await funding.setMarkPrice(toWad(7000));
        });

        it('buy', async () => {

            await funding.setMarkPrice(toWad(7000));

            await perpetual.tradePosition(u1, u2, LONG, toWad(7000), toWad(1));
            
            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 700);
            assert.equal(await positionSide(u1), LONG);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 350);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), 1000);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), 0);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 300);
            assert.equal(await perpetual.isSafe.call(u1), true);
            assert.equal(await perpetual.isBankrupt.call(u1), false);

            assert.equal(fromWad(await perpetual.positionMargin.call(u2)), 700);
            assert.equal(await positionSide(u2), SHORT);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u2)), 350);
            assert.equal(fromWad(await perpetual.marginBalance.call(u2)), 1000);
            assert.equal(fromWad(await perpetual.pnl.call(u2)), 0);
            assert.equal(fromWad(await perpetual.availableMargin.call(u2)), 300);
            assert.equal(await perpetual.isSafe.call(u2), true);
            assert.equal(await perpetual.isBankrupt.call(u2), false);

            await funding.setMarkPrice(toWad(6000));
            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 600);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 300);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), -1e-18);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), -1000 - 1e-18);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), -600);
            assert.equal(await perpetual.isSafe.call(u1), false);
            assert.equal(await perpetual.isBankrupt.call(u1), true);

            assert.equal(fromWad(await perpetual.positionMargin.call(u2)), 600);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u2)), 300);
            assert.equal(fromWad(await perpetual.marginBalance.call(u2)), 2000);
            assert.equal(fromWad(await perpetual.pnl.call(u2)), 1000);
            assert.equal(fromWad(await perpetual.availableMargin.call(u2)), 1400);
            assert.equal(await perpetual.isSafe.call(u2), true);
            assert.equal(await perpetual.isBankrupt.call(u2), false);

            await funding.setMarkPrice(toWad(5000));
            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 500);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 250);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), -1000);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), -2000);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), -1500);
            assert.equal(await perpetual.isSafe.call(u1), false);
            assert.equal(await perpetual.isBankrupt.call(u1), true);

            assert.equal(fromWad(await perpetual.positionMargin.call(u2)), 500);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u2)), 250);
            assert.equal(fromWad(await perpetual.marginBalance.call(u2)), 3000);
            assert.equal(fromWad(await perpetual.pnl.call(u2)), 2000);
            assert.equal(fromWad(await perpetual.availableMargin.call(u2)), 2500);
            assert.equal(await perpetual.isSafe.call(u2), true);
            assert.equal(await perpetual.isBankrupt.call(u2), false);

            await funding.setMarkPrice(toWad(8000));
            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 800);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 400);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), 2000);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), 1000);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 1200);
            assert.equal(await perpetual.isSafe.call(u1), true);
            assert.equal(await perpetual.isBankrupt.call(u1), false);

            assert.equal(fromWad(await perpetual.positionMargin.call(u2)), 800);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u2)), 400);
            assert.equal(fromWad(await perpetual.marginBalance.call(u2)), -1 * 10**-18);
            assert.equal(fromWad(await perpetual.pnl.call(u2)), -1000);
            assert.equal(fromWad(await perpetual.availableMargin.call(u2)), -800);
            assert.equal(await perpetual.isSafe.call(u2), false);
            assert.equal(await perpetual.isBankrupt.call(u2), true);

        });

        it('sell', async () => {
            await funding.setMarkPrice(toWad(7000));

            await perpetual.tradePosition(u1, u2, SHORT, toWad(7000), toWad(1));

            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 700);
            assert.equal(await positionSide(u1), SHORT);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 350);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), 1000);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), 0);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 300);
            assert.equal(await perpetual.isSafe.call(u1), true);
            assert.equal(await perpetual.isBankrupt.call(u1), false);

            assert.equal(fromWad(await perpetual.positionMargin.call(u2)), 700);
            assert.equal(await positionSide(u2), LONG);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u2)), 350);
            assert.equal(fromWad(await perpetual.marginBalance.call(u2)), 1000);
            assert.equal(fromWad(await perpetual.pnl.call(u2)), 0);
            assert.equal(fromWad(await perpetual.availableMargin.call(u2)), 300);
            assert.equal(await perpetual.isSafe.call(u2), true);
            assert.equal(await perpetual.isBankrupt.call(u2), false);

            await funding.setMarkPrice(toWad(6000));
            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 600);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 300);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), 2000);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), 1000);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 1400);
            assert.equal(await perpetual.isSafe.call(u1), true);
            assert.equal(await perpetual.isBankrupt.call(u1), false);

            assert.equal(fromWad(await perpetual.positionMargin.call(u2)), 600);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u2)), 300);
            assert.equal(fromWad(await perpetual.marginBalance.call(u2)), -1 * 10 ** -18);
            assert.equal(fromWad(await perpetual.pnl.call(u2)), -1000);
            assert.equal(fromWad(await perpetual.availableMargin.call(u2)), -600);
            assert.equal(await perpetual.isSafe.call(u2), false);
            assert.equal(await perpetual.isBankrupt.call(u2), true);

            await funding.setMarkPrice(toWad(8000));
            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 800);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 400);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), -1e-18);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), -1000 - 1e-18);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), -800);
            assert.equal(await perpetual.isSafe.call(u1), false);
            assert.equal(await perpetual.isBankrupt.call(u1), true);

            assert.equal(fromWad(await perpetual.positionMargin.call(u2)), 800);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u2)), 400);
            assert.equal(fromWad(await perpetual.marginBalance.call(u2)), 2000);
            assert.equal(fromWad(await perpetual.pnl.call(u2)), 1000);
            assert.equal(fromWad(await perpetual.availableMargin.call(u2)), 1200);
            assert.equal(await perpetual.isSafe.call(u2), true);
            assert.equal(await perpetual.isBankrupt.call(u2), false);
        });
    });
});