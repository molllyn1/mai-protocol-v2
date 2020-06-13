const assert = require('assert');
const { toWei, fromWei, toWad, fromWad, infinity, Side } = require('./constants');
const { getOrderSignature, buildOrder, getOrderHash, getEIP712MessageHash } = require('./order');
const { fromRpcSig } = require('ethereumjs-util');

const TestTypes = artifacts.require('test/TestTypes.sol');
const TestOrder = artifacts.require('test/TestOrder.sol');
const TestSignature = artifacts.require('test/TestSignature.sol');

contract('order', accounts => {

    let testOrder;
    let testType;

    const broker = accounts[9];
    const admin = accounts[0];

    const u1 = accounts[4];
    const u2 = accounts[5];
    const u3 = accounts[6];

    const users = {
        broker,
        admin,
        u1,
        u2,
        u3,
    }

    const deploy = async () => {
        testOrder = await TestOrder.new();
        testType = await TestTypes.new();
    }

    before(deploy);


    it("test order", async () => {
        const trader = u1
        const perpetualAddress = "0x4DA467821456Ca82De42fa691ddA08B24A4f0572";

        const offline = await buildOrder({
            trader: trader,
            amount: 1,
            price: 6000,
            version: 2,
            side: 'buy',
            type: 'market',
            expiredAt: 1589366656,
            salt: 666,
        }, perpetualAddress, admin);

        const orderParam = {
            trader: trader,
            amount: toWad(1),
            price: toWad(6000),
            data: offline.data,
            signature: offline.signature,
        };
        const order = await testOrder.getOrder(orderParam, perpetualAddress, admin);
        const orderHash = await testOrder.getOrderHash(order);

        console.log("----")
        console.log(orderParam.data);
        console.log("++++", await testOrder.chainId(orderParam));
        console.log("----")


        assert.equal(getOrderHash(offline), orderHash);
        assert.equal(await testOrder.expiredAt.call(orderParam, {from:admin}), 1589366656);
        assert.equal(await testOrder.isSell.call(orderParam, {from:admin}), false);
        assert.equal(await testOrder.getPrice.call(orderParam, {from:admin}), toWad(6000));
        assert.equal(await testOrder.isMarketOrder.call(orderParam, {from:admin}), true);
        assert.equal(await testOrder.isMarketBuy.call(orderParam, {from:admin}), true);
        assert.equal(await testOrder.isMakerOnly.call(orderParam, {from:admin}), false);
        assert.equal(await testOrder.isInversed.call(orderParam, {from:admin}), false);
        assert.equal(await testOrder.side.call(orderParam, {from:admin}), 2);
        assert.equal(await testOrder.makerFeeRate.call(orderParam, {from:admin}), 0);
        assert.equal(await testOrder.takerFeeRate.call(orderParam, {from:admin}), 0);
    });

    it("test order 2", async () => {
        const trader = u1
        const perpetualAddress = "0x4DA467821456Ca82De42fa691ddA08B24A4f0572";

        const offline = await buildOrder({
            trader: trader,
            amount: 1,
            price: 6000,
            version: 2,
            side: 'sell',
            type: 'limit',
            expiredAt: 1589366657,
            salt: 666,
            makerFeeRate: -15, // 100000
            takerFeeRate: 20
        }, perpetualAddress, admin);

        const orderParam = {
            trader: trader,
            amount: toWad(1),
            price: toWad(6000),
            data: offline.data,
            signature: offline.signature,
        };
        const orderHash = await testOrder.getOrderHash(await testOrder.getOrder(orderParam, perpetualAddress, admin));

        assert.equal(getOrderHash(offline), orderHash);
        assert.equal(await testOrder.expiredAt.call(orderParam, {from:admin}), 1589366657);
        assert.equal(await testOrder.isSell.call(orderParam, {from:admin}), true);
        assert.equal(await testOrder.getPrice.call(orderParam, {from:admin}), toWad(6000));
        assert.equal(await testOrder.isMarketOrder.call(orderParam, {from:admin}), false);
        assert.equal(await testOrder.isMarketBuy.call(orderParam, {from:admin}), false);
        assert.equal(await testOrder.isMakerOnly.call(orderParam, {from:admin}), false);
        assert.equal(await testOrder.isInversed.call(orderParam, {from:admin}), false);
        assert.equal(await testOrder.side.call(orderParam, {from:admin}), 1);
        assert.equal((await testOrder.makerFeeRate.call(orderParam, {from:admin})).toString(), toWad(-0.00015));
        assert.equal((await testOrder.takerFeeRate.call(orderParam, {from:admin})).toString(), toWad(0.0002));
    });

    it("test order 3", async () => {
        const trader = u1
        const perpetualAddress = "0x4DA467821456Ca82De42fa691ddA08B24A4f0572";

        const offline = await buildOrder({
            trader: trader,
            amount: 1,
            price: 6000,
            version: 2,
            side: 'sell',
            type: 'market',
            expiredAt: 1589366657,
            salt: 666,
            makerFeeRate: -15, // 100000
            takerFeeRate: 20,
            inversed: true,
        }, perpetualAddress, admin);

        const orderParam = {
            trader: trader,
            amount: toWad(1),
            price: toWad(6000),
            data: offline.data,
            signature: offline.signature,
        };
        const orderHash = await testOrder.getOrderHash(await testOrder.getOrder(orderParam, perpetualAddress, admin));

        assert.equal(getOrderHash(offline), orderHash);
        assert.equal(await testOrder.expiredAt.call(orderParam, {from:admin}), 1589366657);
        assert.equal(await testOrder.isSell.call(orderParam, {from:admin}), false);
        assert.equal((await testOrder.getPrice.call(orderParam, {from:admin})).toString(), "166666666666667");
        assert.equal(await testOrder.isMarketOrder.call(orderParam, {from:admin}), true);
        assert.equal(await testOrder.isMarketBuy.call(orderParam, {from:admin}), true);
        assert.equal(await testOrder.isMakerOnly.call(orderParam, {from:admin}), false);
        assert.equal(await testOrder.isInversed.call(orderParam, {from:admin}), true);
        assert.equal(await testOrder.side.call(orderParam, {from:admin}), 2);
        assert.equal((await testOrder.makerFeeRate.call(orderParam, {from:admin})).toString(), toWad(-0.00015));
        assert.equal((await testOrder.takerFeeRate.call(orderParam, {from:admin})).toString(), toWad(0.0002));
    });

    it("test order 3", async () => {
        assert.equal(await testType.counterSide(0), 0);
        assert.equal(await testType.counterSide(1), 2);
        assert.equal(await testType.counterSide(2), 1);
    });
});