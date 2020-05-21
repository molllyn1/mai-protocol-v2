const assert = require('assert');
const BigNumber = require('bignumber.js');
const TestSignedMath = artifacts.require('TestSignedMath');
const TestUnsignedMath = artifacts.require('TestUnsignedMath');
const { toWei, fromWei, toWad, fromWad, infinity, Side } = require('./constants');
const { assertApproximate } = require('./funcs');

contract('testMath', accounts => {

    let testSignedMath, testUnsignedMath;

    const deploy = async () => {
        testSignedMath = await TestSignedMath.new();
        testUnsignedMath = await TestUnsignedMath.new();
    };

    before(deploy);

    it("exceptions", async () => {
        try {
            await testSignedMath.mul(-1, "-57896044618658097711785492504343953926634992332820282019728792003956564819968");
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("wmultiplication overflow"), error)
        }

        try {
            await testSignedMath.div(-1, 0);
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("wdivision by zero"), error)
        }
        try {
            await testSignedMath.div(-1, 0);
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("wdivision by zero"), error)
        }
        try {
            await testSignedMath.div("-57896044618658097711785492504343953926634992332820282019728792003956564819968", -1);
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("wdivision overflow"), error)
        }
        try {
            const c = await testSignedMath.sub("-57896044618658097711785492504343953926634992332820282019728792003956564819968", 1);
            console.log(c.toString());
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("subtraction overflow"), error)
        }
        try {
            await testSignedMath.add("57896044618658097711785492504343953926634992332820282019728792003956564819967", 1);
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("addition overflow"), error)
        }
        try {
            await testSignedMath.toUint256("-1");
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("int overflow"), error)
        }
        try {
            await testSignedMath.wln("-1");
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("logE of negative number"), error)
        }

        try {
            await testSignedMath.ceil(-1, 1);
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("ceil need x >= "), error)
        }
        try {
            await testSignedMath.ceil(1, -1);
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("ceil need m > 0"), error)
        }
        /////
        await testUnsignedMath.WAD();
        try {
            await testUnsignedMath.add("115792089237316195423570985008687907853269984665640564039457584007913129639935", 1);
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("Unaddition overflow"), error)
        }

        await testUnsignedMath.div(0, 1);
        try {
            await testUnsignedMath.div(1, 0);
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("Undivision by zero"), error)
        }
        try {
            await testUnsignedMath.mod(1, 0);
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("mod by zero"), error)
        }
        try {
            await testUnsignedMath.ceil(1, 0);
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("ceil need m > 0"), error)
        }
    });

    it("frac1", async () => {
        let r;
        let s;
        let c = "300000000000000";
        r = await testUnsignedMath.wfrac("1111111111111111111", "500000000000000000", c);
        s = await testUnsignedMath.wmul("1111111111111111111", "500000000000000000");
        s = await testUnsignedMath.wdiv(s.toString(), c);
        // A*B -> A*B +(-) 1E-18
        // A*B/C -> [A*B +(-) 1E-18]/C +(-) 1E-18 -> A*B/C +(-) 1E-18/C +(-) 1E-18
        // diff -> -(1E-18/C + 1E-18) ~ (1E-18/C + 1E-18)
        const diff = await testUnsignedMath.wdiv(1, c);
        console.log("         R:", r.toString());
        console.log("         S:", s.toString());
        console.log("DIFF RANGE:", diff.toString());
        assert.ok(r.sub(s).abs() <= Number(diff.toString())) + 1;
    });

    it("frac2 neg", async () => {
        let r;
        let s;
        r = await testSignedMath.wfrac("-1111111111111111111", "500000000000000000", "300000000000000000");
        s = await testSignedMath.wmul("-1111111111111111111", "500000000000000000");
        s = await testSignedMath.wdiv(s.toString(), "300000000000000000");
        assert.ok(r.sub(s).abs() <= 1);
    });

    it("frac3 neg", async () => {
        let r;
        let s;
        r = await testSignedMath.wfrac("1111111111111111111", "500000000000000000", "-300000000000000000");
        s = await testSignedMath.wmul("-1111111111111111111", "500000000000000000");
        s = await testSignedMath.wdiv(s.toString(), "300000000000000000");
        assert.ok(r.sub(s).abs() <= 1);
    });

    it("roundHalfUp", async () => {
        assert.equal((await testSignedMath.roundHalfUp(toWei(1.2), toWei(1))).toString(), toWei(1.7).toString());
        assert.equal((await testSignedMath.roundHalfUp(toWei(1.5), toWei(1))).toString(), toWei(2.0).toString());
        assert.equal((await testSignedMath.roundHalfUp(toWei(1.2344), toWei(0.001))).toString(), toWei(1.2349).toString());
        assert.equal((await testSignedMath.roundHalfUp(toWei(1.2345), toWei(0.001))).toString(), toWei(1.2350).toString());

        assert.equal((await testSignedMath.roundHalfUp(toWei(-1.2), toWei(1))).toString(), toWei(-1.7).toString());
        assert.equal((await testSignedMath.roundHalfUp(toWei(-1.5), toWei(1))).toString(), toWei(-2.0).toString());
        assert.equal((await testSignedMath.roundHalfUp(toWei(-1.2344), toWei(0.001))).toString(), toWei(-1.2349).toString());
        assert.equal((await testSignedMath.roundHalfUp(toWei(-1.2345), toWei(0.001))).toString(), toWei(-1.2350).toString());
    });

    it("unsigned wmul - trivial", async () => {
        // (2**128 - 1) * 1 = (2**128 - 1)
        assert.equal((await testUnsignedMath.wmul('340282366920938463463374607431768211455', toWad(1))).toString(), '340282366920938463463374607431768211455');
        assert.equal((await testUnsignedMath.wmul(toWad(0), toWad(0))).toString(), '0');
        assert.equal((await testUnsignedMath.wmul(toWad(0), toWad(1))).toString(), '0');
        assert.equal((await testUnsignedMath.wmul(toWad(1), toWad(0))).toString(), '0');
        assert.equal((await testUnsignedMath.wmul(toWad(1), toWad(1))).toString(), toWad(1).toString());
        assert.equal((await testUnsignedMath.wmul(toWad(1), toWad(0.2))).toString(), toWad(0.2).toString());
        assert.equal((await testUnsignedMath.wmul(toWad(2), toWad(0.2))).toString(), toWad(0.4).toString());
    });

    it("unsigned wmul - overflow", async () => {
        try {
            // 2**128 * 2**128
            await testUnsignedMath.wmul('340282366920938463463374607431768211456', '340282366920938463463374607431768211456');
            assert.fail('should overflow');
        } catch {
        }
    });

    it("unsigned wmul - rounding", async () => {
        assert.equal((await testUnsignedMath.wmul('1', '499999999999999999')).toString(), '0');
        assert.equal((await testUnsignedMath.wmul('1', '500000000000000000')).toString(), '1');
        assert.equal((await testUnsignedMath.wmul('950000000000005647', '1000000000')).toString(), '950000000');
        assert.equal((await testUnsignedMath.wmul('1000000000', '950000000000005647')).toString(), '950000000');
    });

    it("unsigned wdiv - trivial", async () => {
        assert.equal((await testUnsignedMath.wdiv('0', toWad(1))).toString(), '0');
        assert.equal((await testUnsignedMath.wdiv(toWad(1), toWad(1))).toString(), toWad(1).toString());
        assert.equal((await testUnsignedMath.wdiv(toWad(1), toWad(2))).toString(), toWad(0.5).toString());
        assert.equal((await testUnsignedMath.wdiv(toWad(2), toWad(2))).toString(), toWad(1).toString());
    });

    it("unsigned wdiv - div by 0", async () => {
        try {
            await testUnsignedMath.wdiv(toWad(1), toWad(0));
            assert.fail('div by 0');
        } catch {
        }
    });

    it("unsigned wdiv - rounding", async () => {
        assert.equal((await testUnsignedMath.wdiv('499999999999999999', '1000000000000000000000000000000000000')).toString(), '0');
        assert.equal((await testUnsignedMath.wdiv('500000000000000000', '1000000000000000000000000000000000000')).toString(), '1');
        assert.equal((await testUnsignedMath.wdiv(toWad(1), toWad(3))).toString(), '333333333333333333');
        assert.equal((await testUnsignedMath.wdiv(toWad(2), toWad(3))).toString(), '666666666666666667');
        assert.equal((await testUnsignedMath.wdiv(toWad(1), 3)).toString(), '333333333333333333333333333333333333');
        assert.equal((await testUnsignedMath.wdiv(toWad(2), 3)).toString(), '666666666666666666666666666666666667');

    });

    it("signed wmul - trivial", async () => {
        // (2**128 - 1) * 1
        assert.equal((await testSignedMath.wmul('340282366920938463463374607431768211455', toWad(1))).toString(), '340282366920938463463374607431768211455');
        assert.equal((await testSignedMath.wmul(toWad(0), toWad(0))).toString(), '0');
        assert.equal((await testSignedMath.wmul(toWad(0), toWad(1))).toString(), '0');
        assert.equal((await testSignedMath.wmul(toWad(1), toWad(0))).toString(), '0');
        assert.equal((await testSignedMath.wmul(toWad(1), toWad(1))).toString(), toWad(1).toString());
        assert.equal((await testSignedMath.wmul(toWad(1), toWad(0.2))).toString(), toWad(0.2).toString());
        assert.equal((await testSignedMath.wmul(toWad(2), toWad(0.2))).toString(), toWad(0.4).toString());

        // (-2**128) * 1
        assert.equal((await testSignedMath.wmul('-340282366920938463463374607431768211456', toWad(1))).toString(), '-340282366920938463463374607431768211456');
        assert.equal((await testSignedMath.wmul(toWad(0), toWad(-1))).toString(), '0');
        assert.equal((await testSignedMath.wmul(toWad(-1), toWad(0))).toString(), '0');
        assert.equal((await testSignedMath.wmul(toWad(-1), toWad(1))).toString(), toWad(-1).toString());
        assert.equal((await testSignedMath.wmul(toWad(1), toWad(-1))).toString(), toWad(-1).toString());
        assert.equal((await testSignedMath.wmul(toWad(-1), toWad(-1))).toString(), toWad(1).toString());
        assert.equal((await testSignedMath.wmul(toWad(1), toWad(-0.2))).toString(), toWad(-0.2).toString());
        assert.equal((await testSignedMath.wmul(toWad(2), toWad(-0.2))).toString(), toWad(-0.4).toString());
        assert.equal((await testSignedMath.wmul(toWad(-1), toWad(0.2))).toString(), toWad(-0.2).toString());
        assert.equal((await testSignedMath.wmul(toWad(-2), toWad(0.2))).toString(), toWad(-0.4).toString());
        assert.equal((await testSignedMath.wmul(toWad(-1), toWad(-0.2))).toString(), toWad(0.2).toString());
        assert.equal((await testSignedMath.wmul(toWad(-2), toWad(-0.2))).toString(), toWad(0.4).toString());
    });

    it("signed wmul - overflow", async () => {
        try {
            // 2**128 * 2**128
            await testSignedMath.wmul('340282366920938463463374607431768211456', '340282366920938463463374607431768211456');
            assert.fail('should overflow');
        } catch {
        }

        try {
            // -2**128 * -2**128
            await testSignedMath.wmul('-340282366920938463463374607431768211456', '-340282366920938463463374607431768211456');
            assert.fail('should overflow');
        } catch {
        }
    });

    it("signed wmul - rounding", async () => {
        assert.equal((await testSignedMath.wmul('1', '499999999999999999')).toString(), '0');
        assert.equal((await testSignedMath.wmul('1', '500000000000000000')).toString(), '1');
        assert.equal((await testSignedMath.wmul('950000000000005647', '1000000000')).toString(), '950000000');
        assert.equal((await testSignedMath.wmul('1000000000', '950000000000005647')).toString(), '950000000');

        assert.equal((await testSignedMath.wmul('-1', '499999999999999999')).toString(), '0');
        assert.equal((await testSignedMath.wmul('-1', '500000000000000000')).toString(), '-1');
        assert.equal((await testSignedMath.wmul('-950000000000005647', '1000000000')).toString(), '-950000000');
        assert.equal((await testSignedMath.wmul('-1000000000', '950000000000005647')).toString(), '-950000000');

        assert.equal((await testSignedMath.wmul('1', '-499999999999999999')).toString(), '0');
        assert.equal((await testSignedMath.wmul('1', '-500000000000000000')).toString(), '-1');
        assert.equal((await testSignedMath.wmul('950000000000005647', '-1000000000')).toString(), '-950000000');
        assert.equal((await testSignedMath.wmul('1000000000', '-950000000000005647')).toString(), '-950000000');

        assert.equal((await testSignedMath.wmul('-1', '-499999999999999999')).toString(), '0');
        assert.equal((await testSignedMath.wmul('-1', '-500000000000000000')).toString(), '1');
        assert.equal((await testSignedMath.wmul('-950000000000005647', '-1000000000')).toString(), '950000000');
        assert.equal((await testSignedMath.wmul('-1000000000', '-950000000000005647')).toString(), '950000000');
    });

    it("signed wdiv - trivial", async () => {
        assert.equal((await testSignedMath.wdiv('0', toWad(1))).toString(), '0');
        assert.equal((await testSignedMath.wdiv(toWad(1), toWad(1))).toString(), toWad(1).toString());
        assert.equal((await testSignedMath.wdiv(toWad(1), toWad(2))).toString(), toWad(0.5).toString());
        assert.equal((await testSignedMath.wdiv(toWad(2), toWad(2))).toString(), toWad(1).toString());

        assert.equal((await testSignedMath.wdiv(toWad(-1), toWad(1))).toString(), toWad(-1).toString());
        assert.equal((await testSignedMath.wdiv(toWad(-1), toWad(2))).toString(), toWad(-0.5).toString());
        assert.equal((await testSignedMath.wdiv(toWad(-2), toWad(2))).toString(), toWad(-1).toString());

        assert.equal((await testSignedMath.wdiv('0', toWad(-1))).toString(), '0');
        assert.equal((await testSignedMath.wdiv(toWad(1), toWad(-1))).toString(), toWad(-1).toString());
        assert.equal((await testSignedMath.wdiv(toWad(1), toWad(-2))).toString(), toWad(-0.5).toString());
        assert.equal((await testSignedMath.wdiv(toWad(2), toWad(-2))).toString(), toWad(-1).toString());

        assert.equal((await testSignedMath.wdiv(toWad(-1), toWad(-1))).toString(), toWad(1).toString());
        assert.equal((await testSignedMath.wdiv(toWad(-1), toWad(-2))).toString(), toWad(0.5).toString());
        assert.equal((await testSignedMath.wdiv(toWad(-2), toWad(-2))).toString(), toWad(1).toString());
    });

    it("signed wdiv - div by 0", async () => {
        try {
            await testSignedMath.wdiv(toWad(1), toWad(0));
            assert.fail('div by 0');
        } catch {
        }
    });

    it("signed wdiv - rounding", async () => {
        assert.equal((await testSignedMath.wdiv('499999999999999999', '1000000000000000000000000000000000000')).toString(), '0');
        assert.equal((await testSignedMath.wdiv('500000000000000000', '1000000000000000000000000000000000000')).toString(), '1');
        assert.equal((await testSignedMath.wdiv(toWad(1), toWad(3))).toString(), '333333333333333333');
        assert.equal((await testSignedMath.wdiv(toWad(2), toWad(3))).toString(), '666666666666666667');
        assert.equal((await testSignedMath.wdiv(toWad(1), 3)).toString(), '333333333333333333333333333333333333');
        assert.equal((await testSignedMath.wdiv(toWad(2), 3)).toString(), '666666666666666666666666666666666667');

        assert.equal((await testSignedMath.wdiv('-499999999999999999', '1000000000000000000000000000000000000')).toString(), '0');
        assert.equal((await testSignedMath.wdiv('-500000000000000000', '1000000000000000000000000000000000000')).toString(), '-1');
        assert.equal((await testSignedMath.wdiv(toWad(-1), toWad(3))).toString(), '-333333333333333333');
        assert.equal((await testSignedMath.wdiv(toWad(-2), toWad(3))).toString(), '-666666666666666667');
        assert.equal((await testSignedMath.wdiv(toWad(-1), 3)).toString(), '-333333333333333333333333333333333333');
        assert.equal((await testSignedMath.wdiv(toWad(-2), 3)).toString(), '-666666666666666666666666666666666667');

        assert.equal((await testSignedMath.wdiv('499999999999999999', '-1000000000000000000000000000000000000')).toString(), '0');
        assert.equal((await testSignedMath.wdiv('500000000000000000', '-1000000000000000000000000000000000000')).toString(), '-1');
        assert.equal((await testSignedMath.wdiv(toWad(1), toWad(-3))).toString(), '-333333333333333333');
        assert.equal((await testSignedMath.wdiv(toWad(2), toWad(-3))).toString(), '-666666666666666667');
        assert.equal((await testSignedMath.wdiv(toWad(1), -3)).toString(), '-333333333333333333333333333333333333');
        assert.equal((await testSignedMath.wdiv(toWad(2), -3)).toString(), '-666666666666666666666666666666666667');

        assert.equal((await testSignedMath.wdiv('-499999999999999999', '-1000000000000000000000000000000000000')).toString(), '0');
        assert.equal((await testSignedMath.wdiv('-500000000000000000', '-1000000000000000000000000000000000000')).toString(), '1');
        assert.equal((await testSignedMath.wdiv(toWad(-1), toWad(-3))).toString(), '333333333333333333');
        assert.equal((await testSignedMath.wdiv(toWad(-2), toWad(-3))).toString(), '666666666666666667');
        assert.equal((await testSignedMath.wdiv(toWad(-1), -3)).toString(), '333333333333333333333333333333333333');
        assert.equal((await testSignedMath.wdiv(toWad(-2), -3)).toString(), '666666666666666666666666666666666667');
    });

    it("power", async () => {
        let i;

        // 0.987... ^ 0 = 1
        assertApproximate(assert, fromWad(await testSignedMath.wpowi('987654321012345678', 0)), '1.000000000000000000', '1e-16');

        // 0.987... ^ 1 = 0.9
        assertApproximate(assert, fromWad(await testSignedMath.wpowi('987654321012345678', 1)), '0.987654321012345678', '1e-16');

        // 0.987... ^ 2 = 0.9
        assertApproximate(assert, fromWad(await testSignedMath.wpowi('987654321012345678', 2)), '0.975461057814357565', '1e-16');

        // 0.987... ^ 3 = 0.9
        assertApproximate(assert, fromWad(await testSignedMath.wpowi('987654321012345678', 3)), '0.963418328729623793', '1e-16');

        // 0.987... ^ 30 = 0.6
        assertApproximate(assert, fromWad(await testSignedMath.wpowi('987654321012345678', 30)), '0.688888672631861173', '1e-16');

        // 0.987... ^ 31 = 0.6
        assertApproximate(assert, fromWad(await testSignedMath.wpowi('987654321012345678', 31)), '0.680383874221316927', '1e-16');

        // 0.987... ^ 300 = 0.02
        assertApproximate(assert, fromWad(await testSignedMath.wpowi('987654321012345678', 300)), '0.024070795168472815', '1e-14');

        // 0.987... ^ 301 = 0.02
        assertApproximate(assert, fromWad(await testSignedMath.wpowi('987654321012345678', 301)), '0.023773624858345269', '1e-14');

        // 0.9999999 ^ 100000 = 0.99
        assertApproximate(assert, fromWad(await testSignedMath.wpowi('999999900000000000', 100000)), '0.990049833254143103', '1e-14');

        // 0.9999999 ^ 100001 = 0.99
        assertApproximate(assert, fromWad(await testSignedMath.wpowi('999999900000000000', 100001)), '0.990049734249159778', '1e-14');
    });

    it("log", async () => {
        let i, err;

        // Ln(1.9) = 0.68
        assertApproximate(assert, fromWad(await testSignedMath.wln('1975308642024691356')), '0.680724660586388155', '1e-18');

        // Ln(0.9) = -0.01
        assertApproximate(assert, fromWad(await testSignedMath.wln('987654321012345678')), '-0.012422519973557154', '1e-18');

        // Ln(1) = 0
        i = await testSignedMath.wln('1000000000000000000');
        assert.equal(i.toString(), '0');

        // Ln(1 + 1e-18) = 1e-18
        assertApproximate(assert, fromWad(await testSignedMath.wln('1000000000000000001')), '0.000000000000000001', '1e-18');

        // Ln(0.1) = -2.3
        assertApproximate(assert, fromWad(await testSignedMath.wln('100000000000000000')), '-2.302585092994045684', '1e-18');

        // Ln(0.5) = -0.6
        assertApproximate(assert, fromWad(await testSignedMath.wln('500000000000000000')), '-0.693147180559945309', '1e-18');

        // Ln(3) = 1.0
        assertApproximate(assert, fromWad(await testSignedMath.wln('3000000000000000000')), '1.098612288668109691', '1e-18');

        // Ln(10) = 2.3
        assertApproximate(assert, fromWad(await testSignedMath.wln('10000000000000000000')), '2.302585092994045684', '1e-18');

        // Ln(1.2345) = 0.2
        assertApproximate(assert, fromWad(await testSignedMath.wln('1234500000000000000')), '0.210666029803097142', '1e-18');

        // Ln(e) = 1
        assertApproximate(assert, fromWad(await testSignedMath.wln('2718281828459045235')), '1', '1e-18');

        // Ln(e - 1e-18) = 0.9
        assertApproximate(assert, fromWad(await testSignedMath.wln('2718281828459045234')), '0.999999999999999999', '1e-18');

        // Ln(1e22) = 50.6
        assertApproximate(assert, fromWad(await testSignedMath.wln('10000000000000000000000000000000000000000')), '50.656872045869005048', '1e-18');

        // Ln(1e22 + 1) = err
        try {
            await testSignedMath.wln('10000000000000000000000000000000000000001');
            throw null;
        } catch (error) {
            assert.ok(error.message.includes("only accepts"), error);
        }

        // Ln(1e-18) = -41
        assertApproximate(assert, fromWad(await testSignedMath.wln('1')), '-41.446531673892822312', '1e-18');

        // Ln(2e-18) = -40
        assertApproximate(assert, fromWad(await testSignedMath.wln('2')), '-40.753384493332877002', '1e-18');

        // Ln(11e-18) = -39
        assertApproximate(assert, fromWad(await testSignedMath.wln('11')), '-39.048636401094451768', '1e-18');
    });

    it("logBase", async () => {
        // Ln(0.9, 1.9)
        assertApproximate(assert, fromWad(await testSignedMath.logBase('900000000000000000', '1900000000000000000')), '-6.091977456307344157', '1e-16');

        // Ln(1.9, 0.9)
        assertApproximate(assert, fromWad(await testSignedMath.logBase('1900000000000000000', '900000000000000000')), '-0.164150311975407507', '1e-16');

        // Ln(1.9, 2.9)
        assertApproximate(assert, fromWad(await testSignedMath.logBase('1900000000000000000', '2900000000000000000')), '1.658805469484154444', '1e-16');
    });

    it("ceil", async () => {
        let i;

        i = await testSignedMath.ceil('0', '1000000000000000000');
        assert.equal(i.toString(), '0');

        i = await testSignedMath.ceil('1', '1000000000000000000');
        assert.equal(i.toString(), '1000000000000000000');

        i = await testSignedMath.ceil('999999999999999999', '1000000000000000000');
        assert.equal(i.toString(), '1000000000000000000');

        i = await testSignedMath.ceil('1000000000000000001', '1000000000000000000');
        assert.equal(i.toString(), '2000000000000000000');

        i = await testSignedMath.ceil('1000000000000000001', '1000000000000000000');
        assert.equal(i.toString(), '2000000000000000000');
    });

    it("max", async () => {
        let i
        i = await testUnsignedMath.max('1000000000000000001', '1000000000000000000');
        assert.equal(i.toString(), '1000000000000000001');

        i = await testUnsignedMath.max('0', '1000000000000000000');
        assert.equal(i.toString(), '1000000000000000000');
    });
});