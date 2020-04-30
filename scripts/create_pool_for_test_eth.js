const BigNumber = require('bignumber.js');
const { perpetualAddress, readPerpAddress } = require('./addresses');
const { toWei, fromWei, toWad, fromWad, infinity, Side } = require('../test/constants');
const Perpetual = artifacts.require('Perpetual');
const AMM = artifacts.require('AMM');

const deposit = async (from, amount, brokerAddress) => {
    const balance = new BigNumber(await web3.eth.getBalance(from));
    if (balance.lt(amount)) {
        throw Error('insufficent ETH. check ganache parameters');
    }

    const perpetual = await Perpetual.at(perpetualAddress);
    const cashBalance = await perpetual.getCashBalance(from);
    console.log('cash', cashBalance.balance);
    if (new BigNumber(cashBalance.balance).gte(amount)) {
        console.log('skip deposit');
        return;
    }
    await perpetual.depositEtherAndSetBroker(brokerAddress, { from, value: amount, gas: 1000000 });
    console.log('deposit done');
};

const createPool = async (from, ammAddress) => {
    const amm = await AMM.at(ammAddress);
    await amm.createPool(toWad(100), { from, gas: 800000 });
    console.log('createPool done');
};

const main = async () => {
    const addresses = await web3.eth.getAccounts();
    const me = addresses[0];
    const { ammAddress, proxyAddress } = await readPerpAddress(Perpetual, AMM, perpetualAddress);
    await deposit(me, toWad(100 * 0.0062 * 2 * 1.5), proxyAddress);
    await createPool(me, ammAddress);
    console.log('jobs done');
};

module.exports = (callback) => {
    main().then(() => callback()).catch(err => callback(err));
};
