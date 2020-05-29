const assert = require('assert');
const BigNumber = require('bignumber.js');
const { toWei, fromWei, toWad, fromWad, infinity, Side } = require('./constants');
const { getOrderSignature, buildOrder, getOrderHash, getEIP712MessageHash } = require('./order');
const { fromRpcSig } = require('ethereumjs-util');
const { hashPersonalMessage, ecsign, toBuffer, privateToAddress } = require('ethereumjs-util');

const TestPriceFeeder = artifacts.require('test/TestPriceFeeder.sol');
const ChainlinkAdapter = artifacts.require('oracle/ChainlinkAdapter.sol');
const MakerMedianAdapter = artifacts.require('oracle/MakerMedianAdapter.sol');
const ValidatedAdapter = artifacts.require('oracle/ValidatedAdapter.sol');
const DoubleCheckAdapter = artifacts.require('oracle/DoubleCheckAdapter.sol');

const toCL = (...xs) => {
    let sum = new BigNumber(0);
    for (var x of xs) {
        sum = sum.plus(new BigNumber(x).times("100000000"));
    }
    return sum.toFixed();
};


contract('oracle', accounts => {

    it("ValidatedAdapter", async () => {
        let fakeChainlink = await TestPriceFeeder.new();
        let fakeMaker = await TestPriceFeeder.new();

        let chainlinkAdapter =


            let adapter = await ValidatedAdapter.new();




    });




    it("DoubleCheckAdapter", async () => {
        let fakeChainlink = await TestPriceFeeder.new();
        let fakeMaker = await TestPriceFeeder.new();
        let adapter = await DoubleCheckAdapter.new(fakeChainlink.address, fakeMaker.address);

        try {
            await adapter.price();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("invalid target price"));
        }

        let data;
        await fakeChainlink.setPrice(toCL(100));
        await fakeMaker.setPrice(toWad(100));
        data = await adapter.price();
        assert.equal(data.newPrice, toWad(100));

        // default tolerance = 5%
        await fakeChainlink.setPrice(toCL(100));
        await fakeMaker.setPrice(toWad(104.9));
        data = await adapter.price();
        assert.equal(data.newPrice, toWad(100));

        await fakeChainlink.setPrice(toCL(100));
        await fakeMaker.setPrice(toWad(95.1));
        data = await adapter.price();
        assert.equal(data.newPrice, toWad(100));

        await fakeChainlink.setPrice(toCL(100));
        await fakeMaker.setPrice(toWad(105));
        try {
            data = await adapter.price();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("intolerant price"));
        }

        await fakeChainlink.setPrice(toCL(100));
        await fakeMaker.setPrice(toWad(95));
        try {
            data = await adapter.price();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("intolerant price"));
        }

        await fakeChainlink.setPrice(toCL(105.26));
        await fakeMaker.setPrice(toWad(100));
        data = await adapter.price();
        assert.equal(data.newPrice, toWad(105.26));

        await fakeChainlink.setPrice(toCL(105.27));
        await fakeMaker.setPrice(toWad(100));
        try {
            data = await adapter.price();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("intolerant price"));
        }

        await fakeChainlink.setPrice(toCL(95.24));
        await fakeMaker.setPrice(toWad(100));
        data = await adapter.price();
        assert.equal(data.newPrice, toWad(95.24));

        await fakeChainlink.setPrice(toCL(95.23));
        await fakeMaker.setPrice(toWad(100));
        try {
            data = await adapter.price();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("intolerant price"));
        }
    });
});