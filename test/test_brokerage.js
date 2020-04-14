const assert = require('assert');
const BigNumber = require('bignumber.js');
const { increaseEvmBlock, toBytes32 } = require('./funcs');
const { toWad, fromWad, infinity } = require('./constants');

const TestBrokerage = artifacts.require('test/TestBrokerage.sol');

contract('TestBrokerage', accounts => {
    let brokerage;

    const u1 = accounts[4];
    const u2 = accounts[5];
    const u3 = accounts[6];
    const u4 = accounts[7];

    const increaseBlockBy = async (n) => {
        for (let i = 0; i < n; i++) {
            await increaseEvmBlock();
        }
    };

    const deploy = async (cDecimals = 18) => {
        brokerage = await TestBrokerage.new();
    };

    beforeEach(deploy);

    it('new user => broker works immediately', async () => {
        await brokerage.assertBroker(u1, "0x0000000000000000000000000000000000000000");
        await brokerage.setBrokerPublic(u1, u2, 3); // u1 is a new user
        await brokerage.assertBroker(u1, u2);
    });


    it('modify broker => new broker works later', async () => {
        await brokerage.setBrokerPublic(u1, u2, 3); // u1 is a new user
        await brokerage.setBrokerPublic(u1, u3, 3);
        await brokerage.assertBroker(u1, u2);
        await brokerage.assertBroker(u1, u2);
        await brokerage.assertBroker(u1, u3);
    });

    it('when modifing => duplicated modify broker (the same broker) => delay timer is reset', async () => {
        await brokerage.setBrokerPublic(u1, u2, 3); // u1 is a new user
        await brokerage.setBrokerPublic(u1, u3, 3);
        await brokerage.assertBroker(u1, u2);
        await brokerage.setBrokerPublic(u1, u3, 3);
        await brokerage.assertBroker(u1, u2);
        await brokerage.assertBroker(u1, u2);
        await brokerage.assertBroker(u1, u3);
    });

    it('when modifing => duplicated modify broker (another broker) => delay timer is reset', async () => {
        await brokerage.setBrokerPublic(u1, u2, 3); // u1 is a new user
        await brokerage.setBrokerPublic(u1, u3, 3);
        await brokerage.assertBroker(u1, u2);
        await brokerage.setBrokerPublic(u1, u4, 3);
        await brokerage.assertBroker(u1, u2);
        await brokerage.assertBroker(u1, u2);
        await brokerage.assertBroker(u1, u4);
    });

    it('modify broker success => set the same broker => ignore', async () => {
        await brokerage.setBrokerPublic(u1, u2, 3); // u1 is a new user
        await brokerage.setBrokerPublic(u1, u3, 3);
        await brokerage.assertBroker(u1, u2);
        await brokerage.assertBroker(u1, u2);
        await brokerage.setBrokerPublic(u1, u3, 3); // u3 takes effect right here
        await brokerage.assertBroker(u1, u3);
        await brokerage.assertBroker(u1, u3);
        await brokerage.assertBroker(u1, u3);
        await brokerage.assertBroker(u1, u3);
        await brokerage.assertBroker(u1, u3);
    });

    it('modify broker success => set another broker => new broker works later', async () => {
        await brokerage.setBrokerPublic(u1, u2, 3); // u1 is a new user
        await brokerage.setBrokerPublic(u1, u3, 3);
        await brokerage.assertBroker(u1, u2);
        await brokerage.assertBroker(u1, u2);
        await brokerage.assertBroker(u1, u3);

        await brokerage.setBrokerPublic(u1, u4, 3);
        await brokerage.assertBroker(u1, u3);
        await brokerage.assertBroker(u1, u3);
        await brokerage.assertBroker(u1, u4);
    });
});
