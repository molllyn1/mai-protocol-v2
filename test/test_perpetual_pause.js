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

    beforeEach(deploy);

    it('disable-withdraw', async () => {
        await funding.setMarkPrice(toWad(7000));

        await collateral.transfer(u1, toWad(2000));
        await collateral.approve(perpetual.address, infinity, { from: u1 });
        await perpetual.deposit(toWad(1000), { from: u1 });

        await globalConfig.addWithdrawController(u2);
        assert.ok(await globalConfig.withdrawControllers(u2));

        await perpetual.disableWithdraw({ from: u2 });
        // Withdraw     ×
        try {
            await perpetual.withdraw(toWad(1), {from: u1});
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("withdraw disabled"))
        }
        // Desposit     √
        await perpetual.deposit(toWad(1000), { from: u1 });
        await globalConfig.addComponent(perpetual.address, u1);
        // Trade        √
        await perpetual.tradePosition(u1, u2, LONG, toWad(7000), toWad(1), { from: u1 });
        // Liquidate    √
        try {
            await perpetual.liquidate(u1, toWad(1), { from: u1 });
        } catch (error) {
            assert.ok(error.message.includes("self liquidate"))
        }
        // Transfer     √
        await perpetual.transferCashBalance(u1, u2, toWad(1), { from: u1 });

        await perpetual.enableWithdraw({ from: u2 });
        // Withdraw     √
        await perpetual.withdraw(toWad(1), {from: u1});

        await globalConfig.removeWithdrawController(u2);
        try {
            await perpetual.disableWithdraw({ from: u2 });
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("unauthorized caller"))
        }

    });

    it('disable-withdraw', async () => {
        await funding.setMarkPrice(toWad(7000));

        await collateral.transfer(u1, toWad(2000));
        await collateral.approve(perpetual.address, infinity, { from: u1 });
        await perpetual.deposit(toWad(1000), { from: u1 });

        await globalConfig.addWithdrawController(u2);
        assert.ok(await globalConfig.withdrawControllers(u2));

        await perpetual.disableWithdraw({ from: u2 });
        // Withdraw     ×
        try {
            await perpetual.withdraw(toWad(1), {from: u1});
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("withdraw disabled"))
        }
        // Desposit     √
        await perpetual.deposit(toWad(1000), { from: u1 });
        await globalConfig.addComponent(perpetual.address, u1);
        // Trade        √
        await perpetual.tradePosition(u1, u2, LONG, toWad(7000), toWad(1), { from: u1 });
        // Liquidate    √
        try {
            await perpetual.liquidate(u1, toWad(1), { from: u1 });
        } catch (error) {
            assert.ok(error.message.includes("self liquidate"))
        }
        // Transfer     √
        await perpetual.transferCashBalance(u1, u2, toWad(1), { from: u1 });

        await perpetual.enableWithdraw({ from: u2 });
        // Withdraw     √
        await perpetual.withdraw(toWad(1), {from: u1});

        await globalConfig.removeWithdrawController(u2);
        try {
            await perpetual.disableWithdraw({ from: u2 });
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("unauthorized caller"))
        }

    });

    it('pause', async () => {
        await funding.setMarkPrice(toWad(7000));

        await collateral.transfer(u1, toWad(2000));
        await collateral.approve(perpetual.address, infinity, { from: u1 });
        await perpetual.deposit(toWad(1000), { from: u1 });

        await globalConfig.addPauseController(u2);
        assert.ok(await globalConfig.pauseControllers(u2));

        await perpetual.pause({ from: u2 });
        // Withdraw     ×
        try {
            await perpetual.withdraw(toWad(1), {from: u1});
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("system paused"))
        }
        await globalConfig.addComponent(perpetual.address, u1);
        // Desposit     ×
        try {
            await perpetual.deposit(toWad(1000), { from: u1 });
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("system paused"))
        }
        // Trade        ×
        try {
            await perpetual.tradePosition(u1, u2, LONG, toWad(7000), toWad(1), { from: u1 });
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("system paused"))
        }
        // Liquidate    ×
        try {
            await perpetual.liquidate(u1, toWad(1), { from: u1 });
        } catch (error) {
            assert.ok(error.message.includes("system paused"))
        }
        // Transfer     ×
        try {
            await perpetual.transferCashBalance(u1, u2, toWad(1), { from: u1 });
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("system paused"))
        }

        await perpetual.unpause({ from: u2 });


        await globalConfig.removePauseController(u2);
        try {
            await perpetual.pause({ from: u2 });
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("unauthorized caller"))
        }


        // Withdraw     √
        await perpetual.withdraw(toWad(1), {from: u1});
        // Desposit     √
        await perpetual.deposit(toWad(1000), { from: u1 });
        await perpetual.tradePosition(u1, u2, LONG, toWad(7000), toWad(1), { from: u1 });

        // Liquidate    ×
        try {
            await perpetual.liquidate(u1, toWad(1), { from: u1 });
        } catch (error) {
            assert.ok(error.message.includes("self liquidate"))
        }
        await perpetual.transferCashBalance(u1, u2, toWad(1), { from: u1 });
    });
});