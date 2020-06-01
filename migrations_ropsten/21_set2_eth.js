const Perpetual = artifacts.require('perpetual/Perpetual.sol');
const AMM = artifacts.require('liquidity/AMM.sol');

const toBytes32 = s => {
    return web3.utils.fromAscii(s);
};

module.exports = async function(deployer, network, accounts) {
    const perpetual = await Perpetual.deployed();
    const amm = await AMM.deployed();

    console.log('set funding...');
    await perpetual.setGovernanceAddress(toBytes32("amm"), amm.address);
};