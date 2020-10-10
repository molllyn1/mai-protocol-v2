const ContractReader = artifacts.require('reader/ContractReader.sol');
const GlobalConfig = artifacts.require('global/GlobalConfig.sol');
const Exchange = artifacts.require('exchange/Exchange.sol');

module.exports = async function (deployer, network, accounts) {
    
    const globalConfig = await GlobalConfig.at("0x098fb3aec50de9c6e072cbe92a0591afbe53b2bd");
    await deployer.deploy(Exchange, globalConfig.address, { gas: 4000000 });
    const exchange = await Exchange.deployed();

    console.log('  「 Address summary 」--------------------------------------');
    console.log('   > globalConfig:   ', globalConfig.address);
    console.log('   > exchange:       ', exchange.address);
};
