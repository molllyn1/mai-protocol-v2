const { toWad } = require('../test/constants');

const Perpetual = artifacts.require('perpetual/Perpetual.sol');

const toBytes32 = s => {
    return web3.utils.fromAscii(s);
};

module.exports = async function (deployer, network, accounts) {
    const perpetual = await Perpetual.deployed();

    console.log('default gov...');
    await perpetual.setGovernanceParameter(toBytes32("initialMarginRate"), toWad(0.10)); // 10%, should < 1
    await perpetual.setGovernanceParameter(toBytes32("maintenanceMarginRate"), toWad(0.075)); // 7.5%, should < initialMarginRate
    await perpetual.setGovernanceParameter(toBytes32("liquidationPenaltyRate"), toWad(0.015)); // 1.5%, should < maintenanceMarginRate
    await perpetual.setGovernanceParameter(toBytes32("penaltyFundRate"), toWad(0.01)); // 1.0%, should < maintenanceMarginRate
    await perpetual.setGovernanceParameter(toBytes32("takerDevFeeRate"), toWad(0.00075)); // 0.075%
    await perpetual.setGovernanceParameter(toBytes32("makerDevFeeRate"), toWad(-0.00025)); // -0.025%

    await perpetual.setGovernanceParameter(toBytes32("tradingLotSize"), toWad(100));
    await perpetual.setGovernanceParameter(toBytes32("lotSize"), toWad(100));
};
