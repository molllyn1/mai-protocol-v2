# MAI PROTOCOL V2 - PERPETUAL CONTRACT

[![Build Status](https://travis-ci.org/mcdexio/mai-protocol-v2.svg?branch=master)](https://travis-ci.org/mcdexio/mai-protocol-v2)
[![Coverage Status](https://coveralls.io/repos/github/mcdexio/mai-protocol-v2/badge.svg?branch=master)](https://coveralls.io/github/mcdexio/mai-protocol-v2?branch=master)

Mai Protocol V2 builds the decentrialized Perptual contracts on Ethereum.

The name Mai comes from two Chinese characters "买" which means buy and "卖" which means sell. Using pinyin (the modern system for transliterating Chinese characters to Latin letters) "买" is spelled Mǎi and "卖" is spelled Mài. Thus, "Mai" means "Buy" and "Sell".

## Key Fetures

- Isolated margin account management
- Trade & manage the position
- AMM to provide on-chain liquidity & funding rate
- Funding payment between long/short postions
- Validate the users' orders and execute the match result of order book
- Liquidiation of the unsafe position
- Insurance fund
- Socialize the the liquidition loss
- Global settlement when an emergency to keep the users’ assets safe

## Design Details

Check our [documents](https://github.com/mcdexio/documents) to get more information.

## Contracts

### Mainnet

|Contract|Description|Address|
|---|---|---|
|[`Perpetual`](contracts/perpetual/Perpetual.sol)               |Perpetual core logic including margin account, PnL, etc.|[0x92c506D3dd51A37650Cc8e352a7551c26E2c607d](https://etherscan.io/address/0x92c506D3dd51A37650Cc8e352a7551c26E2c607d)|
|[`AMM`](contracts/liquidity/AMM.sol)                           |Automated Market Maker                                  |[0xF4CE6d5E9Cdcd6c91e303B87E27688f01B9Bb7bf](https://etherscan.io/address/0xF4CE6d5E9Cdcd6c91e303B87E27688f01B9Bb7bf)|
|[`Proxy`](contracts/proxy/PerpetualProxy.sol)                  |AMM margin account                                      |[0xDA9f6FB1ef188E081CFBeA74ec820A3718E91f21](https://etherscan.io/address/0xDA9f6FB1ef188E081CFBeA74ec820A3718E91f21)|
|[`GlobalConfig`](contracts/global/GlobalConfig.sol)            |Common governance parameters                            |[0x77C073a91B53B35382C7C4cdF4079b7E312d552d](https://etherscan.io/address/0x77C073a91B53B35382C7C4cdF4079b7E312d552d)|
|[`Exchange`](contracts/exchange/Exchange.sol)                  |Orderbook exchange logic                                |[0xb95B9fb0539Ec84DeD2855Ed1C9C686Af9A4e8b3](https://etherscan.io/address/0xb95B9fb0539Ec84DeD2855Ed1C9C686Af9A4e8b3)|
|[`PriceFeeder`](contracts/oracle/InversedChainlinkAdapter.sol) |Price oracle                                            |[0x133906776302D10A2005ec2eD0C92ab6F2cbd903](https://etherscan.io/address/0x133906776302D10A2005ec2eD0C92ab6F2cbd903)|
|[`ShareToken`](contracts/token/ShareToken.sol)                 |Share token of the AMM                                  |[0x6d5B330523017E2D4EC36ff973a49A440aB763EF](https://etherscan.io/address/0x6d5B330523017E2D4EC36ff973a49A440aB763EF)|
|[`ContractReader`](contracts/reader/ContractReader.sol)        |A batch reader in order to reduce calling consumption   |[0xEd1051ef1BFaFA9358341517598D225d852C7796](https://etherscan.io/address/0xEd1051ef1BFaFA9358341517598D225d852C7796)|
  

  



