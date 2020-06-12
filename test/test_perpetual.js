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

    describe("division", async () => {
        beforeEach(deploy);

        it(':(', async () => {
            await perpetual.setGovernanceParameter(toBytes32("takerDevFeeRate"), toWad(0));
            await perpetual.setGovernanceParameter(toBytes32("makerDevFeeRate"), toWad(0));

            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(perpetual.address, infinity, { from: u1 });

            const initial = new BigNumber("1000000000000000000000");
            const priceBefore = new BigNumber("7777777777777777777777");
            const priceAfter = new BigNumber("7777777777777777777778");
            const amount = new BigNumber("1111111111111111113");

            await perpetual.addWhitelisted(admin);
            await perpetual.depositFor(u1, initial);

            await increaseBlockBy(5);

            await funding.setMarkPrice(priceBefore.toFixed());

            // entry value = 8641.975308641975323332‬
            await perpetual.oneSideTradePublic(u1, LONG, priceBefore.toFixed(), amount.toFixed()); // 1.11..

            // available = 135.802469135802467667
            const availableBefore = new BigNumber((await perpetual.availableMargin.call(u1)).toString());

            await perpetual.withdraw(availableBefore.toFixed(), { from: u1 });

            funding.setMarkPrice(priceAfter.toFixed());

            await perpetual.oneSideTradePublic(u1, SHORT, priceAfter.toFixed(), amount.toFixed()); // 1.11..
            // value = 864197530864197532335
            // actually:
            //   7777.777777777777777778 * 1.111111111111111113 - 7777.777777777777777777 * 1.111111111111111113
            //     = 1.111111E-18 ~= 1E-18
            const availableAfter = new BigNumber((await perpetual.availableMargin.call(u1)).toString());
            const profit = availableBefore.plus(availableAfter).minus(initial);
            const loss = priceAfter.times(amount).minus(priceBefore.times(amount)).div(1e18);

            // console.log(profit.toFixed());
            // console.log(loss.toFixed());

            // console.log(availableBefore.toFixed());
            // console.log(availableAfter.toFixed());

            assert.ok(Number(profit) <= Number(loss));
        });
    });

    describe("collateral - ether", async () => {
        beforeEach(async () => {
            global = await GlobalConfig.new();
            funding = await TestFundingMock.new();
            perpetual = await TestPerpetual.new(
                global.address,
                dev,
                "0x0000000000000000000000000000000000000000",
                18
            );
            await perpetual.setGovernanceAddress(toBytes32("amm"), funding.address);
            await setDefaultGovParameters();
        });

        it('insurance fund', async () => {
            try {
                await perpetual.depositToInsuranceFund(toWad(10), { from: u1 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("invalid depositing parameter"));
            }
            try {
                await perpetual.depositToInsuranceFund(0, { value: 0 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("invalid amount"));
            }

            await perpetual.depositToInsuranceFund(toWad(10.111), { value: toWad(10.111) });

            let fund = await perpetual.insuranceFundBalance();
            assert.equal(fund.toString(), toWad(10.111));

            await perpetual.withdrawFromInsuranceFund(toWad(10.111));
            fund = await perpetual.insuranceFundBalance();
            assert.equal(fund.toString(), 0);
        });

        it('fallback', async () => {
            try {
                await web3.eth.sendTransaction({
                    from: u1,
                    to: perpetual.address,
                    value: toWad(1000),
                    gas: 200000,
                });
            } catch (error) {
                assert.ok(error.message.includes("no payable"));
            }
            assert.equal(await cashBalanceOf(u1), toWad(0));

            await perpetual.addWhitelisted(admin);
            await perpetual.depositFor(u1, toWad(1000), { value: toWad(1000), from: admin });
            assert.equal(await cashBalanceOf(u1), toWad(1000));
        });

        it('depositEther', async () => {
            try {
                await perpetual.deposit(toWad(1000), { from: u1 });
            } catch (error) {
                assert.ok(error.message.includes("invalid depositing parameter"));
            }
            try {
                await perpetual.deposit(toWad(1000), { from: u1, value: toWad(1001) });
            } catch (error) {
                assert.ok(error.message.includes("invalid depositing parameter"));
            }
            await perpetual.addWhitelisted(admin);
            try {
                await perpetual.depositFor(u1, toWad(1000), { from: admin, value: toWad(1001) });
            } catch (error) {
                assert.ok(error.message.includes("invalid depositing parameter"));
            }
            try {
                await perpetual.depositFor("0x0000000000000000000000000000000000000000", toWad(1000), { value: toWad(1000), from: admin });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("invalid trader"));
            }

            await perpetual.deposit(toWad(1000), { from: u1, value: toWad(1000)});
            assert.equal(await cashBalanceOf(u1), toWad(1000));
            await perpetual.depositFor(u1, toWad(1000), { from: admin, value: toWad(1000) });
            assert.equal(await cashBalanceOf(u1), toWad(2000));

            await perpetual.withdraw(toWad(2000), { from: u1 });
            assert.equal(await cashBalanceOf(u1), toWad(0));
        });
    });

    describe("oneSideTradePublic", async () => {
        beforeEach(async () => {
            await deploy();

            await collateral.transfer(u1, toWad(1000));
            await collateral.approve(perpetual.address, infinity, { from: u1 });

            await perpetual.addWhitelisted(admin);
            await perpetual.depositFor(u1, toWad(1000));

            await collateral.transfer(u2, toWad(1000));
            await collateral.approve(perpetual.address, infinity, { from: u2 });

            await perpetual.depositFor(u2, toWad(1000));

            await increaseBlockBy(5);
            await funding.setMarkPrice(toWad(7000));
        });

        it('oneSideTradePublic - settlement', async () => {

            await perpetual.beginGlobalSettlement(toWad(7000));
            try {
                await perpetual.oneSideTradePublic(u1, LONG, toWad(7000), toWad(1));
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("wrong perpetual status"));
            }

            await perpetual.endGlobalSettlement();
            await perpetual.oneSideTradePublic(u1, LONG, toWad(7000), toWad(1));
        })

        it('invalid side', async () => {
            try {
                await perpetual.oneSideTradePublic(u1, FLAT, toWad(7000), toWad(1));
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("invalid side"));
            }
         })

        it('transferCashBalance exceptions', async () => {
            await perpetual.beginGlobalSettlement(toWad(7000));
            try {
                await perpetual.transferCashBalance(u1, u2, toWad(1));
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("wrong perpetual status"));
            }
         })
    });

    describe("liquidate", async () => {
        beforeEach(async () => {
            await deploy();

            await perpetual.addWhitelisted(admin);

            await collateral.transfer(u1, toWad(1000));
            await collateral.approve(perpetual.address, infinity, { from: u1 });
            await perpetual.depositFor(u1, toWad(1000));

            await collateral.transfer(u2, toWad(1000));
            await collateral.approve(perpetual.address, infinity, { from: u2});
            await perpetual.depositFor(u2, toWad(1000));

            await collateral.transfer(u3, toWad(1000));
            await collateral.approve(perpetual.address, infinity, { from: u3});
            await perpetual.depositFor(u3, toWad(1000));

            await increaseBlockBy(5);
            await funding.setMarkPrice(toWad(7000));
        });

        it('partial liquidate - lot size', async () => {
            await perpetual.oneSideTradePublic(u1, LONG, toWad(7000), toWad(1));
            await perpetual.setGovernanceParameter(toBytes32("tradingLotSize"), toWad(10));
            await perpetual.setGovernanceParameter(toBytes32("lotSize"), toWad(10));

            try {
                await perpetual.liquidate(u1, toWad(1), { from: u2 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("invalid lot size"));
            }
        })

        it('partial liquidate - nothing to liquidate', async () => {
            await perpetual.oneSideTradePublic(u1, LONG, toWad(7000), toWad(1));
            await perpetual.setGovernanceParameter(toBytes32("tradingLotSize"), toWad(10));
            await perpetual.setGovernanceParameter(toBytes32("lotSize"), toWad(10));

            await funding.setMarkPrice(6000);

            try {
                await perpetual.liquidate(u1, toWad(0), { from: u2 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("nothing to liquidate"));
            }
        })

        it('partial liquidate - add social loss', async () => {
            await perpetual.oneSideTradePublic(u1, LONG, toWad(7000), toWad(1));
            await perpetual.oneSideTradePublic(u3, SHORT, toWad(7000), toWad(1));

            try {
                await perpetual.liquidate(u1, toWad(1), { from: u2 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("safe account"));
            }

            try {
                await perpetual.liquidate(u1, toWad(1), { from: u2 });
                throw null;
            } catch (error) {
               assert.ok(error.message.includes("safe account"));
            }

            await funding.setMarkPrice(toWad(5000));
            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 500);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 250);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), -1000);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), -2000);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), -1500);
            assert.equal(await perpetual.isSafe.call(u1), false);
            assert.equal(await perpetual.isBankrupt.call(u1), true);
            assert.equal(fromWad(await perpetual.insuranceFundBalance()), 0);

            // partial 1
            await perpetual.liquidate(u1, toWad(0.5), { from: u2 });
            // positionMargin: 5000 * 0.5 * 10% = 250
            // funds:       5000 * 0.5 * 0.005 = 12.5
            // liquidator:  5000 * 0.5 * 0.005 = 12.5
            // rpnl = -2000 / 2 = -1000
            // -1000 - 25 = -1025
            // balance = 1000
            // remain = 1000 - 1025 = -25 -> socialloss

            assert.equal(fromWad(await perpetual.insuranceFundBalance()), 0);
            assert.equal(fromWad(await perpetual.socialLossPerContract(SHORT)), 12.5);

            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 250);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 125);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), -1000);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), -1000);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), -1250);
            assert.equal(await perpetual.isSafe.call(u1), false);
            assert.equal(await perpetual.isBankrupt.call(u1), true);

            assert.equal(fromWad(await cashBalanceOf(u2)), 1000 + 12.5);
            assert.equal(fromWad(await perpetual.positionMargin.call(u2)), 250);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u2)), 125);
            assert.equal(fromWad(await perpetual.marginBalance.call(u2)), 1000 + 12.5);
            assert.equal(fromWad(await perpetual.pnl.call(u2)), 0);
            assert.equal(fromWad(await perpetual.availableMargin.call(u2)), 1000 + 12.5 - 250);
            assert.equal(await perpetual.isSafe.call(u2), true);
            assert.equal(await perpetual.isBankrupt.call(u2), false);

            // partial 2
            await perpetual.liquidate(u1, toWad(0.5), { from: u2 });

            // positionMargin: 5000 * 1 * 10% = 500
            // funds: 5000 * 1 * 0.005 = 25
            // social loss = 6.25 + ((1000 + 25) / totalSize) * 1 = 1031.25

            assert.equal(fromWad(await perpetual.insuranceFundBalance()), 0);
            assert.equal(fromWad(await perpetual.socialLossPerContract(SHORT)), 1000 + 25);

            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 0);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 0);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), 0);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), 0);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 0);
            assert.equal(await perpetual.isSafe.call(u1), true);
            assert.equal(await perpetual.isBankrupt.call(u1), false);

            assert.equal(fromWad(await cashBalanceOf(u2)), 1000 + 25);
            assert.equal(fromWad(await perpetual.positionMargin.call(u2)), 500);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u2)), 250);
            assert.equal(fromWad(await perpetual.marginBalance.call(u2)), 1000 + 25);
            assert.equal(fromWad(await positionEntrySocialLoss(u2)), 0);
            assert.equal(fromWad(await perpetual.pnl.call(u2)), 0);
            assert.equal(fromWad(await perpetual.availableMargin.call(u2)), 1000 + 25 - 500);
            assert.equal(await perpetual.isSafe.call(u2), true);
            assert.equal(await perpetual.isBankrupt.call(u2), false);
        });

        it('liquidate - long pos', async () => {
            await perpetual.oneSideTradePublic(u1, LONG, toWad(7000), toWad(1));
            await funding.setMarkPrice(toWad(6200));

            // liquidateAmount = 0.532258064516129033 // 0.7526881720430108
            await perpetual.liquidate(u1, toWad(1), {
                from: u2
            });
            // 6200 * 0.7526881720430108 * 0.05
            assert.equal(fromWad(await perpetual.insuranceFundBalance()), 23.333333333333333343);

            await perpetual.withdrawFromInsuranceFund(toWad(23.333333333333333343), {
                from: admin
            });
        });

        it('liquidate - short pos', async () => {
            await perpetual.oneSideTradePublic(u1, SHORT, toWad(7000), toWad(1));
            await funding.setMarkPrice(toWad(7800));

            // liquidateAmount = 0.730769230769230769
            await perpetual.liquidate(u1, toWad(1), {
                from: u2
            });
            assert.equal(fromWad(await perpetual.insuranceFundBalance()), 32.222222222222222229);

            await perpetual.withdrawFromInsuranceFund(toWad(32.222222222222222229), {
                from: admin
            });
        });

        it('liquidate 4', async () => {
            await collateral.transfer(u2, toWad(1000));
            await perpetual.depositFor(u2, toWad(1000));

            await perpetual.oneSideTradePublic(u1, SHORT, toWad(7000), toWad(1));
            await perpetual.oneSideTradePublic(u2, LONG, toWad(7000), toWad(0.5));

            await funding.setMarkPrice(toWad(7800));

            // u1 - 800
            // u2 + 400

            assert.equal(fromWad(await perpetual.marginBalance.call(u2)), 2400);
            assert.equal(fromWad(await perpetual.pnl.call(u2)), 400);

            await perpetual.liquidate(u1, toWad(0.5), { from: u2 });
            assert.equal(fromWad(await perpetual.insuranceFundBalance()), 19.5); // 7800 * 0.5 * 0.005

            assert.equal(await positionSize(u2), 0);
            assert.equal(fromWad(await perpetual.availableMargin.call(u2)), 2400 + 19.5);
        });
    });

    describe("collateral - erc20", async () => {
        beforeEach(deploy);

        it('insurance fund', async () => {
            await collateral.approve(perpetual.address, infinity);

            try {
                await perpetual.withdrawFromInsuranceFund(1);
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("insufficient funds"));
            }
            try {
                await perpetual.depositToInsuranceFund(toWad(10.111), { value: toWad(10.111)});
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("invalid depositing parameter"));
            }
            try {
                await perpetual.depositToInsuranceFund(0);
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("invalid amount"));
            }
            try {
                await perpetual.depositToInsuranceFund(toWad(-10));
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("low-level call failed"));
            }

            await perpetual.depositToInsuranceFund(toWad(10.111));

            let fund = await perpetual.insuranceFundBalance();
            assert.equal(fund.toString(), toWad(10.111));

            try {
                await perpetual.withdrawFromInsuranceFund(0);
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("invalid amount"));
            }
            try {
                await perpetual.withdrawFromInsuranceFund(toWad(20));
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("insufficient funds"));
            }

            await perpetual.withdrawFromInsuranceFund(toWad(10.111));
            fund = await perpetual.insuranceFundBalance();
            assert.equal(fund.toString(), 0);
        });

        it('deposit', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u1
            });

            try {
                await perpetual.deposit(toWad(1000), { value: toWad(1000), from: u1});
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("invalid depositing parameter"));
            }

            await perpetual.deposit(toWad(1000), { from: u1 });

            assert.equal(fromWad(await cashBalanceOf(u1)), 1000);
        });

        it('depositFor', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(perpetual.address, infinity, { from: u1 });
            await perpetual.addWhitelisted(admin);

            try {
                await perpetual.depositFor(u1, toWad(1000), { value: toWad(1000), from: admin });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("invalid depositing parameter"));
            }
            try {
                await perpetual.depositFor("0x0000000000000000000000000000000000000000", toWad(1000), { from: admin });
            } catch (error) {
                assert.ok(error.message.includes("invalid trader"));
            }

            await perpetual.depositFor(u1, toWad(1000), { from: admin });

            assert.equal(fromWad(await cashBalanceOf(u1)), 1000);
        });

        it('accounts', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u1
            });

            assert.equal(await perpetual.totalAccounts(), 0);

            await perpetual.deposit(toWad(1000), {
                from: u1
            });

            assert.equal(fromWad(await cashBalanceOf(u1)), 1000);
            assert.equal(await perpetual.totalAccounts(), 1);
            assert.equal(await perpetual.accountList(0), u1);
        });

        it('withdraw', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(perpetual.address, infinity, { from: u1 });

            await perpetual.addWhitelisted(admin);
            await perpetual.depositFor(u1, toWad(1000));

            assert.equal(fromWad(await cashBalanceOf(u1)), 1000);

            try {
                await perpetual.withdraw(toWad(1001), { from: u1 });
                throw null;
            } catch (error) {
                error.message.includes("insufficient");
            }
            assert.equal(await cashBalanceOf(u1), toWad(1000));
            await perpetual.withdraw(toWad(1000), { from: u1 });
            assert.equal(await cashBalanceOf(u1), toWad(0));
            assert.equal(await collateral.balanceOf(u1), toWad(10000));
        });


        it('withdraw - deposit + withdraw', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(perpetual.address, infinity, { from: u1 });
            await perpetual.addWhitelisted(admin);
            await perpetual.depositFor(u1, toWad(1000));

            assert.equal(fromWad(await cashBalanceOf(u1)), 1000);

            await perpetual.withdraw(toWad(5), { from: u1 });
            assert.equal(fromWad(await cashBalanceOf(u1)), 1000 - 5);
            assert.equal(fromWad(await collateral.balanceOf(u1)), 10000 - 1000 + 5);
        });

        it('withdraw - pnl = positive, withdraw until IM', async () => {
            await collateral.transfer(u1, toWad(7000 * 0.1));
            await collateral.approve(perpetual.address, infinity, {
                from: u1
            });

            await perpetual.addWhitelisted(admin);
            await perpetual.depositFor(u1, toWad(7000 * 0.1));

            await increaseBlockBy(5);
            assert.equal(fromWad(await collateral.balanceOf(u1)), 0);

            await funding.setMarkPrice(toWad(7000));
            await perpetual.oneSideTradePublic(u1, LONG, toWad(7000), toWad(1));
            assert.equal(fromWad(await perpetual.pnl.call(u1)), 0);

            // counter-party (in order to loss money to u1)
            await collateral.transfer(u2, toWad(7000 * 0.1));
            await collateral.approve(perpetual.address, infinity, {
                from: u2
            });

            await perpetual.depositFor(u2, toWad(7000 * 0.1));

            await increaseBlockBy(5);
            await perpetual.oneSideTradePublic(u2, SHORT, toWad(7000), toWad(1));

            // now long-position earns
            await funding.setMarkPrice(toWad(7500));
            assert.equal(fromWad(await perpetual.pnl.call(u1)), 500);

            const am = new BigNumber(toWad(450)).minus(1).toFixed();
            assert.equal(await perpetual.availableMargin.call(u1), am);
            // await inspect(u1);

            await perpetual.withdraw(am, { from: u1 });
            assert.equal(await collateral.balanceOf(u1), am);
            assert.equal(await perpetual.pnl.call(u1), 0);
            assert.equal(fromWad(await cashBalanceOf(u1)), 750);
        });
    });

    describe("misc", async () => {
        beforeEach(deploy);

        it("transfer balance", async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u1
            });
            await perpetual.deposit(toWad(1000), {
                from: u1
            });

            await perpetual.addWhitelisted(admin);

            assert.equal(fromWad(await cashBalanceOf(u1)), 1000);

            await collateral.transfer(u2, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u2
            });
            await perpetual.deposit(toWad(1000), {
                from: u2
            });

            assert.equal(fromWad(await cashBalanceOf(u1)), 1000);
            assert.equal(fromWad(await cashBalanceOf(u2)), 1000);

            await perpetual.transferCashBalancePublic(u1, u2, toWad(998));
            assert.equal(fromWad(await cashBalanceOf(u1)), 2);
            assert.equal(fromWad(await cashBalanceOf(u2)), 1998);

            await perpetual.transferCashBalancePublic(u1, u2, toWad(3));
        });

        it("settle", async () => {
            await collateral.transfer(u1, toWad(120));
            await collateral.approve(perpetual.address, infinity, {
                from: u1
            });
            await perpetual.deposit(toWad(120), {
                from: u1
            });

            assert.equal(fromWad(await cashBalanceOf(u1)), 120);
            assert.equal(fromWad(await collateral.balanceOf(u1)), 0);

            try {
                await perpetual.settle();
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("wrong perpetual status"));
            }

            await perpetual.beginGlobalSettlement(toWad(7000));
            try {
                await perpetual.settle();
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("wrong perpetual status"));
            }

            await perpetual.endGlobalSettlement();
            await perpetual.settle({from: u1});

            assert.equal(fromWad(await cashBalanceOf(u1)), 0);
            assert.equal(fromWad(await collateral.balanceOf(u1)), 120);
        });
    });

    describe("settlement", async () => {

        beforeEach(deploy);

        it('settle', async () => {
            assert.equal(await perpetual.status(), NORMAL);
            await perpetual.beginGlobalSettlement(toWad(1000));
            assert.equal(await perpetual.status(), SETTLING);
            assert.equal(await perpetual.settlementPrice(), toWad(1000));

            await perpetual.endGlobalSettlement();
            assert.equal(await perpetual.status(), SETTLED);
        });

        it('settle at wrong stage', async () => {
            assert.equal(await perpetual.status(), NORMAL);
            try {
                await perpetual.endGlobalSettlement();
                throw null;
            } catch (error) {
                await assert.ok(error.message.includes("wrong perpetual status"));
            }
        });

        it('settle at wrong stage 2', async () => {
            assert.equal(await perpetual.status(), NORMAL);
            await perpetual.beginGlobalSettlement(toWad(5000));
            await perpetual.endGlobalSettlement();
            try {
                await perpetual.beginGlobalSettlement(toWad(1000));
                throw null;
            } catch (error) {
                await assert.ok(error.message.includes("wrong perpetual status"));
            }
        });
    });

    describe("trade", async () => {
        beforeEach(deploy);

        it('fill margin up to im', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(perpetual.address, infinity, { from: u1 });

            await perpetual.addWhitelisted(admin);
            await perpetual.depositFor(u1, toWad(700));

            await funding.setMarkPrice(toWad(7000));
            await perpetual.oneSideTradePublic(u1, LONG, toWad(7000), toWad(1));

            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 700);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 350);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), 700);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), 0);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 0);
            assert.equal(await perpetual.isSafe.call(u1), true);
            assert.equal(await perpetual.isBankrupt.call(u1), false);

            await funding.setMarkPrice(toWad(6900));
            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 690);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 345);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), 600); // 700 - 100
            assert.equal(fromWad(await perpetual.pnl.call(u1)), -100);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), -90); // 600 - 690
            assert.equal(await perpetual.isSafe.call(u1), true);
            assert.equal(await perpetual.isBankrupt.call(u1), false);

            await perpetual.depositFor(u1, toWad(690));
            await perpetual.oneSideTradePublic(u1, LONG, toWad(6900), toWad(1));
            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 690 * 2);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 690);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), 700 - 100 + 690); // 700 + 690 - 100
            assert.equal(fromWad(await perpetual.pnl.call(u1)), -100);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), -90); // 600 - 690
            assert.equal(await perpetual.isSafe.call(u1), true);
            assert.equal(await perpetual.isBankrupt.call(u1), false);
        });

        it('fill margin up to im', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u1
            });

            await perpetual.addWhitelisted(admin);
            await perpetual.depositFor(u1, toWad(700));

            await funding.setMarkPrice(toWad(7000));
            await perpetual.oneSideTradePublic(u1, LONG, toWad(7000), toWad(1));

            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 700);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 350);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), 700);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), 0);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 0);
            assert.equal(await perpetual.isSafe.call(u1), true);
            assert.equal(await perpetual.isBankrupt.call(u1), false);


            await funding.setMarkPrice(toWad(6000));
            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 600);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 300);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), 700 - 1000); // 700 - 100
            assert.equal(fromWad(await perpetual.pnl.call(u1)), -1000);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 700 - 1000 - 600); // -900
            assert.equal(await perpetual.isSafe.call(u1), false);
            assert.equal(await perpetual.isBankrupt.call(u1), true);

            await perpetual.depositFor(u1, toWad(900 + 599));
            await perpetual.oneSideTradePublic(u1, LONG, toWad(6000), toWad(1));
            assert.ok(fromWad(await perpetual.availableMargin.call(u1)) < 0);

            await perpetual.depositFor(u1, toWad(1));
            assert.equal(await perpetual.availableMargin.call(u1), -1);
        });

        it('withdraw', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u1
            });

            await perpetual.addWhitelisted(admin);
            await perpetual.depositFor(u1, toWad(1000));

            await funding.setMarkPrice(toWad(7000));
            await perpetual.oneSideTradePublic(u1, LONG, toWad(7000), toWad(1));

            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 700);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 350);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), 1000);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), 0);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 300);
            assert.equal(await perpetual.isSafe.call(u1), true);
            assert.equal(await perpetual.isBankrupt.call(u1), false);

            await perpetual.withdraw(toWad(300), { from: u1 });
            try {
                await perpetual.withdraw(toWad(0), { from: u1 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("invalid amount"));
            }
            try {
                await perpetual.withdraw(1, { from: u1 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("withdraw margin"));
            }
        });

        it('buy', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u1
            });

            await perpetual.addWhitelisted(admin);
            await perpetual.depositFor(u1, toWad(1000));

            await increaseBlockBy(5);
            await funding.setMarkPrice(toWad(7000));

            await perpetual.oneSideTradePublic(u1, LONG, toWad(7000), toWad(1));

            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 700);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 350);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), 1000);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), 0);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 300);
            assert.equal(await perpetual.isSafe.call(u1), true);
            assert.equal(await perpetual.isBankrupt.call(u1), false);


            await funding.setMarkPrice(toWad(6000));
            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 600);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 300);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), -1e-18);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), -1000 - 1e-18);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), -600);
            assert.equal(await perpetual.isSafe.call(u1), false);
            assert.equal(await perpetual.isBankrupt.call(u1), true);

            await funding.setMarkPrice(toWad(5000));
            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 500);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 250);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), -1000);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), -2000);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), -1500);
            assert.equal(await perpetual.isSafe.call(u1), false);
            assert.equal(await perpetual.isBankrupt.call(u1), true);

            await funding.setMarkPrice(toWad(8000));
            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 800);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 400);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), 2000);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), 1000);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 1200);
            assert.equal(await perpetual.isSafe.call(u1), true);
            assert.equal(await perpetual.isBankrupt.call(u1), false);

        });

        it('buy', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(perpetual.address, infinity, { from: u1 });

            await perpetual.addWhitelisted(admin);
            await perpetual.depositFor(u1, toWad(1000));

            await increaseBlockBy(5);
            await funding.setMarkPrice(toWad(7000));

            await perpetual.oneSideTradePublic(u1, LONG, toWad(7000), toWad(1));
            assert.equal(await perpetual.isSafe.call(u1), true);
            assert.equal(await perpetual.isBankrupt.call(u1), false);

            try {
                await perpetual.withdraw(toWad(700), { from: u1 });
                throw null;
            } catch (error) {
                await assert.ok(error.message.includes("unsafe after withdraw"));
            }
            await funding.setMarkPrice(toWad(6300));
            assert.equal(await perpetual.isSafe.call(u1), false);
            assert.equal(await perpetual.isBankrupt.call(u1), false);
            try {
                await perpetual.withdraw(toWad(100), { from: u1 });
                throw null;
            } catch (error) {
                await assert.ok(error.message.includes("unsafe before withdraw"));
            }

            await funding.setMarkPrice(toWad(6000));
            assert.equal(await perpetual.isSafe.call(u1), false);
            assert.equal(await perpetual.isBankrupt.call(u1), true);

            await funding.setMarkPrice(toWad(5000));
            assert.equal(await perpetual.isSafe.call(u1), false);
            assert.equal(await perpetual.isBankrupt.call(u1), true);
        });

        it('sell', async () => {
            await collateral.transfer(u1, toWad(10000));
            await collateral.approve(perpetual.address, infinity, {
                from: u1
            });

            await perpetual.addWhitelisted(admin);
            await perpetual.depositFor(u1, toWad(1000));

            await funding.setMarkPrice(toWad(7000));

            await perpetual.oneSideTradePublic(u1, SHORT, toWad(7000), toWad(1));

            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 700);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 350);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), 1000);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), 0);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 300);
            assert.equal(await perpetual.isSafe.call(u1), true);
            assert.equal(await perpetual.isBankrupt.call(u1), false);

            await funding.setMarkPrice(toWad(6000));
            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 600);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 300);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), 2000);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), 1000);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), 1400);
            assert.equal(await perpetual.isSafe.call(u1), true);
            assert.equal(await perpetual.isBankrupt.call(u1), false);

            await funding.setMarkPrice(toWad(8000));
            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 800);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 400);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), -1e-18);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), -1000 - 1e-18);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), -800);
            assert.equal(await perpetual.isSafe.call(u1), false);
            assert.equal(await perpetual.isBankrupt.call(u1), true);

            await funding.setMarkPrice(toWad(9000));
            assert.equal(fromWad(await perpetual.positionMargin.call(u1)), 900);
            assert.equal(fromWad(await perpetual.maintenanceMargin.call(u1)), 450);
            assert.equal(fromWad(await perpetual.marginBalance.call(u1)), -1000);
            assert.equal(fromWad(await perpetual.pnl.call(u1)), -2000);
            assert.equal(fromWad(await perpetual.availableMargin.call(u1)), -1900);
            assert.equal(await perpetual.isSafe.call(u1), false);
            assert.equal(await perpetual.isBankrupt.call(u1), true);
        });

        it('isIMSafe', async () => {
            await collateral.transfer(u1, toWad(1000));
            await collateral.approve(perpetual.address, infinity, {
                from: u1
            });
            await perpetual.addWhitelisted(admin);
            await perpetual.depositFor(u1, toWad(700));

            await funding.setMarkPrice(toWad(7000));

            await perpetual.oneSideTradePublic(u1, SHORT, toWad(7000), toWad(1));

            assert.equal(await perpetual.isIMSafe.call(u1), true);
            assert.equal(await perpetual.isIMSafeWithPrice.call(u1, toWad(7000)), true);
            assert.equal(await perpetual.isIMSafeWithPrice.call(u1, toWad(7001)), false);
            assert.equal(await perpetual.isIMSafeWithPrice.call(u1, toWad(7000) + 1), false);

            await funding.setMarkPrice(toWad(7001));
            assert.equal(await perpetual.isIMSafe.call(u1), false);
            assert.equal(await perpetual.isIMSafeWithPrice.call(u1, toWad(7000)), true);
        });
    });
});