import { expect } from "chai";
import { ethers, network } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { getAccounts } from "./fixtures";
import { signAttestation } from "./eip712";

const CAPS_DELAY = 60;
const PENDING_DELAY = 60;

export const DEMO_CAPS = {
  maxRateBps: 1500,
  perTxBoost: 3000,
  personDailyBoost: 5000,
  slotCapBps: 15000,
  pendingDelay: PENDING_DELAY,
  capsDelay: CAPS_DELAY,
};

describe("LocalBoost admin surface", () => {
  async function deploy() {
    const acc = await getAccounts();
    const token = await ethers.deployContract("MockIMKRW", [], acc.deployer);
    const registry = await ethers.deployContract("MerchantRegistry", [], acc.deployer);
    const boost = await ethers.deployContract(
      "LocalBoost",
      [await token.getAddress(), await registry.getAddress(), DEMO_CAPS],
      acc.deployer,
    );
    await boost.grantRole(await boost.CITY_ROLE(), acc.city.address);
    await boost.grantRole(await boost.BANK_ROLE(), acc.bank.address);
    await boost.grantRole(await boost.ORACLE_ROLE(), acc.oracle.address);
    await token.mint(acc.city.address, 5_000_000);
    return { acc, token, registry, boost };
  }

  async function currentEpoch(): Promise<bigint> {
    return BigInt(await time.latest()) / 3600n;
  }

  describe("constructor and roles", () => {
    it("stores initial caps and grants admin to deployer", async () => {
      const { acc, boost } = await deploy();
      const c = await boost.caps();
      expect(c.maxRateBps).to.equal(1500);
      expect(c.perTxBoost).to.equal(3000);
      expect(c.personDailyBoost).to.equal(5000);
      expect(c.slotCapBps).to.equal(15000);
      expect(c.pendingDelay).to.equal(PENDING_DELAY);
      expect(c.capsDelay).to.equal(CAPS_DELAY);
      expect(await boost.hasRole(await boost.DEFAULT_ADMIN_ROLE(), acc.deployer.address)).to.equal(true);
      expect(await boost.nextPendingId()).to.equal(1);
    });

    it("rejects zero token or registry address", async () => {
      const { acc, token, registry } = await deploy();
      const factory = await ethers.getContractFactory("LocalBoost", acc.deployer);
      await expect(factory.deploy(ethers.ZeroAddress, await registry.getAddress(), DEMO_CAPS))
        .to.be.revertedWithCustomError(factory, "ZeroAddress");
      await expect(factory.deploy(await token.getAddress(), ethers.ZeroAddress, DEMO_CAPS))
        .to.be.revertedWithCustomError(factory, "ZeroAddress");
    });
  });

  describe("depositBudget / setZoneHourlyCap", () => {
    it("moves tokens into the contract and increases zoneBudget", async () => {
      const { acc, token, boost } = await deploy();
      await token.connect(acc.city).approve(await boost.getAddress(), 1_000_000);
      await expect(boost.connect(acc.city).depositBudget(4, 1_000_000))
        .to.emit(boost, "BudgetDeposited")
        .withArgs(4, 1_000_000, acc.city.address);
      expect(await boost.zoneBudget(4)).to.equal(1_000_000);
      expect(await token.balanceOf(await boost.getAddress())).to.equal(1_000_000);
      expect(await token.balanceOf(acc.city.address)).to.equal(4_000_000);
    });

    it("reverts without CITY_ROLE", async () => {
      const { acc, boost } = await deploy();
      await expect(boost.connect(acc.stranger).depositBudget(4, 1))
        .to.be.revertedWithCustomError(boost, "AccessControlUnauthorizedAccount");
      await expect(boost.connect(acc.bank).setZoneHourlyCap(4, 1))
        .to.be.revertedWithCustomError(boost, "AccessControlUnauthorizedAccount");
    });

    it("setZoneHourlyCap stores the cap", async () => {
      const { acc, boost } = await deploy();
      await boost.connect(acc.city).setZoneHourlyCap(4, 300_000);
      expect(await boost.zoneHourlyCap(4)).to.equal(300_000);
    });
  });

  describe("setRates / currentRate", () => {
    it("sets rates for the current epoch and currentRate reads them", async () => {
      const { acc, boost } = await deploy();
      const epoch = await currentEpoch();
      await expect(boost.connect(acc.oracle).setRates(epoch, [1, 4], [500, 1000]))
        .to.emit(boost, "RatesSet")
        .withArgs(epoch, [1, 4], [500, 1000]);
      expect(await boost.currentRate(4)).to.equal(1000);
      expect(await boost.currentRate(1)).to.equal(500);
      expect(await boost.currentRate(2)).to.equal(0);
      expect(await boost.rates(4, epoch)).to.equal(1000);
    });

    it("accepts the next epoch and currentRate switches after the hour boundary", async () => {
      const { acc, boost } = await deploy();
      const epoch = await currentEpoch();
      await boost.connect(acc.oracle).setRates(epoch + 1n, [4], [700]);
      expect(await boost.currentRate(4)).to.equal(0);
      await time.increaseTo((epoch + 1n) * 3600n);
      expect(await boost.currentRate(4)).to.equal(700);
    });

    it("case09_setRatesOverMax: bps above maxRateBps reverts with RateTooHigh", async () => {
      const { acc, boost } = await deploy();
      const epoch = await currentEpoch();
      await expect(boost.connect(acc.oracle).setRates(epoch, [4], [1501]))
        .to.be.revertedWithCustomError(boost, "RateTooHigh")
        .withArgs(4, 1501, 1500);
      await boost.connect(acc.oracle).setRates(epoch, [4], [1500]);
      expect(await boost.currentRate(4)).to.equal(1500);
    });

    it("rejects past or far-future epochs with BadEpoch", async () => {
      const { acc, boost } = await deploy();
      const epoch = await currentEpoch();
      await expect(boost.connect(acc.oracle).setRates(epoch - 1n, [4], [100]))
        .to.be.revertedWithCustomError(boost, "BadEpoch");
      await expect(boost.connect(acc.oracle).setRates(epoch + 2n, [4], [100]))
        .to.be.revertedWithCustomError(boost, "BadEpoch");
    });

    it("rejects mismatched array lengths and non-oracle callers", async () => {
      const { acc, boost } = await deploy();
      const epoch = await currentEpoch();
      await expect(boost.connect(acc.oracle).setRates(epoch, [4, 5], [100]))
        .to.be.revertedWithCustomError(boost, "LengthMismatch");
      await expect(boost.connect(acc.city).setRates(epoch, [4], [100]))
        .to.be.revertedWithCustomError(boost, "AccessControlUnauthorizedAccount");
    });
  });

  describe("proposeCaps / applyCaps", () => {
    it("case15_capsTimelock: apply right after propose reverts, succeeds after capsDelay", async () => {
      const { acc, boost } = await deploy();
      const next = { ...DEMO_CAPS, perTxBoost: 4000, maxRateBps: 1200 };
      await expect(boost.connect(acc.city).proposeCaps(next)).to.emit(boost, "CapsProposed");
      const readyAt = await boost.capsReadyAt();
      expect(readyAt).to.equal(BigInt(await time.latest()) + BigInt(CAPS_DELAY));
      expect((await boost.pendingCaps()).perTxBoost).to.equal(4000);

      await expect(boost.connect(acc.stranger).applyCaps())
        .to.be.revertedWithCustomError(boost, "CapsNotReady");
      expect((await boost.caps()).perTxBoost).to.equal(3000);

      await time.increase(CAPS_DELAY);
      await expect(boost.connect(acc.stranger).applyCaps()).to.emit(boost, "CapsApplied");
      const c = await boost.caps();
      expect(c.perTxBoost).to.equal(4000);
      expect(c.maxRateBps).to.equal(1200);
      expect(await boost.capsReadyAt()).to.equal(0);
    });

    it("applyCaps without a proposal reverts with CapsNotProposed", async () => {
      const { boost } = await deploy();
      await expect(boost.applyCaps()).to.be.revertedWithCustomError(boost, "CapsNotProposed");
    });

    it("proposeCaps requires CITY_ROLE", async () => {
      const { acc, boost } = await deploy();
      await expect(boost.connect(acc.bank).proposeCaps(DEMO_CAPS))
        .to.be.revertedWithCustomError(boost, "AccessControlUnauthorizedAccount");
    });
  });

  describe("setAttester", () => {
    it("bank toggles attesters and emits AttesterSet", async () => {
      const { acc, boost } = await deploy();
      await expect(boost.connect(acc.bank).setAttester(acc.attester.address, true))
        .to.emit(boost, "AttesterSet")
        .withArgs(acc.attester.address, true);
      expect(await boost.attesters(acc.attester.address)).to.equal(true);
      await boost.connect(acc.bank).setAttester(acc.attester.address, false);
      expect(await boost.attesters(acc.attester.address)).to.equal(false);
      await expect(boost.connect(acc.city).setAttester(acc.attester.address, true))
        .to.be.revertedWithCustomError(boost, "AccessControlUnauthorizedAccount");
    });
  });

  describe("EIP-712 verification (harness)", () => {
    async function deployHarness() {
      const { acc, token, registry } = await deploy();
      const harness = await ethers.deployContract(
        "LocalBoostHarness",
        [await token.getAddress(), await registry.getAddress(), DEMO_CAPS],
        acc.deployer,
      );
      await harness.grantRole(await harness.BANK_ROLE(), acc.bank.address);
      await harness.connect(acc.bank).setAttester(acc.attester.address, true);
      const chainId = BigInt(network.config.chainId ?? 31337);
      return { acc, harness, chainId };
    }

    const baseAtt = (payer: string, merchant: string) => ({
      payer,
      merchant,
      amount: 10_000,
      tier: 0,
      nonce: 12345,
      deadline: 1_900_000_000,
    });

    it("recovers the attester from a valid signature", async () => {
      const { acc, harness, chainId } = await deployHarness();
      const att = baseAtt(acc.payers[0].address, acc.merchants[0].address);
      const sig = await signAttestation(acc.attester, await harness.getAddress(), chainId, att);
      expect(await harness.exposedVerify(att, sig)).to.equal(acc.attester.address);
    });

    it("rejects a signature from a non-attester key with BadSigner", async () => {
      const { acc, harness, chainId } = await deployHarness();
      const att = baseAtt(acc.payers[0].address, acc.merchants[0].address);
      const sig = await signAttestation(acc.stranger, await harness.getAddress(), chainId, att);
      await expect(harness.exposedVerify(att, sig))
        .to.be.revertedWithCustomError(harness, "BadSigner")
        .withArgs(acc.stranger.address);
    });

    it("rejects a signature bound to another contract address", async () => {
      const { acc, harness, chainId } = await deployHarness();
      const att = baseAtt(acc.payers[0].address, acc.merchants[0].address);
      const sig = await signAttestation(acc.attester, acc.stranger.address, chainId, att);
      await expect(harness.exposedVerify(att, sig)).to.be.revertedWithCustomError(harness, "BadSigner");
    });

    it("hashes the struct with the SPEC type string", async () => {
      const { acc, harness, chainId } = await deployHarness();
      const att = baseAtt(acc.payers[0].address, acc.merchants[0].address);
      const expected = ethers.TypedDataEncoder.hash(
        { name: "LocalBoost", version: "1", chainId, verifyingContract: await harness.getAddress() },
        {
          Attestation: [
            { name: "payer", type: "address" },
            { name: "merchant", type: "address" },
            { name: "amount", type: "uint256" },
            { name: "tier", type: "uint8" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        },
        att,
      );
      expect(await harness.exposedHash(att)).to.equal(expected);
    });
  });

});
