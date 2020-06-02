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
const ValidatedAdapterV2 = artifacts.require('oracle/ValidatedAdapterV2.sol');
const DoubleCheckAdapter = artifacts.require('oracle/DoubleCheckAdapter.sol');

const toCL = (...xs) => {
    let sum = new BigNumber(0);
    for (var x of xs) {
        sum = sum.plus(new BigNumber(x).times("100000000"));
    }
    return sum.toFixed();
};


contract('oracle', accounts => {

    const sleep = (ms) => {
        return new Promise((resolve) => {
          setTimeout(resolve, ms);
        });
    }

    const now = () => {
        return Math.round(new Date().getTime() / 1000);
    }

    it("ValidatedAdapterV2 timeouts", async () => {
        let simChainlink = await TestPriceFeeder.new();
        let simMakerMedian = await TestPriceFeeder.new();
        let chainlinkAdapter = await ChainlinkAdapter.new(simChainlink.address);
        let makerMedianAdapter = await MakerMedianAdapter.new(simMakerMedian.address);

        let adapter = await ValidatedAdapterV2.new(3);
        await adapter.addCandidate(chainlinkAdapter.address, 5);
        await adapter.addCandidate(makerMedianAdapter.address, 5);
        await adapter.setPrimary(chainlinkAdapter.address);

        await simChainlink.setPrice(toCL(7000));
        await sleep(6000);

        try {
            await adapter.updatePrice();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("timestamp out of range"))
        }

        try {
            var { newPrice, timestamp } = await adapter.price.call();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("no value"))
        }

        await simChainlink.setPrice(toCL(7000));
        await adapter.updatePrice();

        await simChainlink.setPrice(toCL(7005));
        await simMakerMedian.setPrice(toWad(6000));

        try {
            await adapter.updatePrice();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("price gap reached"))
        }
        var { newPrice, timestamp } = await adapter.price.call();
        assert.equal(newPrice, toWad(7000));

        await sleep(6000);
        await simChainlink.setPrice(toCL(7001));
        await adapter.updatePrice();
        var { newPrice, timestamp } = await adapter.price.call();
        assert.equal(newPrice, toWad(7001));

    });

    return;

    it("ValidatedAdapterV2 exceptions", async () => {
        let A = await TestPriceFeeder.new();
        let B = await TestPriceFeeder.new();
        let C = await TestPriceFeeder.new();
        let D = await TestPriceFeeder.new();

        let AA = await ChainlinkAdapter.new(A.address);
        let BB = await ChainlinkAdapter.new(B.address);
        let CC = await ChainlinkAdapter.new(C.address);
        let DD = await ChainlinkAdapter.new(D.address);

        let adapter = await ValidatedAdapterV2.new(3);

        await adapter.addCandidate(AA.address, 3600);
        await adapter.addCandidate(BB.address, 3600);
        await adapter.addCandidate(CC.address, 3600);

        try {
            await adapter.addCandidate(AA.address, 3600);
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("duplicated"));
        }

        try {
            await adapter.addCandidate(DD.address, 3600);
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("max limit reached"));
        }

        const candidates = await adapter.allCandidates();
        assert.equal(candidates.length, 3);
        assert.equal(candidates[0], AA.address);
        assert.equal(candidates[1], BB.address);
        assert.equal(candidates[2], CC.address);

        try {
            await adapter.removeCandidate(DD.address);
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("not exist"));
        }

        await adapter.setPrimary(AA.address);
        try {
            await adapter.removeCandidate(AA.address);
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("cannot remove primary"));
        }

        await adapter.setPrimary(BB.address);
        await adapter.removeCandidate(AA.address);
    });

    it("ValidatedAdapterV2", async () => {
        let simChainlink = await TestPriceFeeder.new();
        let simMakerMedian = await TestPriceFeeder.new();

        let chainlinkAdapter = await ChainlinkAdapter.new(simChainlink.address);
        let makerMedianAdapter = await MakerMedianAdapter.new(simMakerMedian.address);

        let adapter = await ValidatedAdapterV2.new(3);
        assert.ok(!(await adapter.isCandidate(chainlinkAdapter.address)));
        assert.ok(!(await adapter.isCandidate(makerMedianAdapter.address)));

        await adapter.addCandidate(chainlinkAdapter.address, 3600);
        assert.ok((await adapter.isCandidate(chainlinkAdapter.address)));
        assert.ok(!(await adapter.isCandidate(makerMedianAdapter.address)));

        await adapter.addCandidate(makerMedianAdapter.address, 3600);
        try {
            await adapter.addCandidate(makerMedianAdapter.address, 3600);
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("duplicated"));
        }
        assert.ok(await adapter.isCandidate(chainlinkAdapter.address));
        assert.ok(await adapter.isCandidate(makerMedianAdapter.address));

        // cl: 0 - 0
        // mm: 0 - 0
        try {
            await adapter.updatePrice();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("primary required"));
        }
        try {
            await adapter.price.call();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("primary required"));
        }

        await adapter.setPrimary(chainlinkAdapter.address);
        assert.equal(await adapter.primary(), chainlinkAdapter.address);

        try {
            var { newPrice, timestamp } = await adapter.price.call();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("no value"));
        }

        // cl: 7000 - now
        // mm: 0 - 0'
        await simChainlink.setPrice(toCL(7000));
        await adapter.updatePrice();
        var { newPrice, timestamp } = await adapter.price.call();
        assert.equal(newPrice, toWad(7000));

        // cl: 7000 - now
        // mm: 0 - now'
        await simChainlink.setPrice(toCL(7001));
        await simMakerMedian.setPrice(toWad(1));
        try {
            await adapter.updatePrice();
            var { newPrice, timestamp } = await adapter.price.call();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("price gap reached"));
        }

        // cl: 7000 - now
        // mm: 0 - now'
        await simChainlink.setPrice(toCL(1000));
        await simMakerMedian.setPrice(toWad(951));
        await adapter.updatePrice();
        var { newPrice, timestamp } = await adapter.price.call();
        assert.equal(newPrice, toWad(1000));

        await simChainlink.setPrice(toCL(950));
        await simMakerMedian.setPrice(toWad(1));
        try {
            await adapter.updatePrice();
            var { newPrice, timestamp } = await adapter.price.call();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("price gap reached"));
        }

        await adapter.setMaxPriceGapPercentage(toWad(0.051));
        await simChainlink.setPrice(toCL(1000));
        await simMakerMedian.setPrice(toWad(950));
        await adapter.updatePrice();
        var { newPrice, timestamp } = await adapter.price.call();
        assert.equal(newPrice, toWad(1000));
        await adapter.setMaxPriceGapPercentage(toWad(0.05));


        await simChainlink.setPrice(toCL(1000));
        var ts = await simChainlink.latestTimestamp();
        await simMakerMedian.setPriceAndTimestamp(toWad(950), ts - 3601);
        var { newPrice, timestamp } = await adapter.price.call();
        assert.equal(newPrice, toWad(1000));


        // cl: 7000 - now
        // mm: 0 - now'
        await simChainlink.setPrice(toCL(7000));
        await simMakerMedian.setPrice(toWad(1));
        try {
            await adapter.updatePrice();
            var { newPrice, timestamp } = await adapter.price.call();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("price gap reached"));
        }
        await adapter.removeCandidate(makerMedianAdapter.address);
        await adapter.updatePrice();
        var { newPrice, timestamp } = await adapter.price.call();
        assert.equal(newPrice, toWad(7000));
    });

    return;

    it("ValidatedAdapter", async () => {
        let simChainlink = await TestPriceFeeder.new();
        let simMakerMedian = await TestPriceFeeder.new();

        let chainlinkAdapter = await ChainlinkAdapter.new(simChainlink.address);
        let makerMedianAdapter = await MakerMedianAdapter.new(simMakerMedian.address);
        let adapter = await ValidatedAdapter.new(chainlinkAdapter.address, 10);

        assert.ok(await adapter.isCandidate(chainlinkAdapter.address));
        assert.ok(!(await adapter.isCandidate(makerMedianAdapter.address)));

        await adapter.addCandidate(makerMedianAdapter.address);

        try {
            await adapter.addCandidate(makerMedianAdapter.address);
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("already added"));
        }

        assert.ok(await adapter.isCandidate(chainlinkAdapter.address));
        assert.ok(await adapter.isCandidate(makerMedianAdapter.address));

        // cl: 0 - 0
        // mm: 0 - 0
        try {
            var { newPrice, timestamp } = await adapter.price.call();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("invalid target price"));
        }

        // cl: 7000 - now
        // mm: 0 - 0'
        await simChainlink.setPrice(toCL(7000));
        var { newPrice, timestamp } = await adapter.price.call();
        assert.equal(newPrice, toWad(7000));

        // cl: 7000 - now
        // mm: 0 - now'
        await simChainlink.setPrice(toCL(7000));
        await simMakerMedian.setPrice(toWad(1));
        try {
            var { newPrice, timestamp } = await adapter.price.call();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("intolerant price"));
        }

        // cl: 7000 - now
        // mm: 0 - now'
        await simChainlink.setPrice(toCL(1000));
        await simMakerMedian.setPrice(toWad(951));
        var { newPrice, timestamp } = await adapter.price.call();
        assert.equal(newPrice, toWad(1000));

        await simChainlink.setPrice(toCL(950));
        await simMakerMedian.setPrice(toWad(1));
        try {
            var { newPrice, timestamp } = await adapter.price.call();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("intolerant price"));
        }

        await adapter.setPriceBiasTolerance(toWad(0.051));
        await simChainlink.setPrice(toCL(1000));
        await simMakerMedian.setPrice(toWad(950));
        var { newPrice, timestamp } = await adapter.price.call();
        assert.equal(newPrice, toWad(1000));
        await adapter.setPriceBiasTolerance(toWad(0.05));


        await simChainlink.setPrice(toCL(1000));
        var ts = await simChainlink.latestTimestamp();
        await simMakerMedian.setPriceAndTimestamp(toWad(950), ts - 3601);
        var { newPrice, timestamp } = await adapter.price.call();
        assert.equal(newPrice, toWad(1000));


        // cl: 7000 - now
        // mm: 0 - now'
        await simChainlink.setPrice(toCL(7000));
        await simMakerMedian.setPrice(toWad(1));
        try {
            var { newPrice, timestamp } = await adapter.price.call();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("intolerant price"));
        }
        await adapter.removeCandidate(makerMedianAdapter.address);
        var { newPrice, timestamp } = await adapter.price.call();
        assert.equal(newPrice, toWad(7000));
    });

    it("DoubleCheckAdapter", async () => {
        let fakeChainlink = await TestPriceFeeder.new();
        let fakeMaker = await TestPriceFeeder.new();
        let adapter = await DoubleCheckAdapter.new(fakeChainlink.address, fakeMaker.address);

        try {
            await adapter.price.call();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("invalid target price"));
        }

        let data;
        await fakeChainlink.setPrice(toCL(100));
        await fakeMaker.setPrice(toWad(100));
        data = await adapter.price.call();
        assert.equal(data.newPrice, toWad(100));

        // default tolerance = 5%
        await fakeChainlink.setPrice(toCL(100));
        await fakeMaker.setPrice(toWad(104.9));
        data = await adapter.price.call();
        assert.equal(data.newPrice, toWad(100));

        await fakeChainlink.setPrice(toCL(100));
        await fakeMaker.setPrice(toWad(95.1));
        data = await adapter.price.call();
        assert.equal(data.newPrice, toWad(100));

        await fakeChainlink.setPrice(toCL(100));
        await fakeMaker.setPrice(toWad(105));
        try {
            data = await adapter.price.call();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("intolerant price"));
        }

        await fakeChainlink.setPrice(toCL(100));
        await fakeMaker.setPrice(toWad(95));
        try {
            data = await adapter.price.call();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("intolerant price"));
        }

        await fakeChainlink.setPrice(toCL(105.26));
        await fakeMaker.setPrice(toWad(100));
        data = await adapter.price.call();
        assert.equal(data.newPrice, toWad(105.26));

        await fakeChainlink.setPrice(toCL(105.27));
        await fakeMaker.setPrice(toWad(100));
        try {
            data = await adapter.price.call();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("intolerant price"));
        }

        await fakeChainlink.setPrice(toCL(95.24));
        await fakeMaker.setPrice(toWad(100));
        data = await adapter.price.call();
        assert.equal(data.newPrice, toWad(95.24));

        await fakeChainlink.setPrice(toCL(95.23));
        await fakeMaker.setPrice(toWad(100));
        try {
            data = await adapter.price.call();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("intolerant price"));
        }
    });
});