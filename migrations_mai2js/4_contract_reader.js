
const ContractReader = artifacts.require('reader/ContractReader.sol');

module.exports = async function (deployer, network, accounts) {
    await deployer.deploy(ContractReader);
    console.log('  「 Address summary 」--------------------------------------');
    console.log('   > ContractReader: ', ContractReader.address);

    const saver = require("./save_address.js");
    saver("contractReader", {
        contractReader: ContractReader.address
    });
};
