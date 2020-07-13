const BigNumber = require('bignumber.js');
const { perpetualAddress, readPerpAddress } = require('./addresses');
const { toWei, toDecimal, fromDecimal } = require('../test/constants');
const TestToken = artifacts.require('test/TestToken.sol');
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
    const decimals = await getDecimals(ctkAddress);
    
    await mint(dev, toDecimal(1000000, decimals), ctkAddress); // for updateIndex prize
    await mint(u7Address, toDecimal(1000000, decimals), ctkAddress); // for create_pool
    await mint(u2Address, toDecimal(1000000, decimals), ctkAddress);
    await mint('0xB0B390C6B4C153Ea10e19C52613a7b36ffEFc053', toDecimal(1000000, decimals), ctkAddress); // ji
    await mint('0x31Ebd457b999Bf99759602f5Ece5AA5033CB56B3', toDecimal(1000000, decimals), ctkAddress); // jie
    
    console.log('jobs done');
};

module.exports = (callback) => {
    main().then(() => callback()).catch(err => callback(err));
};
