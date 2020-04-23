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
const TestPosition = artifacts.require('test/TestPosition.sol');
const TestFundingMock = artifacts.require('test/TestFundingMock.sol');

contract('TestPosition', accounts => {

    const FLAT = 0;
    const SHORT = 1;
    const LONG = 2;

    let collateral;
    let position;
    let funding;

    const broker = accounts[9];
    const admin = accounts[0];

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

    const deploy = async (cDecimals = 18, pDecimals = 18) => {
        collateral = await TestToken.new("TT", "TestToken", cDecimals);
        position = await TestPosition.new(collateral.address, cDecimals);
        funding = await TestFundingMock.new();
        await position.setGovernanceAddress(toBytes32("amm"), funding.address);
    };

    const increaseBlockBy = async (n) => {
        for (let i = 0; i < n; i++) {
            await increaseEvmBlock();
        }
    };

    const setDefaultGovParameters = async () => {
        await position.setGovernanceParameter(toBytes32("initialMarginRate"), toWad(0.1));
        await position.setGovernanceParameter(toBytes32("maintenanceMarginRate"), toWad(0.05));
        await position.setGovernanceParameter(toBytes32("liquidationPenaltyRate"), toWad(0.005));
        await position.setGovernanceParameter(toBytes32("penaltyFundRate"), toWad(0.005));
        await position.setGovernanceParameter(toBytes32("takerDevFeeRate"), toWad(0.01));
        await position.setGovernanceParameter(toBytes32("makerDevFeeRate"), toWad(0.02));
        await position.setGovernanceParameter(toBytes32("lotSize"), 1);
        await position.setGovernanceParameter(toBytes32("tradingLotSize"), 1);
    };

    const positionSize = async (user) => {
        const positionAccount = await position.getPosition(user);
        return positionAccount.size;
    }
    const positionSide = async (user) => {
        const positionAccount = await position.getPosition(user);
        return positionAccount.side;
    }
    const positionEntryValue = async (user) => {
        const positionAccount = await position.getPosition(user);
        return positionAccount.entryValue;
    }
    const positionEntrySocialLoss = async (user) => {
        const positionAccount = await position.getPosition(user);
        return positionAccount.entrySocialLoss;
    }
    const positionEntryFundingLoss = async (user) => {
        const positionAccount = await position.getPosition(user);
        return positionAccount.entryFundingLoss;
    }
    const cashBalanceOf = async (user) => {
        const cashAccount = await position.getCashBalance(user);
        return cashAccount.balance;
    }
    const isPositionBalanced = async () => {
        const long = (await position.totalSize(LONG)).toString();
        const short = (await position.totalSize(SHORT)).toString();
        const flat = (await position.totalSize(FLAT)).toString();
        return (long == short) && (flat == "0")
    }

    describe("exceptions", async () => {
        beforeEach(async () => {
            await deploy();
            await setDefaultGovParameters();
        });

        it('addSocialLossPerContractPublic', async () => {
            try {
                await position.addSocialLossPerContractPublic(SHORT, toWad(-2.233));
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("negtive social loss"), error);
            }
        });

        it('trade', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });
            await position.depositPublic(toWad(10000), {
                from: u1
            });
            await position.tradePublic(u1, LONG, toWad(7000), toWad(0));
        });
    })

    describe("miscs", async () => {
        beforeEach(async () => {
            await deploy();
            await setDefaultGovParameters();
        });

        it('get position', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });
            await position.depositPublic(toWad(10000), {
                from: u1
            });
            await position.tradePublic(u1, LONG, toWad(7000), toWad(2));

            const account = await position.getPosition(u1);
            assert.equal(account.side, LONG);
            assert.equal(account.size, toWad(2));
            assert.equal(account.entryValue, toWad(7000 * 2));
            assert.equal(account.entrySocialLoss, 0);
            assert.equal(account.entryFundingLoss, 0);
        });

        it('position balance', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });
            await position.depositPublic(toWad(10000), {
                from: u1
            });
            await position.tradePublic(u1, LONG, toWad(7000), toWad(2));

            assert.equal(await isPositionBalanced(), false);

            await collateral.transfer(u2, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u2
            });
            await position.depositPublic(toWad(10000), {
                from: u2
            });
            await position.tradePublic(u2, SHORT, toWad(7000), toWad(2));

            assert.equal(await isPositionBalanced(), true);
        });

        it('funding loss long', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });

            await position.depositPublic(toWad(10000), {
                from: u1
            });
            await position.tradePublic(u1, LONG, toWad(7000), toWad(2));

            await funding.setAccumulatedFundingPerContract(toWad(100));
            assert.equal(await position.fundingLossPublic.call(u1), toWad(100 * 2));
        });

        it('funding loss short', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });

            await position.depositPublic(toWad(10000), {
                from: u1
            });
            await position.tradePublic(u1, SHORT, toWad(7000), toWad(2));

            await funding.setAccumulatedFundingPerContract(toWad(100));
            assert.equal(await position.fundingLossPublic.call(u1), toWad(-100 * 2));
        });

        it('total size', async () => {
            assert.equal(fromWad(await position.totalSize(LONG)), 0);
            await position.increaseTotalSizePublic(LONG, toWad(1));
            assert.equal(fromWad(await position.totalSize(LONG)), 1);
            await position.increaseTotalSizePublic(LONG, toWad(1.2333));
            assert.equal(fromWad(await position.totalSize(LONG)), 2.2333);

            await position.decreaseTotalSizePublic(LONG, toWad(0.233));
            assert.equal(fromWad(await position.totalSize(LONG)), 2.0003);
            try {
                await position.decreaseTotalSizePublic(LONG, toWad(2.233));
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("subtraction overflow"), error);
            }

            assert.equal(fromWad(await position.totalSize(SHORT)), 0);
            await position.increaseTotalSizePublic(SHORT, toWad(1));
            assert.equal(fromWad(await position.totalSize(SHORT)), 1);
            await position.increaseTotalSizePublic(SHORT, toWad(1.2333));
            assert.equal(fromWad(await position.totalSize(SHORT)), 2.2333);

            await position.decreaseTotalSizePublic(SHORT, toWad(0.233));
            assert.equal(fromWad(await position.totalSize(SHORT)), 2.0003);
            try {
                await position.decreaseTotalSizePublic(SHORT, toWad(2.233));
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("subtraction overflow"), error);
            }
        });

        it('socialloss - long', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });

            await position.depositPublic(toWad(10000), {
                from: u1
            });

            await position.tradePublic(u1, LONG, toWad(7000), toWad(2));

            await position.setSocialLossPerContractPublic(LONG, toWad(998));
            await position.setSocialLossPerContractPublic(SHORT, toWad(997));

            assert.equal(fromWad(await positionEntrySocialLoss(u1)), 0);
            assert.equal(fromWad(await position.socialLossPublic(u1)), 998 * 2);
        });

        it('socialloss - short', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });

            await position.depositPublic(toWad(10000), {
                from: u1
            });

            await position.tradePublic(u1, SHORT, toWad(7000), toWad(2));

            await position.setSocialLossPerContractPublic(LONG, toWad(997));
            await position.setSocialLossPerContractPublic(SHORT, toWad(998));

            assert.equal(fromWad(await positionEntrySocialLoss(u1)), 0);
            assert.equal(fromWad(await position.socialLossPublic(u1)), 998 * 2);
        });

        it('remargin - 0', async () => {
            await position.remarginPublic(u1, toWad(0));
            assert.equal(fromWad(await cashBalanceOf(u1)), 0);
        });

        it('remargin - long', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });

            await position.depositPublic(toWad(10000), {
                from: u1
            });
            await position.tradePublic(u1, LONG, toWad(7000), toWad(2));
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);

            await position.remarginPublic(u1, toWad(8000));
            assert.equal(fromWad(await cashBalanceOf(u1)), 12000);

            await position.remarginPublic(u1, toWad(6000));
            assert.equal(fromWad(await cashBalanceOf(u1)), 8000);
        });

        it('remargin - short', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });

            await position.depositPublic(toWad(10000), {
                from: u1
            });
            await position.tradePublic(u1, SHORT, toWad(7000), toWad(2));
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);

            await position.remarginPublic(u1, toWad(6000));
            assert.equal(fromWad(await cashBalanceOf(u1)), 12000);

            await position.remarginPublic(u1, toWad(8000));
            assert.equal(fromWad(await cashBalanceOf(u1)), 8000);
        });
    });

    describe("liquidate", async () => {
        beforeEach(async () => {
            await deploy();
            await setDefaultGovParameters();
        });

        it('without loss - long', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });

            await position.depositPublic(toWad(700), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 700);
            assert.equal(fromWad(await position.calculateLiquidateAmount.call(u1, toWad(6000))), 0);
            assert.equal(fromWad(await position.calculateLiquidateAmount.call(u1, toWad(7000))), 0);

            await position.tradePublic(u1, LONG, toWad(7000), toWad(1));
            let amount;
            amount = await position.calculateLiquidateAmount.call(u1, toWad(7000));
            assert.equal(amount, 0);
            amount = await position.calculateLiquidateAmount.call(u1, toWad(6500));
            assert.equal(fromWad(amount), "0.769230769230769231");
            amount = await position.calculateLiquidateAmount.call(u1, toWad(6000));
            assert.equal(fromWad(amount), "1");
        });

        it('without loss - short', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });

            await position.depositPublic(toWad(700), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 700);

            await position.tradePublic(u1, SHORT, toWad(7000), toWad(1));

            let amount;

            amount = await position.calculateLiquidateAmount.call(u1, toWad(7000));
            assert.equal(amount, 0);
            amount = await position.calculateLiquidateAmount.call(u1, toWad(7500));
            assert.equal(fromWad(amount), "0.814814814814814815");
            amount = await position.calculateLiquidateAmount.call(u1, toWad(8000));
            assert.equal(fromWad(amount), "1");
        });

        it('with loss and funding - long', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });

            await position.depositPublic(toWad(700), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 700);

            await position.setSocialLossPerContractPublic(LONG, toWad(100));
            await funding.setAccumulatedFundingPerContract(toWad(200));

            await position.tradePublic(u1, LONG, toWad(7000), toWad(1));

            await position.setSocialLossPerContractPublic(LONG, toWad(150));
            await funding.setAccumulatedFundingPerContract(toWad(220));

            let amount;
            amount = await position.calculateLiquidateAmount.call(u1, toWad(7200));
            assert.equal(fromWad(amount), "0");
            amount = await position.calculateLiquidateAmount.call(u1, toWad(6500));
            assert.equal(fromWad(amount), "0.888888888888888889");
            amount = await position.calculateLiquidateAmount.call(u1, toWad(6000));
            assert.equal(fromWad(amount), "1");
        });

        it('with loss and funding - short', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });

            await position.depositPublic(toWad(700), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 700);

            await position.setSocialLossPerContractPublic(SHORT, toWad(100));
            await funding.setAccumulatedFundingPerContract(toWad(200));

            await position.tradePublic(u1, SHORT, toWad(7000), toWad(1));

            await position.setSocialLossPerContractPublic(SHORT, toWad(150));
            await funding.setAccumulatedFundingPerContract(toWad(180));

            let amount;
            amount = await position.calculateLiquidateAmount.call(u1, toWad(6800));
            assert.equal(fromWad(amount), "0");
            amount = await position.calculateLiquidateAmount.call(u1, toWad(7500));
            assert.equal(fromWad(amount), "0.918518518518518519");
            amount = await position.calculateLiquidateAmount.call(u1, toWad(8000));
            assert.equal(fromWad(amount), "1");
        });


        it('handleSocialLoss', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });

            await position.tradePublic(u1, LONG, toWad(7000), toWad(1));

            await position.handleSocialLossPublic(LONG, toWad(2));
            assert.equal(fromWad(await position.socialLossPerContract(LONG)), 2);
        });

        it('handleSocialLoss 2', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });

            await position.tradePublic(u1, LONG, toWad(7000), toWad(2));

            await position.handleSocialLossPublic(LONG, toWad(2));
            assert.equal(fromWad(await position.socialLossPerContract(LONG)), 1);
        });


        it('calculateLiquidateAmount long', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });
            await position.depositPublic(toWad(700), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 700);

            await position.tradePublic(u1, LONG, toWad(7000), toWad(1));
            assert.equal(fromWad(await position.calculateLiquidateAmount.call(u1, toWad(6000))), 1);
        });

        it('liquidate', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });
            await position.depositPublic(toWad(700), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 700);

            await position.tradePublic(u1, LONG, toWad(7000), toWad(1));

            await collateral.transfer(u2, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u2
            });
            await position.depositPublic(toWad(700), {
                from: u2
            });
            assert.equal(fromWad(await cashBalanceOf(u2)), 700);

            let amount = await position.calculateLiquidateAmount.call(u1, toWad(6500));
            assert.equal(fromWad(amount), "0.769230769230769231");
            await position.liquidatePublic(u2, u1, toWad(6500), amount.toString());

            const account1 = await position.getPosition(u1);
            assert.equal(fromWad(account1.size), "0.230769230769230769");

            assert.equal(account1.side, LONG);
            const account2 = await position.getPosition(u2);
            assert.equal(account2.side, LONG);

            const cash1 = await position.getCashBalance(u1);
            assert.equal(fromWad(cash1.balance), "265.384615384615384483");

            const cash2 = await position.getCashBalance(u2);
            assert.equal(fromWad(cash2.balance), "725.000000000000000008");

            const fundBalance = await position.insuranceFundBalance();
            assert.equal(fromWad(fundBalance), "25.000000000000000008");
        });

        it('liquidate more - long', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });
            await position.depositPublic(toWad(700), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 700);

            await position.tradePublic(u1, LONG, toWad(7000), toWad(1));

            await collateral.transfer(u2, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u2
            });
            await position.depositPublic(toWad(700), {
                from: u2
            });
            assert.equal(fromWad(await cashBalanceOf(u2)), 700);

            let amount = await position.calculateLiquidateAmount.call(u1, toWad(6000));
            assert.equal(fromWad(amount), 1);
            await position.liquidatePublic(u2, u1, toWad(6000), toWad(1));

            const account1 = await position.getPosition(u1);
            assert.equal(fromWad(account1.size), 0);
            assert.equal(account1.side, FLAT);

            const account2 = await position.getPosition(u2);
            assert.equal(fromWad(account2.size), 1);
            assert.equal(account2.side, LONG);

            const cash1 = await position.getCashBalance(u1);
            assert.equal(fromWad(cash1.balance), 0);

            const cash2 = await position.getCashBalance(u2);
            assert.equal(fromWad(cash2.balance), 700 + 60 * 0.5);

            assert.equal(fromWad(await position.insuranceFundBalance()), 0);
            assert.equal(fromWad(await position.socialLossPerContract(LONG)), -(700 - 1000 - 30));
        });

        it('liquidate more - short', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });
            await position.depositPublic(toWad(700), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 700);

            await position.tradePublic(u1, SHORT, toWad(7000), toWad(1));

            await collateral.transfer(u2, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u2
            });
            await position.depositPublic(toWad(700), {
                from: u2
            });
            assert.equal(fromWad(await cashBalanceOf(u2)), 700);

            let amount = await position.calculateLiquidateAmount.call(u1, toWad(8000));
            assert.equal(fromWad(amount), 1);
            await position.liquidatePublic(u2, u1, toWad(8000), toWad(1));

            const account1 = await position.getPosition(u1);
            assert.equal(fromWad(account1.size), 0);
            assert.equal(account1.side, FLAT);

            const account2 = await position.getPosition(u2);
            assert.equal(fromWad(account2.size), 1);
            assert.equal(account2.side, SHORT);

            const cash1 = await position.getCashBalance(u1);
            assert.equal(fromWad(cash1.balance), 0);

            const cash2 = await position.getCashBalance(u2);
            assert.equal(fromWad(cash2.balance), 700 + 80 * 0.5);

            assert.equal(fromWad(await position.insuranceFundBalance()), 0);
            assert.equal(fromWad(await position.socialLossPerContract(SHORT)), -(700 - 1000 - 40));
        });

        it('liquidate more 2 - long', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });
            await position.depositPublic(toWad(2000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 2000);

            await position.tradePublic(u1, LONG, toWad(7000), toWad(2));

            await collateral.transfer(u2, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u2
            });
            await position.depositPublic(toWad(2000), {
                from: u2
            });
            assert.equal(fromWad(await cashBalanceOf(u2)), 2000);

            let amount = await position.calculateLiquidateAmount.call(u1, toWad(6000));
            assert.equal(fromWad(amount), 2);
            await position.liquidatePublic(u2, u1, toWad(6000), toWad(2));

            const account1 = await position.getPosition(u1);
            assert.equal(fromWad(account1.size), 0);
            assert.equal(account1.side, FLAT);

            const account2 = await position.getPosition(u2);
            assert.equal(fromWad(account2.size), 2);
            assert.equal(account2.side, LONG);

            const cash1 = await position.getCashBalance(u1);
            assert.equal(fromWad(cash1.balance), 0);

            const cash2 = await position.getCashBalance(u2);
            assert.equal(fromWad(cash2.balance), 2000 + 60 * 0.5 * 2);

            assert.equal(fromWad(await position.insuranceFundBalance()), 0);
            assert.equal(fromWad(await position.socialLossPerContract(LONG)), -(2000 - 2000 - 60 / 2));
        });

        it('liquidate more 2 - short', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });
            await position.depositPublic(toWad(2000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 2000);

            await position.tradePublic(u1, SHORT, toWad(7000), toWad(2));

            await collateral.transfer(u2, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u2
            });
            await position.depositPublic(toWad(2000), {
                from: u2
            });
            assert.equal(fromWad(await cashBalanceOf(u2)), 2000);

            let amount = await position.calculateLiquidateAmount.call(u1, toWad(8000));
            assert.equal(fromWad(amount), 2);
            await position.liquidatePublic(u2, u1, toWad(8000), toWad(2));

            const account1 = await position.getPosition(u1);
            assert.equal(fromWad(account1.size), 0);
            assert.equal(account1.side, FLAT);

            const account2 = await position.getPosition(u2);
            assert.equal(fromWad(account2.size), 2);
            assert.equal(account2.side, SHORT);

            const cash1 = await position.getCashBalance(u1);
            assert.equal(fromWad(cash1.balance), 0);

            const cash2 = await position.getCashBalance(u2);
            assert.equal(fromWad(cash2.balance), 2000 + 80 * 0.5 * 2);

            assert.equal(fromWad(await position.insuranceFundBalance()), 0);
            assert.equal(fromWad(await position.socialLossPerContract(SHORT)), -(2000 - 2000 - 80 / 2));
        });
    });

    describe("social loss", async () => {
        beforeEach(async () => {
            await deploy();
            await setDefaultGovParameters();
        });

        it('set long loss', async () => {
            assert.equal(await position.socialLossPerContract(LONG), 0);
            await position.addSocialLossPerContractPublic(LONG, toWad(1.234));
            assert.equal(await position.socialLossPerContract(LONG), toWad(1.234));

            await position.addSocialLossPerContractPublic(LONG, toWad(2.345));
            assert.equal(await position.socialLossPerContract(LONG), toWad(1.234, 2.345));
        });

        it('add short loss', async () => {
            assert.equal(await position.socialLossPerContract(SHORT), 0);
            await position.addSocialLossPerContractPublic(SHORT, toWad(1.234));
            assert.equal(await position.socialLossPerContract(SHORT), toWad(1.234));

            await position.addSocialLossPerContractPublic(SHORT, toWad(2.345));
            assert.equal(await position.socialLossPerContract(SHORT), toWad(1.234, 2.345));
        });
    });

    describe("position size, margin", async () => {
        beforeEach(async () => {
            await deploy();
            await setDefaultGovParameters();
        });

        it('basic info', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });
            await position.depositPublic(toWad(10000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);
            assert.equal(fromWad(await positionEntryValue(u1)), 0);


            await position.tradePublic(u1, LONG, toWad(6000), toWad(0.5));
            assert.equal(fromWad(await positionSize(u1)), 0.5);
            assert.equal(await positionSide(u1), LONG);
            assert.equal(fromWad(await positionEntryValue(u1)), 3000);
            assert.equal(fromWad(await positionEntrySocialLoss(u1)), 0);
            assert.equal(fromWad(await positionEntryFundingLoss(u1)), 0);
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);
            assert.equal(fromWad(await position.marginBalanceWithPricePublic.call(u1, toWad(6000))), 10000);
            assert.equal(fromWad(await position.availableMarginWithPricePublic.call(u1, toWad(6000))), 10000 - 300);
            assert.equal(fromWad(await position.marginWithPricePublic(u1, toWad(6000))), 300);
            assert.equal(fromWad(await position.maintenanceMarginWithPricePublic.call(u1, toWad(6000))), 150);
            assert.equal(fromWad(await position.drawableBalanceWithPricePublic.call(u1, toWad(6000))), 0);
            assert.equal(fromWad(await position.totalSize(LONG)), 0.5);

            await position.tradePublic(u1, LONG, toWad(8000), toWad(0.5));
            assert.equal(fromWad(await positionSize(u1)), 1);
            assert.equal(await positionSide(u1), LONG);
            assert.equal(fromWad(await positionEntryValue(u1)), 7000);
            assert.equal(fromWad(await positionEntrySocialLoss(u1)), 0);
            assert.equal(fromWad(await positionEntryFundingLoss(u1)), 0);
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);
            assert.equal(fromWad(await position.marginBalanceWithPricePublic.call(u1, toWad(6000))), 9000);
            assert.equal(fromWad(await position.marginWithPricePublic.call(u1, toWad(6000))), 600);
            assert.equal(fromWad(await position.availableMarginWithPricePublic.call(u1, toWad(6000))), 9000 - 600);
            assert.equal(fromWad(await position.maintenanceMarginWithPricePublic.call(u1, toWad(6000))), 300);
            assert.equal(fromWad(await position.drawableBalanceWithPricePublic.call(u1, toWad(6000))), 0);
            assert.equal(fromWad(await position.totalSize(LONG)), 1);

            await position.tradePublic(u1, SHORT, toWad(9000), toWad(1.5));
            assert.equal(fromWad(await positionSize(u1)), 0.5);
            assert.equal(await positionSide(u1), SHORT);
            assert.equal(fromWad(await positionEntryValue(u1)), 4500);
            assert.equal(fromWad(await positionEntrySocialLoss(u1)), 0);
            assert.equal(fromWad(await positionEntryFundingLoss(u1)), 0);
            assert.equal(fromWad(await cashBalanceOf(u1)), 12000);
            assert.equal(fromWad(await position.marginBalanceWithPricePublic.call(u1, toWad(6000))), 12000 + 1500);
            assert.equal(fromWad(await position.marginWithPricePublic.call(u1, toWad(6000))), 300);
            assert.equal(fromWad(await position.maintenanceMarginWithPricePublic.call(u1, toWad(6000))), 150);
            assert.equal(fromWad(await position.availableMarginWithPricePublic.call(u1, toWad(6000))), 12000 + 1500 - 300);
            assert.equal(fromWad(await position.drawableBalanceWithPricePublic.call(u1, toWad(6000))), 0);
            assert.equal(fromWad(await position.totalSize(SHORT)), 0.5);

        });

        it('buy', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });
            await position.depositPublic(toWad(10000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);

            await position.tradePublic(u1, LONG, toWad(6000), toWad(1));
            assert.equal(fromWad(await positionSize(u1)), 1);
            assert.equal(await positionSide(u1), LONG);
            assert.equal(fromWad(await positionEntryValue(u1)), 6000);
            assert.equal(fromWad(await position.marginWithPricePublic(u1, toWad(6000))), 600);
            assert.equal(fromWad(await position.totalSize(LONG)), 1);

            await position.tradePublic(u1, LONG, toWad(8000), toWad(0.5));
            assert.equal(fromWad(await positionSize(u1)), 1.5);
            assert.equal(await positionSide(u1), LONG);
            assert.equal(fromWad(await positionEntryValue(u1)), 10000);
            assert.equal(fromWad(await position.marginWithPricePublic(u1, toWad(8000))), 8000 * 1.5 * 0.1);
            assert.equal(fromWad(await position.totalSize(LONG)), 1.5);
        });

        it('sell', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });
            await position.depositPublic(toWad(10000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);

            await position.tradePublic(u1, SHORT, toWad(6000), toWad(1));
            assert.equal(fromWad(await positionSize(u1)), 1);
            assert.equal(await positionSide(u1), SHORT);
            assert.equal(fromWad(await positionEntryValue(u1)), 6000);
            assert.equal(fromWad(await position.marginWithPricePublic(u1, toWad(6000))), 600);
            assert.equal(fromWad(await position.totalSize(SHORT)), 1);

            await position.tradePublic(u1, SHORT, toWad(8000), toWad(0.5));
            assert.equal(fromWad(await positionSize(u1)), 1.5);
            assert.equal(await positionSide(u1), SHORT);
            assert.equal(fromWad(await positionEntryValue(u1)), 10000);
            assert.equal(fromWad(await position.marginWithPricePublic(u1, toWad(8000))), 8000 * 1.5 * 0.1);
            assert.equal(fromWad(await position.totalSize(SHORT)), 1.5);
        });

        it('buy 1 + sell 1', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });
            await position.depositPublic(toWad(10000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);

            await position.tradePublic(u1, LONG, toWad(6000), toWad(1));
            assert.equal(fromWad(await positionSize(u1)), 1);
            assert.equal(await positionSide(u1), LONG);
            assert.equal(fromWad(await positionEntryValue(u1)), 6000);
            assert.equal(fromWad(await position.marginWithPricePublic(u1, toWad(6000))), 600);
            assert.equal(fromWad(await position.totalSize(LONG)), 1);

            await position.tradePublic(u1, SHORT, toWad(8000), toWad(1));
            assert.equal(fromWad(await positionSize(u1)), 0);
            assert.equal(await positionSide(u1), FLAT);
            assert.equal(fromWad(await positionEntryValue(u1)), 0);
            assert.equal(fromWad(await position.marginWithPricePublic(u1, toWad(8000))), 0);
            assert.equal(fromWad(await position.totalSize(LONG)), 0);
            assert.equal(fromWad(await position.totalSize(SHORT)), 0);
        });

        it('buy 1 + sell 0.5 + sell 0.5', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });
            await position.depositPublic(toWad(10000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);

            await position.tradePublic(u1, LONG, toWad(6000), toWad(1));
            assert.equal(fromWad(await positionSize(u1)), 1);
            assert.equal(await positionSide(u1), LONG);
            assert.equal(fromWad(await positionEntryValue(u1)), 6000);
            assert.equal(fromWad(await position.marginWithPricePublic(u1, toWad(6000))), 600);
            assert.equal(fromWad(await position.totalSize(LONG)), 1);

            await position.tradePublic(u1, SHORT, toWad(8000), toWad(0.5));
            assert.equal(fromWad(await positionSize(u1)), 0.5);
            assert.equal(await positionSide(u1), LONG);
            assert.equal(fromWad(await positionEntryValue(u1)), 3000);
            assert.equal(fromWad(await position.marginWithPricePublic(u1, toWad(8000))), 8000 * 0.5 * 0.1);
            assert.equal(fromWad(await position.totalSize(LONG)), 0.5);

            await position.tradePublic(u1, SHORT, toWad(8000), toWad(0.5));
            assert.equal(fromWad(await positionSize(u1)), 0);
            assert.equal(await positionSide(u1), FLAT);
            assert.equal(fromWad(await positionEntryValue(u1)), 0);
            assert.equal(fromWad(await position.marginWithPricePublic(u1, toWad(8000))), 0);
            assert.equal(fromWad(await position.totalSize(LONG)), 0);
            assert.equal(fromWad(await position.totalSize(SHORT)), 0);

        });

        it('buy 1 + buy 1.5 + sell 3.5', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });
            await position.depositPublic(toWad(10000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);

            await position.tradePublic(u1, LONG, toWad(6000), toWad(1));
            assert.equal(fromWad(await positionSize(u1)), 1);
            assert.equal(await positionSide(u1), LONG);
            assert.equal(fromWad(await positionEntryValue(u1)), 6000);
            assert.equal(fromWad(await position.marginWithPricePublic(u1, toWad(6000))), 600);
            assert.equal(fromWad(await position.totalSize(LONG)), 1);

            await position.tradePublic(u1, LONG, toWad(8000), toWad(1.5));
            assert.equal(fromWad(await positionSize(u1)), 2.5);
            assert.equal(await positionSide(u1), LONG);
            assert.equal(fromWad(await positionEntryValue(u1)), 18000);
            assert.equal(fromWad(await position.marginWithPricePublic(u1, toWad(8000))), 8000 * 2.5 * 0.1);
            assert.equal(fromWad(await position.totalSize(LONG)), 2.5);

            await position.tradePublic(u1, SHORT, toWad(10000), toWad(3.5));
            assert.equal(fromWad(await positionSize(u1)), 1);
            assert.equal(await positionSide(u1), SHORT);
            assert.equal(fromWad(await positionEntryValue(u1)), 10000);
            assert.equal(fromWad(await position.marginWithPricePublic(u1, toWad(10000))), 10000 * 1 * 0.1);
            assert.equal(fromWad(await position.totalSize(SHORT)), 1);
        });
    });

    describe("pnl", async () => {
        beforeEach(async () => {
            await deploy();
            await setDefaultGovParameters();
        });


        it('without loss - 0', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });
            await position.depositPublic(toWad(10000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);

            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(6000))), 0);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(7000))), 0);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(5000))), 0);
        });

        it('without loss - long', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });
            await position.depositPublic(toWad(10000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);

            await position.tradePublic(u1, LONG, toWad(6000), toWad(1));
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(6000))), 0);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(7000))), 1000);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(8150))), 2150);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(5000))), -1000);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(4850))), -1150);
        });

        it('with loss - long', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });
            await position.depositPublic(toWad(10000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);

            // the 1st trade
            await position.tradePublic(u1, LONG, toWad(6000), toWad(1));
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(6000))), 0);

            await position.setSocialLossPerContractPublic(LONG, toWad(500));
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(6000))), -500);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(7000))), 500);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(5000))), -1500);

            await position.setSocialLossPerContractPublic(LONG, toWad(1500));
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(6000))), -1500);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(7000))), -500);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(5000))), -2500);

            await position.setSocialLossPerContractPublic(SHORT, toWad(1500));
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(6000))), -1500);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(7000))), -500);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(5000))), -2500);

            // the 2nd trade
            await position.tradePublic(u1, LONG, toWad(6000), toWad(1));
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(6000))), -1500);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(7000))), 500);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(5000))), -3500);
        });

        it('with loss - short', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });
            await position.depositPublic(toWad(10000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);

            // the 1st trade
            await position.tradePublic(u1, SHORT, toWad(6000), toWad(1));
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(6000))), 0);

            await position.setSocialLossPerContractPublic(SHORT, toWad(500));
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(6000))), -500);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(7000))), -1500);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(5000))), 500);

            await position.setSocialLossPerContractPublic(SHORT, toWad(1500));
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(6000))), -1500);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(7000))), -2500);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(5000))), -500);

            await position.setSocialLossPerContractPublic(LONG, toWad(1500));
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(6000))), -1500);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(7000))), -2500);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(5000))), -500);

            // the 2nd trade
            await position.tradePublic(u1, SHORT, toWad(6000), toWad(1));
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(6000))), -1500);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(7000))), -3500);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(5000))), 500);
        });

        it('with loss and funding - long', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });
            await position.depositPublic(toWad(10000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);

            // the 1st trade
            await position.tradePublic(u1, LONG, toWad(6000), toWad(1));
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(6000))), 0);

            await position.setSocialLossPerContractPublic(LONG, toWad(500));
            await funding.setAccumulatedFundingPerContract(toWad(500));

            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(6000))), -1000);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(7000))), -1e-18);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(5000))), -2000 - 1e-18);

            await funding.setAccumulatedFundingPerContract(toWad(0));
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(6000))), -500 - 1e-18);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(7000))), 500 - 1e-18);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(5000))), -1500 - 1e-18);

            await funding.setAccumulatedFundingPerContract(toWad(-100));
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(6000))), -400 - 1e-18);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(7000))), 600 - 1e-18);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(5000))), -1400 - 1e-18);

            // the 2nd trade
            await position.tradePublic(u1, LONG, toWad(6000), toWad(1));
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(6000))), -400);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(7000))), 1600 - 1e-18);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(5000))), -2400 - 1e-18);
        });

        it('with loss and funding - short', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });
            await position.depositPublic(toWad(10000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);

            // the 1st trade
            await position.tradePublic(u1, SHORT, toWad(6000), toWad(1));
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(6000))), 0);

            await position.setSocialLossPerContractPublic(SHORT, toWad(500));
            await funding.setAccumulatedFundingPerContract(toWad(500));
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(6000))), 0);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(7000))), -1000);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(5000))), 1000);

            await funding.setAccumulatedFundingPerContract(toWad(0));
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(6000))), -500);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(7000))), -1500);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(5000))), 500);

            await funding.setAccumulatedFundingPerContract(toWad(-100));
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(6000))), -600);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(7000))), -1600);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(5000))), 400);

            // the 2nd trade
            await position.tradePublic(u1, SHORT, toWad(6000), toWad(1));
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(6000))), -600);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(7000))), -2600);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(5000))), 1400);
        });

        it('buy 1 + sell 0.5', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });
            await position.depositPublic(toWad(10000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);

            await position.setSocialLossPerContractPublic(LONG, toWad(10));
            await position.setSocialLossPerContractPublic(SHORT, toWad(20));
            await funding.setAccumulatedFundingPerContract(toWad(30));
            await position.tradePublic(u1, LONG, toWad(6000), toWad(1));
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);

            await position.setSocialLossPerContractPublic(LONG, toWad(40));
            await position.setSocialLossPerContractPublic(SHORT, toWad(50));
            await funding.setAccumulatedFundingPerContract(toWad(60));
            await position.tradePublic(u1, SHORT, toWad(8000), toWad(0.5));
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000 + 2000 * 0.5 - 30 * 0.5 - 30 * 0.5);

            await position.setSocialLossPerContractPublic(LONG, toWad(70));
            await position.setSocialLossPerContractPublic(SHORT, toWad(80));
            await funding.setAccumulatedFundingPerContract(toWad(90));
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(6000))), -60);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(7000))), 440);
            assert.equal(fromWad(await position.pnlWithPricePublic.call(u1, toWad(5000))), -560);
        });
    });

    describe("withdraw", async () => {
        beforeEach(async () => {
            await deploy();
            await setDefaultGovParameters();
        });

        it('applyForWithdrawalPublic', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(position.address, infinity, {
                from: u1
            });
            await position.depositPublic(toWad(10000), {
                from: u1
            });
            assert.equal(fromWad(await cashBalanceOf(u1)), 10000);

            await position.tradePublic(u1, LONG, toWad(6000), toWad(1));
            assert.equal(fromWad(await position.marginBalanceWithPricePublic.call(u1, toWad(6000))), 10000);
            assert.equal(fromWad(await position.marginBalanceWithPricePublic.call(u1, toWad(7000))), 11000);
            assert.equal(fromWad(await position.marginBalanceWithPricePublic.call(u1, toWad(5000))), 9000);

            assert.equal(fromWad(await position.availableMarginWithPricePublic.call(u1, toWad(6000))), 9400);
            assert.equal(fromWad(await position.availableMarginWithPricePublic.call(u1, toWad(7000))), 10300);
            assert.equal(fromWad(await position.availableMarginWithPricePublic.call(u1, toWad(5000))), 8500);

            assert.equal(fromWad(await position.maintenanceMarginWithPricePublic(u1, toWad(6000))), 300);
            assert.equal(fromWad(await position.maintenanceMarginWithPricePublic(u1, toWad(7000))), 350);
            assert.equal(fromWad(await position.maintenanceMarginWithPricePublic(u1, toWad(5000))), 250);

            await position.applyForWithdrawalPublic(toWad(2000), 0, {
                from: u1
            });
            assert.equal(fromWad(await position.drawableBalanceWithPricePublic.call(u1, toWad(6000))), 2000);
            assert.equal(fromWad(await position.drawableBalanceWithPricePublic.call(u1, toWad(7000))), 2000);
            assert.equal(fromWad(await position.drawableBalanceWithPricePublic.call(u1, toWad(5000))), 2000);
            assert.equal(fromWad(await position.drawableBalanceWithPricePublic.call(u1, toWad(5000))), 2000);

            await position.applyForWithdrawalPublic(toWad(20000), 0, {
                from: u1
            });
            assert.equal(fromWad(await position.drawableBalanceWithPricePublic.call(u1, toWad(6000))), 9400);
            assert.equal(fromWad(await position.drawableBalanceWithPricePublic.call(u1, toWad(7000))), 10300);
            assert.equal(fromWad(await position.drawableBalanceWithPricePublic.call(u1, toWad(5000))), 8500);
        });
    });
});