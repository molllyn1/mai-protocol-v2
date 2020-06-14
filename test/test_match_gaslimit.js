const {buildOrder} = require("../test/order");
const BigNumber = require("bignumber.js");

BigNumber.config({
  EXPONENTIAL_AT: 1000
});

const _wad = new BigNumber("1000000000000000000");

const toWad = (...xs) => {
  let sum = new BigNumber(0);
  for (var x of xs) {
    sum = sum.plus(new BigNumber(x).times(_wad));
  }
  return sum.toFixed();
};

const Exchange = artifacts.require("Exchange");
const Perpetual = artifacts.require("Perpetual");
const AMM = artifacts.require("AMM");

function formatOrder(param) {
  return {
    trader: param.trader,
    broker: param.broker,
    perpetual: param.perpetual,
    amount: param.amount,
    price: param.price,
    data: param.data,
    orderHash: param.orderHash,
    v: param.signature.config,
    r: param.signature.r.toString("hex"),
    s: param.signature.s.toString("hex")
  };
}

// contract("gaslimit", accounts => {
//   it("sig", async () => {
//     const order = await buildOrder(
//       {
//         trader: "0x6766F3CFD606E1E428747D3364baE65B6f914D56",
//         price: "7000",
//         amount: "1",
//         version: 2,
//         side: "buy",
//         type: "limit",
//         expiredAt: 1686227496,
//         makerFeeRate: 1000,
//         takerFeeRate: 2000,
//         salt: 666,
//         inversed: false
//       },
//       "0x03dF601eBc3e2C9867F2BC7A1a22941232C55706",
//       "0x93388b4efe13B9B18eD480783C05462409851547"
//     );

//     const sig = await web3.eth.sign(
//       order.orderHash,
//       "0x6766F3CFD606E1E428747D3364baE65B6f914D56"
//     );
//     console.log(formatOrder(order));
//     console.log("signature:", sig);
//   });
// });

// const main = async () => {
//     const u5 = "0x2e7eDDAe6A85Ad377A958Ca70718b673c277A54B";
//     const u6 = "0xe1DDDc5026265fb253dE1327742B0b0C0B8e1dd1";
//     const broker = "0x93388b4efe13B9B18eD480783C05462409851547";

//     // const perpetual = await Perpetual.at('0x31d6da2747da384c99525180A70809aF76263b36');
//     const perpetual = await Perpetual.at('0x8f22C35dA967063E06727caB80dB5552ee70f0D6');
//     // const exchange = await Exchange.at('0xaa58cDCC8eaa9D75B7f6C85665a98e2c4684f887');
//     const exchange = await Exchange.at('0xD8293BaC8593BB6Afc38A2dF9b70805cc48BDeb2');

//     console.log(await perpetual.currentBroker(u5));
//     console.log(await perpetual.currentBroker(u6));

//     // await perpetual.depositEther({ value: toWad("5"), from: u5 });
//     // await perpetual.depositEther({ value: toWad("5"), from: u6 });

//     let salt = 0x19405f48cac0;

//     const takerParam = await buildOrder({
//         trader: u5,
//         amount: 15,
//         price: "0.0067",
//         version: 2,
//         side: 'sell',
//         type: 'limit',
//         expiredAt: 1585895686,
//         makerFeeRate: 0,
//         takerFeeRate: 0,
//         salt: salt,
//         inversed: true,
//     }, perpetual.address, broker);

//     const makerParam = await buildOrder({
//         trader: u6,
//         amount: 15,
//         price: "0.0067",
//         version: 2,
//         side: 'buy',
//         type: 'limit',
//         expiredAt: 1585895686,
//         makerFeeRate: 0,
//         takerFeeRate: 0,
//         salt: salt,
//         inversed: true,
//     }, perpetual.address, broker);

//     console.log(formatOrder(takerParam));
//     console.log(formatOrder(makerParam));

//     const tx = await exchange.matchOrders(
//         takerParam,
//         [makerParam],
//         perpetual.address,
//         [toWad("1")], {
//             from: broker
//         });

//     console.log(tx);

//     process.exit(0);
// };
