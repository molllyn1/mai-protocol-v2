const BigNumber = require('bignumber.js')
const PriceFeeder = artifacts.require('test/TestPriceFeeder.sol');

module.exports = async function (deployer, network, accounts) {
    await deployer.deploy(PriceFeeder);

    const priceFeeder = await PriceFeeder.deployed();
    console.log('  「 Address summary 」--------------------------------------');
    console.log('   > priceFeeder:    ', priceFeeder.address);

    console.log('feed price (test only)...');
    const price = (new BigNumber('1')).div('120').shiftedBy(18).dp(0, BigNumber.ROUND_DOWN);
    await priceFeeder.setPrice(price);
};
