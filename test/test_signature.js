const assert = require('assert');
const { toWei, fromWei, toWad, fromWad, infinity, Side } = require('./constants');
const { getOrderSignature, buildOrder, getOrderHash } = require('./order');

const Testorder = artifacts.require('test/TestOrder.sol');

contract('signature', accounts => {

    let testOrder;

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
        testOrder = await Testorder.new();
    }

    before(deploy);

    it("expire at", async () => {
        const perpetualAddress = "0x4DA467821456Ca82De42fa691ddA08B24A4f0572";
        const orderA = await buildOrder({
            trader: u1,
            amount: toWad(1),
            price: toWad(6000),
            version: 2,
            side: 'sell',
            type: 'market',
            expiredAt: 1589366656,
            salt: 666,
        }, perpetualAddress, admin);
        const ts = await testOrder.getOrderExpiredAt({
            trader: orderA.trader,
            amount: orderA.amount,
            price: orderA.price,
            data: orderA.data,
            signature: orderA.signature,
        }, {})
        console.log(ts.toString());
    });

    it("generate signature", async () => {
        const perpetualAddress = "0x4DA467821456Ca82De42fa691ddA08B24A4f0572";
        const orderA = await buildOrder({
            trader: u1,
            amount: toWad(1),
            price: toWad(6000),
            version: 2,
            side: 'sell',
            type: 'market',
            expiredAtSeconds: 86400,
            salt: 666,
        }, perpetualAddress, admin);
        const orderParam = {
            trader: orderA.trader,
            amount: orderA.amount,
            price: orderA.price,
            data: orderA.data,
            signature: orderA.signature,
        }
        const orderB = await testOrder.getOrder(orderParam, perpetualAddress, admin);
        const orderHashA = getOrderHash(orderA);
        const orderHashB = await testOrder.getOrderHash(orderB);
        assert.equal(orderHashA, orderHashB);
        assert.ok(await testOrder.isValidSignature(orderParam, orderHashA));
        assert.ok(await testOrder.isValidSignature(orderParam, orderHashB));
    });

    it("generate invalid signature", async () => {
        const perpetualAddress = "0x4DA467821456Ca82De42fa691ddA08B24A4f0572";
        const orderA = await buildOrder({
            trader: u1,
            amount: toWad(1),
            price: toWad(6000),
            version: 2,
            side: 'sell',
            type: 'market',
            expiredAtSeconds: 86400,
            salt: 666,
        }, perpetualAddress, admin);
        const orderHashA = getOrderHash(orderA);

        const orderParam = await {
            trader: u1,
            amount: toWad(1),
            price: toWad(6000),
            data: orderA.data,
            signature: orderA.signature,
        }
        const orderB = await testOrder.getOrder(orderParam, perpetualAddress, u1);
        const orderHashB = await testOrder.getOrderHash(orderB);

        assert.ok(await testOrder.isValidSignature(orderParam, orderHashA));
        assert.ok(!(await testOrder.isValidSignature(orderParam, orderHashB)));
        assert.ok(orderHashA != orderHashB);
    });
});