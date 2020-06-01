const TestToken = artifacts.require('test/TestToken.sol');

module.exports = async function (deployer, network, accounts) {
    await deployer.deploy(TestToken, "Test", "DAI", 18);
};
