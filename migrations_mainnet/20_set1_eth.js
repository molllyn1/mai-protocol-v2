const ShareToken = artifacts.require('token/ShareToken.sol');
const AMM = artifacts.require('liquidity/AMM.sol');

module.exports = async function (deployer, network, accounts) {
    const shareToken = await ShareToken.deployed();
    const amm = await AMM.deployed();

    console.log('set minter...');
    await shareToken.addMinter(amm.address);

    const admin1 = ''
    if (!admin1) {
        throw 'please set an admin'
    }
    await shareToken.addMinter(admin1);

    await shareToken.renounceMinter(); // uncomment this line will denial future addMinter() requests
};
