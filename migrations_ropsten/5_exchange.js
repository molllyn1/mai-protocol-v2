const ContractReader = artifacts.require('reader/ContractReader.sol');
const GlobalConfig = artifacts.require('perpetual/GlobalConfig.sol');
const Exchange = artifacts.require('exchange/Exchange.sol');

module.exports = async function (deployer, network, accounts) {
    await deployer.deploy(Exchange, GlobalConfig.address, { gas: 4000000 });

    const contractReader = await ContractReader.deployed();
    const globalConfig = await GlobalConfig.deployed();
    const exchange = await Exchange.deployed();
    console.log('  「 Address summary 」--------------------------------------');
    console.log('   > contractReader: ', contractReader.address);
    console.log('   > globalConfig:   ', globalConfig.address);
    console.log('   > exchange:       ', exchange.address);
};
