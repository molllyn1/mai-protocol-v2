const BigNumber = require('bignumber.js');
const { perpetualAddress, readPerpAddress } = require('./addresses');
const { toDecimal, fromDecimal, toWad, fromWad, infinity, Side } = require('../test/constants');
const TestToken = artifacts.require('TestToken');
const Perpetual = artifacts.require('Perpetual');
const AMM = artifacts.require('AMM');

const getDecimals = async (ctkAddress) => {
    const ctk = await TestToken.at(ctkAddress);
    let decimals = (new BigNumber(await ctk.decimals())).toNumber();
    if (decimals !== 6 && decimals !== 8 && decimals !== 18) {
        throw Error(`decimals = ${decimals}, really?`)
    }
    return decimals;
};

const approveCtkToPerpIfRequired = async (from, ctkAddress) => {
    const ctk = await TestToken.at(ctkAddress);
    const balance = new BigNumber(await ctk.balanceOf(from));
    const allowance = new BigNumber(await ctk.allowance(from, perpetualAddress));
    console.log('balance:', fromWad(balance));
    console.log('allowance:', fromWad(allowance));
    if (allowance.eq('0')) {
        await ctk.approve(perpetualAddress, infinity, { from });
        console.log('approve done');
    }
};

const deposit = async (from, amount) => {
    const perpetual = await Perpetual.at(perpetualAddress);
    await perpetual.deposit(amount, { from });
    console.log('deposit done');
};

const createPool = async (from, ammAddress) => {
    const amm = await AMM.at(ammAddress);
    await amm.createPool(toWad(0.001), { from, gas: 800000 });
    console.log('createPool done');
};

const main = async () => {
    const addresses = await web3.eth.getAccounts();
    const me = addresses[0];
    const { ctkAddress, ammAddress } = await readPerpAddress(Perpetual, AMM, perpetualAddress);
    const decimals = await getDecimals(ctkAddress);

    await approveCtkToPerpIfRequired(me, ctkAddress);
    await deposit(me, toDecimal(0.001 * 9000 * 2 * 1.5, decimals));
    await createPool(me, ammAddress);
    console.log('jobs done');
};

module.exports = (callback) => {
    main().then(() => callback()).catch(err => callback(err));
};
