const GlobalConfig = artifacts.require('perpetual/GlobalConfig.sol');

module.exports = async function (deployer, network, accounts) {
    await deployer.deploy(GlobalConfig, { gas: 850000 });
};
