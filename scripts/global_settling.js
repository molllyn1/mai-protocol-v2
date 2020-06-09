const BigNumber = require('bignumber.js');
const { toWei, fromWei, toWad, fromWad, infinity, Side } = require('../test/constants');
const Perpetual = artifacts.require('Perpetual');

const settle = async () => {
    const perpetual = await Perpetual.at("0x92c506D3dd51A37650Cc8e352a7551c26E2c607d");
    await perpetual.beginGlobalSettlement(toWad(""));
    console.log(await perpetual.status());
    console.log(fromWad(await perpetual.settlementPrice()));
}

module.exports = (callback) => {
    settle().then(() => callback()).catch(err => callback(err));
};