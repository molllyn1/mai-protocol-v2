const assert = require('assert');
const BigNumber = require('bignumber.js');
const { toWei, fromWei, toWad, fromWad, infinity, Side } = require('./constants');
const { getOrderSignature, buildOrder, getOrderHash, getEIP712MessageHash } = require('./order');
const { fromRpcSig } = require('ethereumjs-util');
const { hashPersonalMessage, ecsign, toBuffer, privateToAddress } = require('ethereumjs-util');

const TestPriceFeeder = artifacts.require('test/TestPriceFeeder.sol');
const ChainlinkAdapter = artifacts.require('oracle/ChainlinkAdapter.sol');
const MakerMedianizerAdapter = artifacts.require('oracle/MakerMedianizerAdapter.sol');
const ValidatedAdapter = artifacts.require('oracle/ValidatedAdapter.sol');

const toCL = (...xs) => {
    let sum = new BigNumber(0);
    for (var x of xs) {
        sum = sum.plus(new BigNumber(x).times("100000000"));
    }
    return sum.toFixed();
};


contract('oracle', accounts => {

    const admin = accounts[0];
    const u1 = accounts[1];

    const sleep = (ms) => {
        return new Promise((resolve) => {
          setTimeout(resolve, ms);
        });
    }

    const now = () => {
        return Math.round(new Date().getTime() / 1000);
    }

    it("test feeder", async () => {
        let simMakerMedian = await TestPriceFeeder.new();
        let makerMedianAdapter = await MakerMedianizerAdapter.new(simMakerMedian.address, 18, 10);

        try {
            await makerMedianAdapter.price();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("not whitelisted"))
        }

        simMakerMedian.setPrice(toWad(6000));
        makerMedianAdapter.addWhitelisted(admin);
        var {newPrice, newTimestamp} = await makerMedianAdapter.price();
        assert.equal(newPrice, toWad(6000));

        try {
            await makerMedianAdapter.price({from: u1});
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("not whitelisted"))
        }

        try {
            await makerMedianAdapter.addWhitelisted(u1, {from: u1});
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("not the owner"))
        }
        console.log(await makerMedianAdapter.allWhitelisted())
    })

    it("ValidatedAdapter estimate gas", async () => {
        let simChainlink = await TestPriceFeeder.new();
        let simMakerMedian = await TestPriceFeeder.new();
        let chainlinkAdapter = await ChainlinkAdapter.new(simChainlink.address, 3600*6, false);
        let makerMedianAdapter = await MakerMedianizerAdapter.new(simMakerMedian.address, 18, 10);
        let adapter = await ValidatedAdapter.new(3);
        await makerMedianAdapter.addWhitelisted(adapter.address);


        await adapter.addCandidate(chainlinkAdapter.address, 5);
        await adapter.addCandidate(makerMedianAdapter.address, 5);
        await adapter.setPrimary(chainlinkAdapter.address);

        await simChainlink.setPrice(toCL(7000));
        await simMakerMedian.setPrice(toWad(7000));

        var tx = await adapter.updatePrice();
        console.log("initial:", tx.receipt.gasUsed);

        await simChainlink.setPrice(toCL(7001));
        await simMakerMedian.setPrice(toWad(7001));
        tx = await adapter.updatePrice();
        console.log("daily:", tx.receipt.gasUsed);

        tx = await adapter.updatePrice();
        console.log("no update:", tx.receipt.gasUsed);

        // tx = await adapter.price();
        // console.log("read:", tx.receipt.gasUsed);
    });

    it("ValidatedAdapter timeouts", async () => {
        let simChainlink = await TestPriceFeeder.new();
        let simMakerMedian = await TestPriceFeeder.new();
        let chainlinkAdapter = await ChainlinkAdapter.new(simChainlink.address, 3600*6, false);
        let makerMedianAdapter = await MakerMedianizerAdapter.new(simMakerMedian.address, 18, 10);

        let adapter = await ValidatedAdapter.new(3);
        await makerMedianAdapter.addWhitelisted(adapter.address);

        await adapter.addCandidate(chainlinkAdapter.address, 5);
        await adapter.addCandidate(makerMedianAdapter.address, 5);
        await adapter.setPrimary(chainlinkAdapter.address);

        await simChainlink.setPrice(toCL(7000));
        await sleep(6000);

        try {
            await adapter.updatePrice();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("outdated price"), error)
        }

        try {
            var { newPrice, timestamp } = await adapter.price.call();
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("outdated price"), error)
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
        try {
            var { newPrice, timestamp } = await adapter.price.call();
        } catch (error) {
            assert.ok(error.message.includes("price gap reached"))
        }

        await sleep(6000);
        await simChainlink.setPrice(toCL(7001));
        await adapter.updatePrice();

        var { newPrice, newTimestamp } = await adapter.price.call();

        assert.equal(newPrice, toWad(7001));

    });

    it("ValidatedAdapter exceptions", async () => {
        let A = await TestPriceFeeder.new();
        let B = await TestPriceFeeder.new();
        let C = await TestPriceFeeder.new();
        let D = await TestPriceFeeder.new();

        let AA = await ChainlinkAdapter.new(A.address, 3600*6, false);
        let BB = await ChainlinkAdapter.new(B.address, 3600*6, false);
        let CC = await ChainlinkAdapter.new(C.address, 3600*6, false);
        let DD = await ChainlinkAdapter.new(D.address, 3600*6, false);
        let adapter = await ValidatedAdapter.new(3);

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

    it("ValidatedAdapter", async () => {
        let simChainlink = await TestPriceFeeder.new();
        let simMakerMedian = await TestPriceFeeder.new();

        let chainlinkAdapter = await ChainlinkAdapter.new(simChainlink.address, 3600*6, false);
        let makerMedianAdapter = await MakerMedianizerAdapter.new(simMakerMedian.address, 18, 10);

        let adapter = await ValidatedAdapter.new(3);
        await makerMedianAdapter.addWhitelisted(adapter.address);

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

        // try {
        //     var { newPrice, timestamp } = await adapter.price.call();
        //     throw null;
        // } catch (error) {
        //     assert.ok(error.message.includes("no value"));
        // }

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
});