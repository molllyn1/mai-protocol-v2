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
const GlobalConfig = artifacts.require('perpetual/GlobalConfig.sol');

contract('TestPerpetual', accounts => {
    const NORMAL = 0;
    const SETTLING = 1;
    const SETTLED = 2;

    const FLAT = 0;
    const SHORT = 1;
    const LONG = 2;

    let collateral;
    let global;
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
        await global.setGlobalParameter(toBytes32("withdrawalLockBlockCount"), 5);
        await global.setGlobalParameter(toBytes32("brokerLockBlockCount"), 5);
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
        funding = await TestFundingMock.new();
        perpetual = await TestPerpetual.new(
            global.address,
            dev,
            collateral.address,
            cDecimals
        );
        await perpetual.setGovernanceAddress(toBytes32("amm"), funding.address);
        await setDefaultGovParameters();
    };

    const increaseBlockBy = async (n) => {
        for (let i = 0; i < n; i++) {
            await increaseEvmBlock();
        }
    };

    const positionSize = async (user) => {
        const positionAccount = await perpetual.getPosition(user);
        return positionAccount.size;
    }
    const positionSide = async (user) => {
        const positionAccount = await perpetual.getPosition(user);
        return positionAccount.side;
    }
    const positionEntryValue = async (user) => {
        const positionAccount = await perpetual.getPosition(user);
        return positionAccount.entryValue;
    }
    const positionEntrySocialLoss = async (user) => {
        const positionAccount = await perpetual.getPosition(user);
        return positionAccount.entrySocialLoss;
    }
    const positionEntryFundingLoss = async (user) => {
        const positionAccount = await perpetual.getPosition(user);
        return positionAccount.entryFundingLoss;
    }
    const cashBalanceOf = async (user) => {
        const cashAccount = await perpetual.getCashBalance(user);
        return cashAccount.balance;
    }
    const appliedBalanceOf = async (user) => {
        const cashAccount = await perpetual.getCashBalance(user);
        return cashAccount.appliedBalance;
    }
    const isPositionBalanced = async () => {
        const long = (await perpetual.totalSize(LONG)).toString();
        const short = (await perpetual.totalSize(SHORT)).toString();
        const flat = (await perpetual.totalSize(FLAT)).toString();
        return (long == short) && (flat == "0")
    }

    it("decimals", async () => {
        for (var i = 0; i <= 18; i ++) {
            console.log("  decimals =", i)

            const _wad = (10 ** i);
            const _unit = (n) => {
                return (new BigNumber(n).times(_wad)).toFixed();
            }
            await deploy(i);

            await collateral.transfer(u1, _unit(10));
            await collateral.approve(perpetual.address,  infinity, { from: u1 });

            assert.equal(await perpetual.insuranceFundBalance(), toWad(0));
            await perpetual.depositToInsuranceFund(_unit(10), { from: u1 });
            assert.equal(await perpetual.insuranceFundBalance(), toWad(10));
            console.log("   deposit ", _unit(10));
            console.log("  internal ", toWad(10));

            await perpetual.addWhitelistAdmin(u1);
            await perpetual.withdrawFromInsuranceFund(_unit(10), { from: u1 });
            assert.equal(await perpetual.insuranceFundBalance(), toWad(0));
            assert.equal(await collateral.balanceOf(u1), _unit(10));
        }


        try {
            await deploy(19);
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("decimals out of range"));
        }
    });
});