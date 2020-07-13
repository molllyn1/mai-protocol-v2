const BigNumber = require('bignumber.js');
const { perpetualAddress, readPerpAddress } = require('./addresses');
const { toWei, fromWei, toWad, fromWad, infinity, Side } = require('../test/constants');
const TestToken = artifacts.require('test/TestToken.sol');
const Perpetual = artifacts.require('Perpetual');
const AMM = artifacts.require('AMM');

const mint = async (user, amount, ctkAddress) => {
    const ctk = await TestToken.at(ctkAddress);
    await ctk.mint(user, amount);
    console.log('mint done');
};

const main = async () => {
    const addresses = await web3.eth.getAccounts();
    const dev = addresses[0];
    const u2Address = addresses[2];
    const u7Address = addresses[7];
    const { ctkAddress } = await readPerpAddress(Perpetual, AMM, perpetualAddress);
    
    await mint(dev, toWei(1000000), ctkAddress); // for updateIndex prize
    await mint(u7Address, toWei(1000000), ctkAddress); // for create_pool
    await mint(u2Address, toWei(1000000), ctkAddress);
    await mint('0xB0B390C6B4C153Ea10e19C52613a7b36ffEFc053', toWei(1000000), ctkAddress); // ji
    await mint('0x31Ebd457b999Bf99759602f5Ece5AA5033CB56B3', toWei(1000000), ctkAddress); // jie
    
    console.log('jobs done');
};

module.exports = (callback) => {
    main().then(() => callback()).catch(err => callback(err));
};
