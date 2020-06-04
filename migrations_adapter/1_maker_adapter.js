
const MakerMedianAdapter = artifacts.require('oracle/MakerMedianAdapter.sol');

module.exports = async function (deployer, network, accounts) {
    await deployer.deploy(MakerMedianAdapter, "0x64DE91F5A373Cd4c28de3600cB34C7C6cE410C85", 18, 10);
};
