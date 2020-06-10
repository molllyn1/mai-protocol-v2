const assert = require('assert');
const BigNumber = require('bignumber.js');
const { increaseEvmBlock } = require('./funcs');
const { toWad, fromWad, infinity } = require('./constants');

const TestToken = artifacts.require('test/TestToken.sol');
const TestCollateral = artifacts.require('test/TestCollateral.sol');

contract('TestCollateral', accounts => {

    let collateral;
    let vault;

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

    const deploy = async (cDecimals = 18) => {
        collateral = await TestToken.new("TT", "TestToken", cDecimals);
        vault = await TestCollateral.new(collateral.address, cDecimals);
    };

    const increaseBlockBy = async (n) => {
        for (let i = 0; i < n; i++) {
            await increaseEvmBlock();
        }
    };

    const cashBalanceOf = async (user) => {
        const cashAccount = await vault.getCashBalance(user);
        return cashAccount.balance;
    }

    const appliedBalanceOf = async (user) => {
        const cashAccount = await vault.getCashBalance(user);
        return cashAccount.appliedBalance;
    }

    describe("exceptions", async () => {
        beforeEach(deploy);

        it ("constructor - invalid decimals", async () => {
            try {
                const col = await TestCollateral.new("0x0000000000000000000000000000000000000000", 17);
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("invalid decimals"));
            }
        });

        it ("constructor - decimals out of range", async () => {
            try {
                const col = await TestCollateral.new("0x0000000000000000000000000000000000000000", 19);
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("decimals out of range"));
            }
        });

        it('withdraw - negtive amount', async () => {
            await collateral.transfer(u1, toWad(10));
            await collateral.approve(vault.address, infinity, { from: u1 });
            await vault.depositPublic(toWad(3.1415), { from: u1 });

            await vault.applyForWithdrawalPublic(toWad(10), 5, { from: u1 });
            await increaseBlockBy(4);

            try {
                await vault.withdrawPublic(0, { from: u1 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("invalid amount"), error);
            }
            assert.equal(await cashBalanceOf(u1), toWad(3.1415));

            try {
                await vault.withdrawPublic(toWad(-3.1415), { from: u1 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("uint256 overflow"), error);
            }
        });

        it('withdraw - negtive amount', async () => {

            await collateral.transfer(u1, toWad(10));
            await collateral.approve(vault.address, infinity, { from: u1 });
            await vault.depositPublic(toWad(3.1415), { from: u1 });

            await vault.applyForWithdrawalPublic(toWad(10), 5, { from: u1 });
            await increaseBlockBy(4);

            try {
                await vault.withdrawPublic(toWad(3.1416), { from: u1 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("insufficient balance"));
            }
        });
    });

    return;

    describe("misc", async () => {

        beforeEach(deploy);

        it('getCashBalance', async () => {
            await collateral.transfer(u1, toWad(10));
            await collateral.approve(vault.address, infinity, { from: u1 });
            await vault.depositPublic(toWad(3.1415), { from: u1 });
            assert.equal(fromWad(await collateral.balanceOf(u1)), 6.8585);
            assert.equal(fromWad(await cashBalanceOf(u1)), 3.1415);
            await vault.applyForWithdrawalPublic(toWad(1.2), 0, { from: u1 });
            const blockNumber = await web3.eth.getBlockNumber();
            const account = await vault.getCashBalance(u1);
            assert.equal(account.balance, toWad(3.1415));
            assert.equal(account.appliedBalance, toWad(1.2));
            assert.equal(account.appliedHeight, blockNumber);
        });

        it ('depositToProtocol', async () => {
            await collateral.transfer(u1, toWad(10));
            await collateral.approve(vault.address, toWad(10), {from: u1});

            await vault.depositToProtocolPublic(u1, toWad(0));
            assert.equal(await collateral.balanceOf(vault.address), toWad(0));
            await vault.withdrawFromProtocolPublic(u1, toWad(0));
            assert.equal(await collateral.balanceOf(vault.address), toWad(0));
            assert.equal(await collateral.balanceOf(u1), toWad(10));

            await vault.depositToProtocolPublic(u1, toWad(9.9));
            assert.equal(await collateral.balanceOf(vault.address), toWad(9.9));
            await vault.withdrawFromProtocolPublic(u1, toWad(9.9));
            assert.equal(await collateral.balanceOf(vault.address), toWad(0));
            assert.equal(await collateral.balanceOf(u1), toWad(10));
        });

    });

    describe("deposit / withdraw ether", async () => {
        beforeEach(async () => {
            vault = await TestCollateral.new("0x0000000000000000000000000000000000000000", 18);
        });

        it('deposit', async () => {
            let tx, gas;
            let b0 = await web3.eth.getBalance(u1);

            tx = await vault.depositEtherPublic({ from: u1, value: 0, gasPrice: 20 * 10 ** 9 });
            assert.equal(await cashBalanceOf(u1), 0);
            gas = new BigNumber(20 * 10 ** 9).times(new BigNumber(tx.receipt.gasUsed));

            tx = await vault.depositEtherPublic({ from: u1, value: toWad(0.01), gasPrice: 20 * 10 ** 9 });
            assert.equal(await cashBalanceOf(u1), toWad(0.01));
            gas = gas.plus(new BigNumber(20 * 10 ** 9).times(new BigNumber(tx.receipt.gasUsed)));

            let b1 = new BigNumber((await web3.eth.getBalance(u1)).toString());
            assert.equal(b1.plus(gas).plus(new BigNumber(toWad(0.01))).toFixed(), b0.toString());

            tx = await vault.depositEtherPublic({ from: u1, value: toWad(0.02), gasPrice: 20 * 10 ** 9 });
            assert.equal(await cashBalanceOf(u1), toWad(0.03));

            gas = new BigNumber(20 * 10 ** 9).times(new BigNumber(tx.receipt.gasUsed));
            let b2 = new BigNumber((await web3.eth.getBalance(u1)).toString());
            assert.equal(b2.plus(gas).plus(new BigNumber(toWad(0.02))).toFixed(), b1.toString());

            await vault.depositEtherPublic({ from: u1, value: toWad(0) });
            assert.equal(await cashBalanceOf(u1), toWad(0.03));
        });

        it('withdraw', async () => {
            await vault.depositEtherPublic({ from: u1, value: toWad(0.01) });
            assert.equal(fromWad(await cashBalanceOf(u1)), 0.01);

            try {
                await vault.withdrawPublic(toWad(0.005), { from: u1 });
            } catch (error) {
                assert.ok(error.message.includes("insufficient applied balance"), error);
            }

            await vault.applyForWithdrawalPublic(toWad(0.005), 5, { from: u1 });
            await increaseBlockBy(5);

            await vault.withdrawPublic(toWad(0.005), { from: u1 });
            assert.equal(await cashBalanceOf(u1), toWad(0.005));
        });
    });

    describe("deposit / withdraw", async () => {
        const toDecimals = (x, decimals) => {
            let n = new BigNumber(x).times(new BigNumber(10 ** decimals));
            return n.toFixed();
        };

        it("invalid decimals", async () => {
            await deploy(18);
            try {
                await deploy(19);
            } catch (error) {
                assert.ok(error.message.includes("decimals out of range"), error);
            }
        });

        it("decimals == 18", async () => {
            await deploy(18);

            const raw = toDecimals(1, 18);
            const wad = toWad(1);

            await collateral.transfer(u1, raw);
            await collateral.approve(vault.address, infinity, { from: u1 });
            assert.equal(await collateral.balanceOf(u1), raw);

            await vault.depositPublic(raw, { from: u1 });
            assert.equal(await cashBalanceOf(u1), wad);

            await vault.applyForWithdrawalPublic(raw, 5, { from: u1 });
            await increaseBlockBy(4);
            await vault.withdrawPublic(raw, { from: u1 });
            assert.equal(await cashBalanceOf(u1), 0);

            assert.equal(await collateral.balanceOf(u1), raw);
        });

        it("decimals == 8", async () => {
            await deploy(8);

            const raw = toDecimals(3.14159265, 8);
            const wad = toWad(3.14159265);

            await collateral.transfer(u1, raw);
            await collateral.approve(vault.address, infinity, { from: u1 });
            assert.equal(await collateral.balanceOf(u1), raw);

            await vault.depositPublic(raw, { from: u1 });
            assert.equal(await cashBalanceOf(u1), wad);

            await vault.applyForWithdrawalPublic(raw, 5, { from: u1 });
            await increaseBlockBy(4);
            await vault.withdrawPublic(raw, { from: u1 });
            assert.equal(await cashBalanceOf(u1), 0);

            assert.equal(await collateral.balanceOf(u1), raw);
        });

        it("decimals == 5", async () => {
            await deploy(5);

            const raw = toDecimals(3.14159, 5);
            const wad = toWad(3.14159);

            await collateral.transfer(u1, raw);
            await collateral.approve(vault.address, infinity, { from: u1 });
            assert.equal(await collateral.balanceOf(u1), raw);

            await vault.depositPublic(raw, { from: u1 });
            assert.equal(await cashBalanceOf(u1), wad);

            await vault.applyForWithdrawalPublic(raw, 5, { from: u1 });
            await increaseBlockBy(4);
            await vault.withdrawPublic(raw, { from: u1 });
            assert.equal(await cashBalanceOf(u1), 0);

            assert.equal(await collateral.balanceOf(u1), raw);
        });
    });


    describe("deposit / withdraw", async () => {
        before(deploy);

        describe("deposit", async () => {

            it('deposit', async () => {
                await collateral.transfer(u1, toWad(10));
                await collateral.approve(vault.address, infinity, { from: u1 });

                await vault.depositPublic(0, { from: u1 });
                assert.equal(await cashBalanceOf(u1), 0);

                await vault.depositPublic(toWad(3.1415), { from: u1 });
                assert.equal(await cashBalanceOf(u1), toWad(3.1415));

                assert.equal(await collateral.balanceOf(u1), toWad(10, -3.1415));
            });

            it('deposit too much', async () => {
                try {
                    await vault.depositPublic(toWad(30.1415), { from: u1 });
                    throw null;
                } catch (error) {
                    assert.ok(error.message.includes("low-level call failed"), error);
                }
            });
        });

        describe("withdraw", async () => {
            it('withdraw with no application', async () => {
                try {
                    await vault.withdrawPublic(toWad(3.1415), { from: u1 });
                    throw null;
                } catch (error) {
                    assert.ok(error.message.includes("insufficient applied balance"), error);
                }
            });

            it('withdraw with application but too early', async () => {
                try {
                    await vault.applyForWithdrawalPublic(toWad(10), 5, { from: u1 });
                    await vault.withdrawPublic(toWad(3.1415), { from: u1 });
                    throw null;
                } catch (error) {
                    assert.ok(error.message.includes("applied height not reached"), error);
                }
            });

            it('withdraw with application but still too early', async () => {
                try {
                    await vault.applyForWithdrawalPublic(toWad(10), 5, { from: u1 });
                    await increaseBlockBy(3);
                    await vault.withdrawPublic(toWad(3.1415), { from: u1 });
                    throw null;
                } catch (error) {
                    assert.ok(error.message.includes("applied height not reached"), error);
                }
            });

            it('withdraw', async () => {
                await vault.applyForWithdrawalPublic(toWad(10), 5, { from: u1 });
                await increaseBlockBy(4);

                await vault.withdrawPublic(0, { from: u1 });
                assert.equal(await cashBalanceOf(u1), toWad(3.1415));

                await vault.withdrawPublic(toWad(3.1415), { from: u1 });
                assert.equal(await cashBalanceOf(u1), 0);
                assert.equal(await collateral.balanceOf(u1), toWad(10));
            });
        });

        describe("exit", async () => {
            beforeEach(async () => {
                await deploy();
                await collateral.transfer(u1, toWad(10));
                await collateral.approve(vault.address, infinity, { from: u1 });
                await vault.depositPublic(toWad(3.1415), { from: u1 });
            });

            it('exit repeat', async () => {
                await vault.withdrawAllPublic({ from: u1 });
                assert.equal(await collateral.balanceOf(u1), toWad(10));
                assert.equal(await cashBalanceOf(u1), 0);

                await vault.withdrawAllPublic({ from: u1 });
                assert.equal(await collateral.balanceOf(u1), toWad(10));
                assert.equal(await cashBalanceOf(u1), 0);
            });

            it('exit', async () => {
                await vault.withdrawAllPublic({ from: u1 });
                assert.equal(await cashBalanceOf(u1), 0);
                assert.equal(await collateral.balanceOf(u1), toWad(10));
            });

            it('exit all', async () => {
                await vault.depositPublic(toWad(3.1415), { from: u1 });
                await vault.depositPublic(toWad(3.1415), { from: u1 });
                await vault.withdrawAllPublic({ from: u1 });
                assert.equal(await cashBalanceOf(u1), 0);
                assert.equal(await appliedBalanceOf(u1), 0);
                assert.equal(await collateral.balanceOf(u1), toWad(10));
            });
        });

    });

    describe("cash flow", async () => {

        beforeEach(async () => {
            await deploy();
            await collateral.transfer(u1, toWad(10));
            await collateral.approve(vault.address, infinity, { from: u1 });
            await vault.depositPublic(toWad(3.1415), { from: u1 });
        });

        describe("updateBalance", async () => {

            it('updateBalance', async () => {
                await vault.updateBalancePublic(toWad(2), { from: u1 });
                assert.equal(await cashBalanceOf(u1), toWad(5.1415));
                assert.equal(await collateral.balanceOf(u1), toWad(10, -3.1415));

                await vault.updateBalancePublic(toWad(-2), { from: u1 });
                assert.equal(await cashBalanceOf(u1), toWad(3.1415));
                assert.equal(await collateral.balanceOf(u1), toWad(10, -3.1415));

                await vault.updateBalancePublic(toWad(-10), { from: u1 });
                assert.equal(await cashBalanceOf(u1), toWad(3.1415, -10));
                assert.equal(await collateral.balanceOf(u1), toWad(10, -3.1415));
            });

            it('updateBalance', async () => {
                await vault.updateBalancePublic(toWad(2), { from: u1 });
                await vault.ensurePositiveBalancePublic({ from: u1 });
                assert.equal(await cashBalanceOf(u1), toWad(5.1415));

                await vault.updateBalancePublic(toWad(-2), { from: u1 });
                let loss = await vault.ensurePositiveBalancePublic.call({ from: u1 });
                await vault.ensurePositiveBalancePublic({ from: u1 });
                assert.equal(await cashBalanceOf(u1), toWad(3.1415));
                assert.equal(loss, 0);

                await vault.updateBalancePublic(toWad(-10), { from: u1 });
                loss = await vault.ensurePositiveBalancePublic.call({ from: u1 });
                assert.equal(await cashBalanceOf(u1), toWad(3.1415, -10));
                assert.equal(loss, toWad(10, -3.1415));

                await vault.ensurePositiveBalancePublic({ from: u1 });
                assert.equal(await cashBalanceOf(u1), toWad(0));
            });
        });


        describe("transferBalance", async () => {

            beforeEach(async () => {
                await collateral.transfer(u2, toWad(10));
                await collateral.approve(vault.address, infinity, { from: u2 });
                await vault.depositPublic(toWad(3.1415), { from: u2 });
            });

            it('normal', async () => {
                await vault.transferBalancePublic(u1, u2, toWad(1));
                assert.equal(await cashBalanceOf(u1), toWad(3.1415, -1));
                assert.equal(await cashBalanceOf(u2), toWad(3.1415, 1));
            });

            it('too much', async () => {
                await vault.transferBalancePublic(u1, u2, toWad(99));
                assert.equal(await cashBalanceOf(u1), toWad(3.1415, -99));
                assert.equal(await cashBalanceOf(u2), toWad(3.1415, 99));
            });

            it('transfer 0', async () => {
                await vault.transferBalancePublic(u1, u2, toWad(0));
                assert.equal(await cashBalanceOf(u1), toWad(3.1415));
                assert.equal(await cashBalanceOf(u2), toWad(3.1415));
            });
        });
    });
});