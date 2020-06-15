const GlobalConfig = artifacts.require('perpetual/GlobalConfig.sol');

const toBytes32 = s => {
    return web3.utils.fromAscii(s);
};

module.exports = async function (deployer, network, accounts) {
    const globalConfig = await GlobalConfig.deployed();

    console.log('default gov...');
};
