const GlobalConfig = artifacts.require('perpetual/GlobalConfig.sol');
const Perpetual = artifacts.require('perpetual/Perpetual.sol');
const LibDelayedVariable = artifacts.require('lib/LibDelayedVariable.sol');

module.exports = async function (deployer, network, accounts) {
    const dev = accounts[0];
    const ctk = '0x0000000000000000000000000000000000000000';

    const globalConfig = await GlobalConfig.deployed();

    await deployer.deploy(LibDelayedVariable);
    await deployer.link(LibDelayedVariable, Perpetual);
    await deployer.deploy(Perpetual, globalConfig.address, dev, ctk, 18, { gas: 6900000 });
};
