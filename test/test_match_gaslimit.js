const assert = require('assert');
const {
    initializeToken,
    call,
    send,
    increaseEvmBlock,
    toBytes32
} = require('./funcs');
const {
    toWad,
    fromWad,
    infinity,
    Side
} = require('./constants');
const {
    buildOrder,
    getOrderHash
} = require('./order');

const TestToken = artifacts.require('test/TestToken.sol');
const TestFundingMock = artifacts.require('test/TestFundingMock.sol');
const Perpetual = artifacts.require('perpetual/Perpetual.sol');
const GlobalConfig = artifacts.require('perpetual/GlobalConfig.sol');
const Exchange = artifacts.require('exchange/Exchange.sol');
const ExchangeStorage = artifacts.require('exchange/ExchangeStorage.sol');

contract('exchange-user', accounts => {
    const FLAT = 0;
    const SHORT = 1;
    const LONG = 2;

    let collateral;
    let global;
    let funding;
    let perpetual;
    let exchange;
    let exchangeStorage;

    const broker = accounts[9];
    const admin = accounts[0];
    const dev = accounts[1];

    const u1 = accounts[4];
    const u2 = accounts[5];
    const u3 = accounts[6];
    const u4 = accounts[7];
    const u5 = accounts[8];

    const users = {
        broker,
        admin,
        u1,
        u2,
        u3,
        u4,
    };

    const increaseBlockBy = async (n) => {
        for (let i = 0; i < n; i++) {
            await increaseEvmBlock();
        }
    };

    const deploy = async (cDecimals = 18, pDecimals = 18) => {
        collateral = await TestToken.new("TT", "TestToken", cDecimals);
        global = await GlobalConfig.new();
        funding = await TestFundingMock.new();
        exchangeStorage = await ExchangeStorage.new();
        exchange = await Exchange.new(exchangeStorage.address);
        perpetual = await Perpetual.new(
            global.address,
            dev,
            collateral.address,
            cDecimals
        );
        await perpetual.setGovernanceAddress(toBytes32("amm"), funding.address);

        await perpetual.addWhitelisted(exchange.address);
        await perpetual.addWhitelisted(admin);
        await perpetual.setBroker(admin, {
            from: u1
        });
        await perpetual.setBroker(admin, {
            from: u2
        });
        await perpetual.setBroker(admin, {
            from: u3
        });
        await perpetual.setBroker(admin, {
            from: u4
        });

        await increaseBlockBy(4);
    };

    const setDefaultGovParameters = async () => {
        await perpetual.setGovernanceParameter(toBytes32("initialMarginRate"), toWad(0.1));
        await perpetual.setGovernanceParameter(toBytes32("maintenanceMarginRate"), toWad(0.05));
        await perpetual.setGovernanceParameter(toBytes32("liquidationPenaltyRate"), toWad(0.005));
        await perpetual.setGovernanceParameter(toBytes32("penaltyFundRate"), toWad(0.005));
        await perpetual.setGovernanceParameter(toBytes32("takerDevFeeRate"), toWad(0.01));
        await perpetual.setGovernanceParameter(toBytes32("makerDevFeeRate"), toWad(0.02));
        await perpetual.setGovernanceParameter(toBytes32("lotSize"), 1);
        await perpetual.setGovernanceParameter(toBytes32("tradingLotSize"), 1);
    };

    beforeEach(async () => {
        await deploy();
        await setDefaultGovParameters();
    });

    const initialize = async (account, amount) => {
        await collateral.transfer(account, toWad(amount));
        await collateral.approve(perpetual.address, infinity, {
            from: account
        });
        await perpetual.deposit(toWad(amount), {
            from: account
        });
        assert.equal(fromWad(await cashBalanceOf(account)), amount);
        await perpetual.setBroker(admin, {
            from: account
        });
    };

    const positionSize = async (user) => {
        const positionAccount = await perpetual.getPosition(user);
        return positionAccount.size;
    }

    const positionEntryValue = async (user) => {
        const positionAccount = await perpetual.getPosition(user);
        return positionAccount.entryValue;
    }

    const cashBalanceOf = async (user) => {
        const cashAccount = await perpetual.getCashBalance(user);
        return cashAccount.balance;
    }

    it("1t1m", async () => {
      await collateral.transfer(u1, toWad(10000));
      await collateral.approve(perpetual.address, infinity, {
          from: u1
      });
      await perpetual.deposit(toWad(10000), {
          from: u1
      });
      assert.equal(fromWad(await cashBalanceOf(u1)), 10000);
      await perpetual.setBroker(admin, {
          from: u1
      });

      await collateral.transfer(u2, toWad(10000));
      await collateral.approve(perpetual.address, infinity, {
          from: u2
      });
      await perpetual.deposit(toWad(10000), {
          from: u2
      });
      assert.equal(fromWad(await cashBalanceOf(u2)), 10000);
      await perpetual.setBroker(admin, {
          from: u2
      });

      await funding.setMarkPrice(toWad(6000));

      const takerParam = await buildOrder({
          trader: u1,
          amount: 1,
          price: 6000,
          version: 2,
          side: 'sell',
          type: 'limit',
          expiredAtSeconds: 86400,
          makerFeeRate: 1000,
          takerFeeRate: 1000,
          salt: 666,
      }, perpetual.address, admin);

      const makerParam = await buildOrder({
          trader: u2,
          amount: 1,
          price: 6000,
          version: 2,
          side: 'buy',
          type: 'limit',
          expiredAtSeconds: 86400,
          makerFeeRate: 1000,
          takerFeeRate: 1000,
          salt: 666,
      }, perpetual.address, admin);

      const tx = await exchange.matchOrders(
          takerParam,
          [
              makerParam
          ],
          perpetual.address,
          [
              toWad(1)
          ]
      );

      console.log("1t1m:", (await web3.eth.getTransaction(tx.tx)).input.length);
      console.log("1t1m:", tx.receipt.gasUsed);
  });

  it("1t2m", async () => {
    await collateral.transfer(u1, toWad(100000));
    await collateral.approve(perpetual.address, infinity, { from: u1 });
    await perpetual.deposit(toWad(100000), {from: u1});
    assert.equal(fromWad(await cashBalanceOf(u1)), 100000);
    await perpetual.setBroker(admin, {from: u1});

    await collateral.transfer(u2, toWad(100000));
    await collateral.approve(perpetual.address, infinity, {from: u2});
    await perpetual.deposit(toWad(100000), {from: u2});
    assert.equal(fromWad(await cashBalanceOf(u2)), 100000);
    await perpetual.setBroker(admin, {from: u2});

    await collateral.transfer(u3, toWad(100000));
    await collateral.approve(perpetual.address, infinity, {from: u3});
    await perpetual.deposit(toWad(100000), {from: u3});
    assert.equal(fromWad(await cashBalanceOf(u3)), 100000);
    await perpetual.setBroker(admin, {from: u3});

    await funding.setMarkPrice(toWad(6000));

    const takerParam = await buildOrder({
        trader: u1,
        amount: 2,
        price: 6000,
        version: 2,
        side: 'sell',
        type: 'limit',
        expiredAtSeconds: 86400,
        makerFeeRate: 1000,
        takerFeeRate: 1000,
        salt: 666,
    }, perpetual.address, admin);

    const makerParam1 = await buildOrder({
        trader: u2,
        amount: 1,
        price: 6000,
        version: 2,
        side: 'buy',
        type: 'limit',
        expiredAtSeconds: 86400,
        makerFeeRate: 1000,
        takerFeeRate: 1000,
        salt: 666,
    }, perpetual.address, admin);

    const makerParam2 = await buildOrder({
      trader: u3,
      amount: 1,
      price: 6000,
      version: 2,
      side: 'buy',
      type: 'limit',
      expiredAtSeconds: 86400,
      makerFeeRate: 1000,
      takerFeeRate: 1000,
      salt: 666,
    }, perpetual.address, admin);

    const tx = await exchange.matchOrders(
        takerParam,
        [
            makerParam1,
            makerParam2
        ],
        perpetual.address,
        [
            toWad(1),
            toWad(1)
        ]
    );
    console.log("1t2m:", (await web3.eth.getTransaction(tx.tx)).input.length);
    console.log("1t2m:", tx.receipt.gasUsed);
  })

  it("1t3m", async () => {
    await collateral.transfer(u1, toWad(100000));
    await collateral.approve(perpetual.address, infinity, { from: u1 });
    await perpetual.deposit(toWad(100000), {from: u1});
    assert.equal(fromWad(await cashBalanceOf(u1)), 100000);
    await perpetual.setBroker(admin, {from: u1});

    await collateral.transfer(u2, toWad(100000));
    await collateral.approve(perpetual.address, infinity, {from: u2});
    await perpetual.deposit(toWad(100000), {from: u2});
    assert.equal(fromWad(await cashBalanceOf(u2)), 100000);
    await perpetual.setBroker(admin, {from: u2});

    await collateral.transfer(u3, toWad(100000));
    await collateral.approve(perpetual.address, infinity, {from: u3});
    await perpetual.deposit(toWad(100000), {from: u3});
    assert.equal(fromWad(await cashBalanceOf(u3)), 100000);
    await perpetual.setBroker(admin, {from: u3});

    await collateral.transfer(u4, toWad(100000));
    await collateral.approve(perpetual.address, infinity, {from: u4});
    await perpetual.deposit(toWad(100000), {from: u4});
    assert.equal(fromWad(await cashBalanceOf(u4)), 100000);
    await perpetual.setBroker(admin, {from: u4});

    await funding.setMarkPrice(toWad(6000));

    const takerParam = await buildOrder({
        trader: u1,
        amount: 3,
        price: 6000,
        version: 2,
        side: 'sell',
        type: 'limit',
        expiredAtSeconds: 86400,
        makerFeeRate: 1000,
        takerFeeRate: 1000,
        salt: 666,
    }, perpetual.address, admin);

    const makerParam1 = await buildOrder({
        trader: u2,
        amount: 1,
        price: 6000,
        version: 2,
        side: 'buy',
        type: 'limit',
        expiredAtSeconds: 86400,
        makerFeeRate: 1000,
        takerFeeRate: 1000,
        salt: 666,
    }, perpetual.address, admin);

    const makerParam2 = await buildOrder({
        trader: u3,
        amount: 1,
        price: 6000,
        version: 2,
        side: 'buy',
        type: 'limit',
        expiredAtSeconds: 86400,
        makerFeeRate: 1000,
        takerFeeRate: 1000,
        salt: 666,
      }, perpetual.address, admin);

    const makerParam3 = await buildOrder({
        trader: u4,
        amount: 1,
        price: 6000,
        version: 2,
        side: 'buy',
        type: 'limit',
        expiredAtSeconds: 86400,
        makerFeeRate: 1000,
        takerFeeRate: 1000,
        salt: 666,
      }, perpetual.address, admin);

    const tx = await exchange.matchOrders(
        takerParam,
        [
            makerParam1,
            makerParam2,
            makerParam3
        ],
        perpetual.address,
        [
            toWad(1),
            toWad(1),
            toWad(1)
        ]
    );
    console.log("1t3m:", (await web3.eth.getTransaction(tx.tx)).input.length);
    console.log("1t3m:", tx.receipt.gasUsed);
  })

  it("1t4m", async () => {
    await collateral.transfer(u1, toWad(100000));
    await collateral.approve(perpetual.address, infinity, { from: u1 });
    await perpetual.deposit(toWad(100000), {from: u1});
    assert.equal(fromWad(await cashBalanceOf(u1)), 100000);
    await perpetual.setBroker(admin, {from: u1});

    await collateral.transfer(u2, toWad(100000));
    await collateral.approve(perpetual.address, infinity, {from: u2});
    await perpetual.deposit(toWad(100000), {from: u2});
    assert.equal(fromWad(await cashBalanceOf(u2)), 100000);
    await perpetual.setBroker(admin, {from: u2});

    await collateral.transfer(u3, toWad(100000));
    await collateral.approve(perpetual.address, infinity, {from: u3});
    await perpetual.deposit(toWad(100000), {from: u3});
    assert.equal(fromWad(await cashBalanceOf(u3)), 100000);
    await perpetual.setBroker(admin, {from: u3});

    await collateral.transfer(u4, toWad(100000));
    await collateral.approve(perpetual.address, infinity, {from: u4});
    await perpetual.deposit(toWad(100000), {from: u4});
    assert.equal(fromWad(await cashBalanceOf(u4)), 100000);
    await perpetual.setBroker(admin, {from: u4});

    await collateral.transfer(u5, toWad(100000));
    await collateral.approve(perpetual.address, infinity, {from: u5});
    await perpetual.deposit(toWad(100000), {from: u5});
    assert.equal(fromWad(await cashBalanceOf(u5)), 100000);
    await perpetual.setBroker(admin, {from: u5});

    await funding.setMarkPrice(toWad(6000));

    const takerParam = await buildOrder({
        trader: u1,
        amount: 4,
        price: 6000,
        version: 2,
        side: 'sell',
        type: 'limit',
        expiredAtSeconds: 86400,
        makerFeeRate: 1000,
        takerFeeRate: 1000,
        salt: 666,
    }, perpetual.address, admin);

    const makerParam1 = await buildOrder({
        trader: u2,
        amount: 1,
        price: 6000,
        version: 2,
        side: 'buy',
        type: 'limit',
        expiredAtSeconds: 86400,
        makerFeeRate: 1000,
        takerFeeRate: 1000,
        salt: 666,
    }, perpetual.address, admin);

    const makerParam2 = await buildOrder({
      trader: u3,
      amount: 1,
      price: 6000,
      version: 2,
      side: 'buy',
      type: 'limit',
      expiredAtSeconds: 86400,
      makerFeeRate: 1000,
      takerFeeRate: 1000,
      salt: 666,
    }, perpetual.address, admin);

    const makerParam3 = await buildOrder({
      trader: u4,
      amount: 1,
      price: 6000,
      version: 2,
      side: 'buy',
      type: 'limit',
      expiredAtSeconds: 86400,
      makerFeeRate: 1000,
      takerFeeRate: 1000,
      salt: 666,
    }, perpetual.address, admin);

    const makerParam4 = await buildOrder({
      trader: u5,
      amount: 1,
      price: 6000,
      version: 2,
      side: 'buy',
      type: 'limit',
      expiredAtSeconds: 86400,
      makerFeeRate: 1000,
      takerFeeRate: 1000,
      salt: 666,
    }, perpetual.address, admin);

    const tx = await exchange.matchOrders(
        takerParam,
        [
            makerParam1,
            makerParam2,
            makerParam3,
            makerParam4
        ],
        perpetual.address,
        [
            toWad(1),
            toWad(1),
            toWad(1),
            toWad(1)
        ]
    );
    console.log("1t4m:", (await web3.eth.getTransaction(tx.tx)).input.length);
    console.log("1t4m:", tx.receipt.gasUsed);
  })
})