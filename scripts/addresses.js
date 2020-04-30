

const perpetualAddress = '0xb2e66c00c3389b4887a5Ac1346536B763F733fC3';

const readPerpAddress = async (Perpetual, AMM, perpetualAddress) => {
    const perpetual = await Perpetual.at(perpetualAddress);
    ammAddress = await perpetual.amm();
    ctkAddress = await perpetual.collateral();
    const amm = await AMM.at(ammAddress);
    proxyAddress = await amm.perpetualProxy();
    return { ctkAddress, proxyAddress, ammAddress };
};

module.exports = {
    perpetualAddress,
    readPerpAddress
};
