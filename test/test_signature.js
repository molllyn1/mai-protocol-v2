const assert = require('assert');
const { toWei, fromWei, toWad, fromWad, infinity, Side } = require('./constants');
const { getOrderSignature, buildOrder, getOrderHash, getEIP712MessageHash } = require('./order');
const { fromRpcSig } = require('ethereumjs-util');
const { hashPersonalMessage, ecsign, toBuffer, privateToAddress } = require('ethereumjs-util');

const Testorder = artifacts.require('test/TestOrder.sol');
const TestSignature = artifacts.require('test/TestSignature.sol');

contract('signature', accounts => {

    let testOrder;
    let testSignature;

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
        address = bufferToHash(privateToAddress(privateKey));
        testOrder = await Testorder.new();
        testSignature = await TestSignature.new();
    }

    before(deploy);
    let privateKey = '0x388c684f0ba1ef5017716adb5d21a053ea8e90277d0868337519f97bede61418';
    let orderHash = '0xaf802826788065ba466dabccd8bda7cea419e59e0acad67662ad013534eb823b';
    let address;

    const SignatureType = {
        EthSign: '00',
        EIP712: '01',
        INVALID: '02'
    };

    const bufferToHash = buffer => '0x' + buffer.toString('hex');
    const formatSig = (sig, type) => ({
        config: `0x${sig.v.toString(16)}${type}` + '0'.repeat(60),
        r: sig.r,
        s: sig.s
    });

    it('should be an valid signature (EthSign)', async () => {
        const sha = hashPersonalMessage(toBuffer(orderHash));
        const sig = ecsign(sha, toBuffer(privateKey));

        const isValid = await testSignature.isValidSignature(formatSig(sig, SignatureType.EthSign), orderHash, address);
        assert(isValid);
    });

    it('should be an valid signature (EIP712)', async () => {
        const sha = toBuffer(orderHash);
        const sig = ecsign(sha, toBuffer(privateKey));

        const isValid = await testSignature.isValidSignature(formatSig(sig, SignatureType.EIP712), orderHash, address);
        assert(isValid);
    });

    it('should be an invalid signature (EthSign)', async () => {
        const sha = hashPersonalMessage(toBuffer(orderHash));
        const sig = ecsign(sha, toBuffer(privateKey));

        const wrongOrderHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const isValid = await testSignature.isValidSignature(formatSig(sig, SignatureType.EthSign), wrongOrderHash, address);
        assert(!isValid);
    });

    it('should be an invalid signature (EIP712)', async () => {
        const sha = toBuffer(orderHash);
        const sig = ecsign(sha, toBuffer(privateKey));

        const wrongOrderHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
        const isValid = await testSignature.isValidSignature(formatSig(sig, SignatureType.EIP712), wrongOrderHash, address);
        assert(!isValid);
    });

    it('should revert when using an invalid signature type', async () => {
        const sha = toBuffer(orderHash);
        const sig = ecsign(sha, toBuffer(privateKey));

        try {
            const isValid = await testSignature.isValidSignature(formatSig(sig, SignatureType.INVALID), orderHash, address);
        } catch (e) {
            assert.ok(e.message.match(/revert/));
            return;
        }

        assert(false, 'Should never get here');
    });

    it('hack 1', async () => {
        const sha = toBuffer(orderHash);
        const sig = ecsign(sha, toBuffer(privateKey));
        sig.v -= 0x1b;

        try {
            const isValid = await testSignature.isValidSignature(formatSig(sig, SignatureType.EthSign), orderHash, address);
        } catch (e) {
            assert.ok(e.message.includes('ECDSA'), e);
            return;
        }

        assert(false, 'Should never get here');
    });

    it('hack 2', async () => {
        const sha = toBuffer(orderHash);
        const sig = ecsign(sha, toBuffer(privateKey));
        sig.s[0] += 0x80;

        try {
            const isValid = await testSignature.isValidSignature(formatSig(sig, SignatureType.EthSign), orderHash, address);
        } catch (e) {
            assert.ok(e.message.includes('ECDSA'), e);
            return;
        }

        assert(false, 'Should never get here');
    });

    it("isValidSignature", async () => {
        orderHash = "0x605d1580332d740045eb5ec8334a0d15801859c5be0ea455facdb54e73ac21c1"
        trader = u1
        const signature = fromRpcSig(await web3.eth.sign(orderHash, trader));
        signature.config = `0x${signature.v.toString(16)}00` + '0'.repeat(60);
        const isValid = await testSignature.isValidSignature(signature, orderHash, trader)
        assert.ok(isValid);
    });

    it("isValidSignature 712", async () => {
        const trader = u1
        const perpetualAddress = "0x4DA467821456Ca82De42fa691ddA08B24A4f0572";
        const orderA = await buildOrder({
            trader: trader,
            amount: toWad(1),
            price: toWad(6000),
            version: 2,
            side: 'sell',
            type: 'market',
            expiredAt: 1589366656,
            salt: 666,
        }, perpetualAddress, admin);

        orderHash = getOrderHash(orderA)

        const signature = fromRpcSig(await web3.eth.sign(orderHash, trader));
        signature.config = `0x${signature.v.toString(16)}00` + '0'.repeat(60);
        const isValid = await testSignature.isValidSignature(signature, orderHash, trader)
        assert.ok(isValid);
    });

    it("isValidSignature invalid", async () => {
        const trader = u1
        const trader2 = u2
        const perpetualAddress = "0x4DA467821456Ca82De42fa691ddA08B24A4f0572";
        const orderA = await buildOrder({
            trader: trader,
            amount: toWad(1),
            price: toWad(6000),
            version: 2,
            side: 'sell',
            type: 'market',
            expiredAt: 1589366656,
            salt: 666,
        }, perpetualAddress, admin);
        orderHash = getOrderHash(orderA)

        let signature = fromRpcSig(await web3.eth.sign(orderHash, trader));
        signature.config = `0x${signature.v.toString(16)}00` + '0'.repeat(60);
        const isValid = await testSignature.isValidSignature(signature, orderHash, trader2)
        assert.ok(!isValid);
    });

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
        const ts = await testOrder.expiredAt.call({
            trader: orderA.trader,
            amount: orderA.amount,
            price: orderA.price,
            data: orderA.data,
            signature: orderA.signature,
        }, { from: admin })
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