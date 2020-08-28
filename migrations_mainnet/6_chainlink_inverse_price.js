const ChainlinkAdapter = artifacts.require('oracle/ChainlinkAdapter.sol');
const { fromWad } = require('../test/constants');

module.exports = async function (deployer, network, accounts) {
    // mainnet
    //   https://docs.chain.link/docs/price-feeds-migration-august-2020
    //   eth/usd 0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419

    await deployer.deploy(ChainlinkAdapter, '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419', 3600 * 6, true, { gas: 700000 });
    const priceFeeder = await ChainlinkAdapter.deployed();

    console.log('  「 Address summary 」--------------------------------------');
    console.log('   > priceFeeder:    ', priceFeeder.address);

    const p = await priceFeeder.price()
    console.log('    (priceFeeder simple test:', fromWad(p.newPrice), p.timestamp.toString(), ')')

    const admin1 = ''
    if (!admin1) {
        throw 'please set an admin'
    }
    await priceFeeder.transferOwnership(admin1, { gas: 60000 });
};
