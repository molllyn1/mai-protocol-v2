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
        const cashAccount = await vault.getMarginAccount(user);
        return cashAccount.cashBalance;
    }

    describe("constructor - exceptions", async () => {
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

        it ("constructor - decimals out of range", async () => {
            try {
                const col = await TestCollateral.new("0x0000000000000000000000000000000000000000", -1);
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("decimals out of range"));
            }
        });
    });

    describe("deposit / withdraw - ether", async () => {
        beforeEach(async () => {
            vault = await TestCollateral.new("0x0000000000000000000000000000000000000000", 18);
        });

        it('isTokenizedCollateral', async () => {
            assert.ok(!(await vault.isTokenizedCollateralPublic()));
        });

        it('deposit', async () => {
            let tx, gas;
            let b0 = await web3.eth.getBalance(u1);

            tx = await vault.depositPublic(toWad(0.01), { from: u1, value: toWad(0.01), gasPrice: 20 * 10 ** 9 });
            assert.equal(await cashBalanceOf(u1), toWad(0.01));
            gas = new BigNumber(20 * 10 ** 9).times(new BigNumber(tx.receipt.gasUsed));

            tx = await vault.depositPublic(toWad(0.01), { from: u1, value: toWad(0.01), gasPrice: 20 * 10 ** 9 });
            assert.equal(await cashBalanceOf(u1), toWad(0.02));
            gas = gas.plus(new BigNumber(20 * 10 ** 9).times(new BigNumber(tx.receipt.gasUsed)));

            let b1 = new BigNumber((await web3.eth.getBalance(u1)).toString());
            assert.equal(b1.plus(gas).plus(new BigNumber(toWad(0.02))).toFixed(), b0.toString());

            tx = await vault.depositPublic(toWad(0.02), { from: u1, value: toWad(0.02), gasPrice: 20 * 10 ** 9 });
            assert.equal(await cashBalanceOf(u1), toWad(0.04));
            gas = gas.plus(new BigNumber(20 * 10 ** 9).times(new BigNumber(tx.receipt.gasUsed)));

            let b2 = new BigNumber((await web3.eth.getBalance(u1)).toString());
            assert.equal(b2.plus(gas).plus(new BigNumber(toWad(0.04))).toFixed(), b0.toString());
        });

        it('withdraw', async () => {
            await vault.depositPublic(toWad(0.01), { from: u1, value: toWad(0.01) });
            assert.equal(fromWad(await cashBalanceOf(u1)), 0.01);
            await vault.withdrawPublic(toWad(0.005), { from: u1 });
            assert.equal(await cashBalanceOf(u1), toWad(0.005));
        });

        it('pullCollateral', async() => {
            await collateral.transfer(u1, toWad(1000));
            const balanceBefore = await web3.eth.getBalance(u1);
            assert.equal(await vault.pullCollateralPublic.call(u1, toWad(1000)), toWad(1000));
            const balanceAfter = await web3.eth.getBalance(u1);
            assert.equal(balanceBefore, balanceAfter);
        });

        it('pushCollateral', async() => {
            await vault.depositPublic(toWad(1000), { from: admin, value: toWad(1000) });
            assert.equal(await web3.eth.getBalance(vault.address), toWad(1000));

            const balanceBefore = await web3.eth.getBalance(u1);
            await vault.pushCollateralPublic(u1, toWad(1000));
            const balanceAfter = await web3.eth.getBalance(u1);
            assert.equal(new BigNumber(balanceAfter).minus(new BigNumber(balanceBefore)), toWad(1000));

            try {
                await vault.pushCollateralPublic(u1, 1);
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("insufficient balance"));
            }
        });
    });

    describe("deposit / withdraw - token", async () => {
        beforeEach(deploy);

        it('isTokenizedCollateral', async () => {
            assert.ok(await vault.isTokenizedCollateralPublic());
        });

        it('deposit', async () => {
            await collateral.transfer(u1, toWad(10));
            await collateral.approve(vault.address, infinity, { from: u1 });
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

        it('withdraw', async () => {
            await collateral.transfer(u1, toWad(10));
            await collateral.approve(vault.address, infinity, { from: u1 });

            await vault.depositPublic(toWad(10), { from: u1 });

            await vault.withdrawPublic(toWad(3.1415), { from: u1 });
            assert.equal(await cashBalanceOf(u1), toWad(6.8585));

            await vault.withdrawPublic(toWad(6.0), { from: u1 });
            assert.equal(await cashBalanceOf(u1), toWad(0.8585));

            await vault.withdrawPublic(toWad(0.8585), { from: u1 });
            assert.equal(await cashBalanceOf(u1), toWad(0));

            try {
                await vault.withdrawPublic(1, { from: u1 });
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("insufficient balance"));
            }
        });

        it('pullCollateral', async() => {
            await collateral.approve(vault.address, infinity, { from: u1 });
            try {
                assert.equal(await vault.pullCollateralPublic(u1, toWad(1000)), toWad(1000));
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("low-level call failed"), error);
            }
            await collateral.transfer(u1, toWad(1000));
            assert.equal(await collateral.balanceOf(u1), toWad(1000));
            assert.equal(await vault.pullCollateralPublic.call(u1, toWad(1000)), toWad(1000));
            await vault.pullCollateralPublic(u1, toWad(1000));
            assert.equal(await collateral.balanceOf(u1), 0);

        });

        it('pushCollateral', async() => {
            await collateral.approve(vault.address, infinity, { from: admin });
            await collateral.transfer(vault.address, toWad(1000));

            assert.equal(await collateral.balanceOf(vault.address), toWad(1000));
            assert.equal(await collateral.balanceOf(u1), toWad(0));
            await vault.pushCollateralPublic(u1, toWad(1000));
            assert.equal(await collateral.balanceOf(vault.address), toWad(0));
            assert.equal(await collateral.balanceOf(u1), toWad(1000));

            try {
                await vault.pushCollateralPublic(u1, 1);
                throw null;
            } catch (error) {
                assert.ok(error.message.includes("low-level call failed"));
            }
        });

    });

    describe("decimals", async () => {
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

        it("decimals ~ 0 => 18", async () => {
            for (var i = 0; i <= 18; i++) {
                await deploy(i);

                const raw = toDecimals(1, i);
                const wad = toWad(1);

                await collateral.transfer(u1, raw);
                await collateral.approve(vault.address, infinity, { from: u1 });
                assert.equal(await collateral.balanceOf(u1), raw);

                await vault.depositPublic(raw, { from: u1 });
                assert.equal(await cashBalanceOf(u1), wad);

                await vault.withdrawPublic(raw, { from: u1 });
                assert.equal(await cashBalanceOf(u1), 0);

                assert.equal(await collateral.balanceOf(u1), raw);

                assert.equal(await vault.toWadPublic(raw), wad);
                assert.equal(await vault.toCollateralPublic(wad), raw);
            }
        });
    });

});