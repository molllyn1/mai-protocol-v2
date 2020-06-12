pragma solidity 0.5.15;
pragma experimental ABIEncoderV2; // to enable structure-type parameter

import "../lib/LibTypes.sol";
import "../interface/IPerpetual.sol";

contract ContractReader {
    struct GovParams {
        uint256 withdrawalLockBlockCount;
        uint256 brokerLockBlockCount;
        LibTypes.PerpGovernanceConfig perpGovernanceConfig;
        LibTypes.AMMGovernanceConfig ammGovernanceConfig;
        address amm; // AMM contract address
        address poolAccount; // AMM account address
    }

    struct PerpetualStorage {
        address collateralTokenAddress;
        address shareTokenAddress;
        uint256 totalSize;
        int256 insuranceFundBalance;
        int256 longSocialLossPerContract;
        int256 shortSocialLossPerContract;
        bool isEmergency;
        bool isGlobalSettled;
        uint256 globalSettlePrice;
        LibTypes.FundingState fundingParams;
    }

    struct AccountStorage {
        LibTypes.MarginAccount margin;
        LibTypes.DelayedVariable broker;
        LibTypes.DelayedVariable withdrawalLock;
    }

    function getGovParams(address perpetualAddress) public view returns (GovParams memory params) {
        IPerpetual perpetual = IPerpetual(perpetualAddress);
        params.perpGovernanceConfig = perpetual.getGovernance();
        params.ammGovernanceConfig = perpetual.amm().getGovernance();
        params.amm = address(perpetual.amm());
        params.poolAccount = address(perpetual.amm().perpetualProxy());
    }

    function getPerpetualStorage(address perpetualAddress) public view returns (PerpetualStorage memory params) {
        IPerpetual perpetual = IPerpetual(perpetualAddress);
        params.collateralTokenAddress = address(perpetual.collateral());
        params.shareTokenAddress = address(perpetual.amm().shareTokenAddress());

        params.totalSize = perpetual.totalSize(LibTypes.Side.LONG);
        params.longSocialLossPerContract = perpetual.socialLossPerContract(LibTypes.Side.LONG);
        params.shortSocialLossPerContract = perpetual.socialLossPerContract(LibTypes.Side.SHORT);
        params.insuranceFundBalance = perpetual.insuranceFundBalance();

        params.isEmergency = perpetual.status() == LibTypes.Status.EMERGENCY;
        params.isGlobalSettled = perpetual.status() == LibTypes.Status.SETTLED;
        params.globalSettlePrice = perpetual.settlementPrice();

        params.fundingParams = perpetual.amm().lastFundingState();
    }

    function getAccountStorage(address perpetualAddress, address trader)
        public
        view
        returns (AccountStorage memory params)
    {
        IPerpetual perpetual = IPerpetual(perpetualAddress);
        params.margin = perpetual.getMarginAccount(trader);
        params.broker = perpetual.getBroker(trader);
        params.withdrawalLock = perpetual.getWithdrawalLock(trader);
    }
}
