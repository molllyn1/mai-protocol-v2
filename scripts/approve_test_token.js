const BigNumber = require('bignumber.js');
const { perpetualAddress, readPerpAddress } = require('./addresses');
const { toWei, fromWei, toWad, fromWad, infinity, Side } = require('../test/constants');
const TestToken = artifacts.require('TestToken');
const PriceFeeder = artifacts.require('TestPriceFeeder');
const GlobalConfig = artifacts.require('GlobalConfig');
const Perpetual = artifacts.require('Perpetual');
const AMM = artifacts.require('AMM');

const approveCtkToPerpIfRequired = async (from, ctkAddress) => {
    const ctk = await TestToken.at(ctkAddress);
    const allowance = new BigNumber(await ctk.allowance(from, perpetualAddress));
    console.log('allowance:', fromWad(allowance));
    if (allowance.eq('0')) {
        await ctk.approve(perpetualAddress, infinity, { from });
        console.log('approve done');
    }
};

const main = async () => {
    const addresses = await web3.eth.getAccounts();
    const me = addresses[0];
    const { ctkAddress } = await readPerpAddress(Perpetual, AMM, perpetualAddress);

    console.log('checking', me, '...');
    await approveCtkToPerpIfRequired(me, ctkAddress);
    console.log('jobs done');
};

module.exports = (callback) => {
    main().then(() => callback()).catch(err => callback(err));
};
