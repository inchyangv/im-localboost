import { expect } from "chai";
import { ethers, network } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { DalgubeolPay, MerchantRegistry, MockIMKRW } from "../typechain-types";
import { getAccounts, personId, type Accounts } from "./fixtures";
import { signAttestation, type AttestationStruct } from "./eip712";
import { DEMO_CAPS } from "./dalgubeolpay.admin.test";

const PENDING_DELAY = DEMO_CAPS.pendingDelay;
const ZONES = [1, 2, 3, 4, 5];
const SLOT_BASELINE = 100_000;

interface Ctx {
  acc: Accounts;
  token: MockIMKRW;
  registry: MerchantRegistry;
  boost: DalgubeolPay;
  boostAddr: string;
  chainId: bigint;
  /** merchants[0]=zone 4 (Bukseongro), [1]=zone 2 (Deuranngil), [2]=zone 5 (Seomun) */
  merchants: HardhatEthersSigner[];
}

let ctx: Ctx;
let nonceCounter = 1;

/** Seeds the demo state: 5 persons, 3 merchants, budgets in zones 1,2,3,5, hourly caps, approvals. */
async function deployFixture(): Promise<Ctx> {
  const acc = await getAccounts();
  const token = (await ethers.deployContract("MockIMKRW", [], acc.deployer)) as unknown as MockIMKRW;
  const registry = (await ethers.deployContract("MerchantRegistry", [], acc.deployer)) as unknown as MerchantRegistry;
  const boost = (await ethers.deployContract(
    "DalgubeolPay",
    [await token.getAddress(), await registry.getAddress(), DEMO_CAPS],
    acc.deployer,
  )) as unknown as DalgubeolPay;
  const boostAddr = await boost.getAddress();

  await registry.grantRole(await registry.BANK_ROLE(), acc.bank.address);
  await boost.grantRole(await boost.CITY_ROLE(), acc.city.address);
  await boost.grantRole(await boost.BANK_ROLE(), acc.bank.address);
  await boost.grantRole(await boost.ORACLE_ROLE(), acc.oracle.address);
  await boost.connect(acc.bank).setAttester(acc.attester.address, true);

  const merchants = acc.merchants;
  await registry.connect(acc.bank).register(merchants[0].address, 4, 1, SLOT_BASELINE);
  await registry.connect(acc.bank).register(merchants[1].address, 2, 2, SLOT_BASELINE);
  await registry.connect(acc.bank).register(merchants[2].address, 5, 3, SLOT_BASELINE);

  for (let i = 0; i < 5; i++) {
    await registry.connect(acc.bank).setPerson(acc.payers[i].address, personId(i + 1));
    await token.mint(acc.payers[i].address, 1_000_000);
    await token.connect(acc.payers[i]).approve(boostAddr, ethers.MaxUint256);
  }
  for (const m of merchants) await token.mint(m.address, 500_000);
  await token.mint(acc.city.address, 5_000_000);
  await token.connect(acc.city).approve(boostAddr, ethers.MaxUint256);
  for (const z of [1, 2, 3, 5]) await boost.connect(acc.city).depositBudget(z, 1_000_000);
  for (const z of ZONES) await boost.connect(acc.city).setZoneHourlyCap(z, 300_000);

  const chainId = BigInt(network.config.chainId ?? 31337);
  return { acc, token, registry, boost, boostAddr, chainId, merchants };
}

async function epochNow(): Promise<bigint> {
  return BigInt(await time.latest()) / 3600n;
}

/** Publishes the same bps for the current and the next hour so an hour boundary mid-test is harmless. */
async function setAllRates(bps: number, zones: number[] = ZONES) {
  const e = await epochNow();
  const arr = zones.map(() => bps);
  await ctx.boost.connect(ctx.acc.oracle).setRates(e, zones, arr);
  await ctx.boost.connect(ctx.acc.oracle).setRates(e + 1n, zones, arr);
}

async function depositZone4(amount = 1_000_000) {
  await ctx.boost.connect(ctx.acc.city).depositBudget(4, amount);
}

async function attest(
  payer: HardhatEthersSigner,
  merchant: string,
  amount: number,
  tier = 0,
  overrides: Partial<AttestationStruct> = {},
  signer: HardhatEthersSigner = ctx.acc.attester,
) {
  const att: AttestationStruct = {
    payer: payer.address,
    merchant,
    amount,
    tier,
    nonce: nonceCounter++,
    deadline: (await time.latest()) + 120,
    ...overrides,
  };
  const sig = await signAttestation(signer, ctx.boostAddr, ctx.chainId, att);
  return { att, sig };
}

async function pay(payer: HardhatEthersSigner, merchant: string, amount: number, tier = 0, useCredit = 0) {
  const { att, sig } = await attest(payer, merchant, amount, tier);
  const tx = await ctx.boost.connect(payer).payWithBoost(merchant, amount, useCredit, att, sig);
  const receipt = await tx.wait();
  const log = receipt!.logs
    .map((l) => {
      try {
        return ctx.boost.interface.parseLog({ topics: [...l.topics], data: l.data });
      } catch {
        return null;
      }
    })
    .find((p) => p && p.name === "Paid");
  if (!log) throw new Error("Paid event missing");
  return {
    tx,
    att,
    sig,
    boost: log.args.boost as bigint,
    tier: Number(log.args.tier),
    pendingId: log.args.pendingId as bigint,
    zoneId: Number(log.args.zoneId),
  };
}

/** Invariant 5: token.balanceOf(DalgubeolPay) == Σ zoneBudget + Σ credit + Σ pending(status 0). */
async function expectInvariant() {
  let sum = 0n;
  for (const z of ZONES) sum += await ctx.boost.zoneBudget(z);
  for (let i = 1; i <= 5; i++) sum += await ctx.boost.creditOf(personId(i));
  const next = await ctx.boost.nextPendingId();
  for (let id = 1n; id < next; id++) {
    const p = await ctx.boost.pendings(id);
    if (p.status === 0n) sum += p.amount;
  }
  expect(await ctx.token.balanceOf(ctx.boostAddr), "invariant 5 (case 17)").to.equal(sum);
}

describe("DalgubeolPay payWithBoost", () => {
  beforeEach(async () => {
    ctx = await deployFixture();
  });

  // Case 17: the accounting identity must hold after every scenario.
  afterEach(async () => {
    await expectInvariant();
  });

  it("case01_normalPayment: tier 0, 1000bps, 10,000 -> merchant +10,000, credit +1,000", async () => {
    await depositZone4();
    await setAllRates(1000);
    const [p1] = ctx.acc.payers;
    const m1 = ctx.merchants[0].address;
    const before = await ctx.token.balanceOf(m1);
    const r = await pay(p1, m1, 10_000);
    expect(await ctx.token.balanceOf(m1)).to.equal(before + 10_000n);
    expect(await ctx.token.balanceOf(p1.address)).to.equal(990_000);
    expect(await ctx.boost.creditOf(personId(1))).to.equal(1_000);
    expect(r.boost).to.equal(1_000);
    expect(r.tier).to.equal(0);
    expect(r.pendingId).to.equal(0);
    expect(r.zoneId).to.equal(4);
    expect(await ctx.boost.zoneBudget(4)).to.equal(1_000_000 - 1_000);
    await expect(r.tx)
      .to.emit(ctx.boost, "Paid")
      .withArgs(p1.address, personId(1), m1, 4, 10_000, 0, 1_000, 0, 0);
  });

  it("case02_replaySameSignature: reverts with NonceUsed", async () => {
    await depositZone4();
    await setAllRates(1000);
    const [p1] = ctx.acc.payers;
    const m1 = ctx.merchants[0].address;
    const r = await pay(p1, m1, 10_000);
    await expect(ctx.boost.connect(p1).payWithBoost(m1, 10_000, 0, r.att, r.sig))
      .to.be.revertedWithCustomError(ctx.boost, "NonceUsed");
  });

  it("case03_expiredDeadline: reverts with AttestationExpired", async () => {
    await depositZone4();
    await setAllRates(1000);
    const [p1] = ctx.acc.payers;
    const m1 = ctx.merchants[0].address;
    const { att, sig } = await attest(p1, m1, 10_000, 0, { deadline: (await time.latest()) - 1 });
    await expect(ctx.boost.connect(p1).payWithBoost(m1, 10_000, 0, att, sig))
      .to.be.revertedWithCustomError(ctx.boost, "AttestationExpired");
  });

  it("case04_nonAttesterSignature: reverts with BadSigner", async () => {
    await depositZone4();
    await setAllRates(1000);
    const [p1] = ctx.acc.payers;
    const m1 = ctx.merchants[0].address;
    const { att, sig } = await attest(p1, m1, 10_000, 0, {}, ctx.acc.stranger);
    await expect(ctx.boost.connect(p1).payWithBoost(m1, 10_000, 0, att, sig))
      .to.be.revertedWithCustomError(ctx.boost, "BadSigner")
      .withArgs(ctx.acc.stranger.address);
  });

  it("case05_amountMismatch: reverts with AttestationMismatch", async () => {
    await depositZone4();
    await setAllRates(1000);
    const [p1, p2] = ctx.acc.payers;
    const m1 = ctx.merchants[0].address;
    const { att, sig } = await attest(p1, m1, 10_000);
    await expect(ctx.boost.connect(p1).payWithBoost(m1, 20_000, 0, att, sig))
      .to.be.revertedWithCustomError(ctx.boost, "AttestationMismatch");
    // merchant mismatch
    await expect(ctx.boost.connect(p1).payWithBoost(ctx.merchants[1].address, 10_000, 0, att, sig))
      .to.be.revertedWithCustomError(ctx.boost, "AttestationMismatch");
    // payer mismatch (signed for p1, submitted by p2)
    await expect(ctx.boost.connect(p2).payWithBoost(m1, 10_000, 0, att, sig))
      .to.be.revertedWithCustomError(ctx.boost, "AttestationMismatch");
  });

  it("case06_samePairSameDay: second payment succeeds with boost 0; rate-0 payment does not mark pairDay", async () => {
    await depositZone4();
    const [p1] = ctx.acc.payers;
    const m1 = ctx.merchants[0].address;

    // Rate 0: payment goes through, boost 0, and pairDay must stay unset.
    await setAllRates(0);
    const r0 = await pay(p1, m1, 10_000);
    expect(r0.boost).to.equal(0);
    expect(await ctx.boost.pairDay(personId(1), m1)).to.equal(0);

    // Rate 1000: first boosted payment records pairDay.
    await setAllRates(1000);
    const r1 = await pay(p1, m1, 10_000);
    expect(r1.boost).to.equal(1_000);
    const day = BigInt(await time.latest()) + 9n * 3600n;
    expect(await ctx.boost.pairDay(personId(1), m1)).to.equal(day / 86400n);

    // Same pair again today: success, boost 0, merchant still paid.
    const before = await ctx.token.balanceOf(m1);
    const r2 = await pay(p1, m1, 10_000);
    expect(r2.boost).to.equal(0);
    expect(await ctx.token.balanceOf(m1)).to.equal(before + 10_000n);
    expect(await ctx.boost.creditOf(personId(1))).to.equal(1_000);
    expect(await ctx.boost.quoteBoost(p1.address, m1, 10_000, 0)).to.equal(0);
  });

  it("case07_personDailyCap: after 3,000 boost the next merchant yields exactly 2,000", async () => {
    await depositZone4();
    await setAllRates(1000);
    const [p1] = ctx.acc.payers;
    const [m1, m2] = ctx.merchants.map((m) => m.address);
    const r1 = await pay(p1, m1, 30_000); // 3,000 by rate, capped by perTxBoost 3,000
    expect(r1.boost).to.equal(3_000);
    expect(await ctx.boost.quoteBoost(p1.address, m2, 30_000, 0)).to.equal(2_000);
    const r2 = await pay(p1, m2, 30_000); // 3,000 by rate, personDaily remaining 2,000
    expect(r2.boost).to.equal(2_000);
    expect(await ctx.boost.creditOf(personId(1))).to.equal(5_000);
    const r3 = await pay(p1, ctx.merchants[2].address, 30_000);
    expect(r3.boost).to.equal(0);
  });

  it("case08_slotCap: 120,000 then 60,000 by another person -> second boost is 1,500 on 30,000 eligible", async () => {
    await depositZone4();
    await setAllRates(500);
    const [p1, p2] = ctx.acc.payers;
    const m1 = ctx.merchants[0].address;
    const r1 = await pay(p1, m1, 120_000); // eligible 120,000 * 5% = 6,000 -> perTx cap 3,000
    expect(r1.boost).to.equal(3_000);
    const epoch = await epochNow();
    expect(await ctx.boost.slotVolume(m1, epoch)).to.equal(120_000);
    expect(await ctx.boost.quoteBoost(p2.address, m1, 60_000, 0)).to.equal(1_500);
    const r2 = await pay(p2, m1, 60_000); // remainSlot 30,000 -> 1,500
    expect(r2.boost).to.equal(1_500);
    expect(await ctx.boost.slotVolume(m1, epoch)).to.equal(180_000);
    const r3 = await pay(ctx.acc.payers[2], m1, 10_000); // slot exhausted
    expect(r3.boost).to.equal(0);
  });

  it("case10_tier1Pending: credit unchanged, Pending created, release after delay credits", async () => {
    await depositZone4();
    await setAllRates(1000);
    const [p1] = ctx.acc.payers;
    const m1 = ctx.merchants[0].address;
    const r = await pay(p1, m1, 10_000, 1);
    expect(r.boost).to.equal(1_000);
    expect(r.tier).to.equal(1);
    expect(r.pendingId).to.equal(1);
    expect(await ctx.boost.creditOf(personId(1))).to.equal(0);
    expect(await ctx.boost.zoneBudget(4)).to.equal(999_000);
    const p = await ctx.boost.pendings(1);
    expect(p.personId).to.equal(personId(1));
    expect(p.zoneId).to.equal(4);
    expect(p.amount).to.equal(1_000);
    expect(p.status).to.equal(0);
    expect(p.releaseAt).to.equal(BigInt(await time.latest()) + BigInt(PENDING_DELAY));
    expect(await ctx.boost.nextPendingId()).to.equal(2);

    await expect(ctx.boost.release(1)).to.be.revertedWithCustomError(ctx.boost, "NotReleasable");
    await expectInvariant();
    await time.increase(PENDING_DELAY);
    await expect(ctx.boost.connect(ctx.acc.stranger).release(1))
      .to.emit(ctx.boost, "PendingReleased")
      .withArgs(1, personId(1), 1_000);
    expect(await ctx.boost.creditOf(personId(1))).to.equal(1_000);
    expect((await ctx.boost.pendings(1)).status).to.equal(1);
    await expect(ctx.boost.release(1)).to.be.revertedWithCustomError(ctx.boost, "NotPending");
  });

  it("case11_clawback: zoneBudget restored, release reverts with NotPending", async () => {
    await depositZone4();
    await setAllRates(1000);
    const [p1] = ctx.acc.payers;
    const m1 = ctx.merchants[0].address;
    const budgetBefore = await ctx.boost.zoneBudget(4);
    const r = await pay(p1, m1, 10_000, 1);
    expect(await ctx.boost.zoneBudget(4)).to.equal(budgetBefore - 1_000n);
    await expect(ctx.boost.connect(ctx.acc.stranger).clawback(r.pendingId))
      .to.be.revertedWithCustomError(ctx.boost, "AccessControlUnauthorizedAccount");
    await expect(ctx.boost.connect(ctx.acc.bank).clawback(r.pendingId))
      .to.emit(ctx.boost, "PendingClawedBack")
      .withArgs(r.pendingId, 4, 1_000);
    expect(await ctx.boost.zoneBudget(4)).to.equal(budgetBefore);
    expect((await ctx.boost.pendings(r.pendingId)).status).to.equal(2);
    await time.increase(PENDING_DELAY);
    await expect(ctx.boost.release(r.pendingId)).to.be.revertedWithCustomError(ctx.boost, "NotPending");
    await expect(ctx.boost.connect(ctx.acc.bank).clawback(r.pendingId))
      .to.be.revertedWithCustomError(ctx.boost, "NotPending");
    expect(await ctx.boost.creditOf(personId(1))).to.equal(0);
  });

  it("case12_tier2: payment succeeds with boost 0 and no counters touched", async () => {
    await depositZone4();
    await setAllRates(1000);
    const [p1] = ctx.acc.payers;
    const m1 = ctx.merchants[0].address;
    const before = await ctx.token.balanceOf(m1);
    const r = await pay(p1, m1, 10_000, 2);
    expect(r.boost).to.equal(0);
    expect(r.tier).to.equal(2);
    expect(r.pendingId).to.equal(0);
    expect(await ctx.token.balanceOf(m1)).to.equal(before + 10_000n);
    expect(await ctx.boost.creditOf(personId(1))).to.equal(0);
    expect(await ctx.boost.zoneBudget(4)).to.equal(1_000_000);
    expect(await ctx.boost.pairDay(personId(1), m1)).to.equal(0);
    expect(await ctx.boost.slotVolume(m1, await epochNow())).to.equal(0);
    // Tier above 2 is treated like tier 2.
    const r5 = await pay(p1, m1, 10_000, 5);
    expect(r5.boost).to.equal(0);
    expect(r5.tier).to.equal(5);
  });

  it("case13_useCredit: merchant receives full amount, credit part earns no boost", async () => {
    await depositZone4();
    await setAllRates(1000);
    const [p1] = ctx.acc.payers;
    const [m1, m2] = ctx.merchants.map((m) => m.address);
    await pay(p1, m1, 10_000); // credit 1,000
    expect(await ctx.boost.creditOf(personId(1))).to.equal(1_000);

    const contractBefore = await ctx.token.balanceOf(ctx.boostAddr);
    const m2Before = await ctx.token.balanceOf(m2);
    const payerBefore = await ctx.token.balanceOf(p1.address);
    expect(await ctx.boost.quoteBoost(p1.address, m2, 10_000, 1_000)).to.equal(900);
    const r = await pay(p1, m2, 10_000, 0, 1_000);
    expect(r.boost).to.equal(900); // (10,000 - 1,000) * 10%
    expect(await ctx.token.balanceOf(m2)).to.equal(m2Before + 10_000n);
    expect(await ctx.token.balanceOf(p1.address)).to.equal(payerBefore - 9_000n);
    expect(await ctx.token.balanceOf(ctx.boostAddr)).to.equal(contractBefore - 1_000n);
    expect(await ctx.boost.creditOf(personId(1))).to.equal(900);
    await expect(r.tx)
      .to.emit(ctx.boost, "Paid")
      .withArgs(p1.address, personId(1), m2, 2, 10_000, 1_000, 900, 0, 0);
  });

  it("case13b_useCredit_fullAmount: paying entirely with credit yields boost 0", async () => {
    await depositZone4();
    await setAllRates(1000);
    const [p1] = ctx.acc.payers;
    const [m1, m2] = ctx.merchants.map((m) => m.address);
    await pay(p1, m1, 10_000);
    const r = await pay(p1, m2, 1_000, 0, 1_000);
    expect(r.boost).to.equal(0);
    expect(await ctx.boost.creditOf(personId(1))).to.equal(0);
    expect(await ctx.boost.slotVolume(m2, await epochNow())).to.equal(0);
  });

  it("case13c_creditErrors: InsufficientCredit and CreditExceedsAmount", async () => {
    await depositZone4();
    await setAllRates(1000);
    const [p1] = ctx.acc.payers;
    const [m1, m2] = ctx.merchants.map((m) => m.address);
    const a = await attest(p1, m1, 10_000);
    await expect(ctx.boost.connect(p1).payWithBoost(m1, 10_000, 1, a.att, a.sig))
      .to.be.revertedWithCustomError(ctx.boost, "InsufficientCredit");
    await pay(p1, m1, 10_000); // credit 1,000
    const b = await attest(p1, m2, 500);
    await expect(ctx.boost.connect(p1).payWithBoost(m2, 500, 1_000, b.att, b.sig))
      .to.be.revertedWithCustomError(ctx.boost, "CreditExceedsAmount");
  });

  it("case14_zeroBudgetZone: payment succeeds with boost 0", async () => {
    await setAllRates(1000); // zone 4 has no budget in the fixture
    const [p1] = ctx.acc.payers;
    const m1 = ctx.merchants[0].address;
    expect(await ctx.boost.zoneBudget(4)).to.equal(0);
    expect(await ctx.boost.quoteBoost(p1.address, m1, 10_000, 0)).to.equal(0);
    const before = await ctx.token.balanceOf(m1);
    const r = await pay(p1, m1, 10_000);
    expect(r.boost).to.equal(0);
    expect(await ctx.token.balanceOf(m1)).to.equal(before + 10_000n);
    expect(await ctx.boost.pairDay(personId(1), m1)).to.equal(0);
  });

  it("zoneHourlyCap limits the boost and budget below the boost is the last clamp", async () => {
    await depositZone4(1_500);
    await setAllRates(1000);
    await ctx.boost.connect(ctx.acc.city).setZoneHourlyCap(4, 2_500);
    const [p1, p2, p3] = ctx.acc.payers;
    const m1 = ctx.merchants[0].address;
    const r1 = await pay(p1, m1, 10_000); // 1,000
    expect(r1.boost).to.equal(1_000);
    const r2 = await pay(p2, m1, 10_000); // budget remaining 500
    expect(r2.boost).to.equal(500);
    await depositZone4(10_000);
    const r3 = await pay(p3, m1, 20_000); // hourly cap remaining 1,000 (2,500 - 1,500)
    expect(r3.boost).to.equal(1_000);
  });

  it("reverts for unregistered payer and inactive merchant", async () => {
    await depositZone4();
    await setAllRates(1000);
    const m1 = ctx.merchants[0].address;
    const s = ctx.acc.stranger;
    const a = await attest(s, m1, 10_000);
    await expect(ctx.boost.connect(s).payWithBoost(m1, 10_000, 0, a.att, a.sig))
      .to.be.revertedWithCustomError(ctx.boost, "UnregisteredPayer");

    const [p1] = ctx.acc.payers;
    await ctx.registry.connect(ctx.acc.bank).setActive(m1, false);
    const b = await attest(p1, m1, 10_000);
    await expect(ctx.boost.connect(p1).payWithBoost(m1, 10_000, 0, b.att, b.sig))
      .to.be.revertedWithCustomError(ctx.boost, "MerchantInactive");
    // Nonce must be consumed only on success: the same attestation works once the merchant is active again.
    await ctx.registry.connect(ctx.acc.bank).setActive(m1, true);
    await expect(ctx.boost.connect(p1).payWithBoost(m1, 10_000, 0, b.att, b.sig)).to.emit(ctx.boost, "Paid");
  });

  it("quoteBoost returns 0 for an unregistered payer", async () => {
    await depositZone4();
    await setAllRates(1000);
    expect(await ctx.boost.quoteBoost(ctx.acc.stranger.address, ctx.merchants[0].address, 10_000, 0)).to.equal(0);
    expect(await ctx.boost.quoteBoost(ctx.acc.payers[0].address, ctx.merchants[0].address, 10_000, 0)).to.equal(1_000);
  });

  it("pairDay resets on the next KST day", async () => {
    await depositZone4();
    await setAllRates(1000);
    const [p1] = ctx.acc.payers;
    const m1 = ctx.merchants[0].address;
    await pay(p1, m1, 10_000);
    expect(await ctx.boost.quoteBoost(p1.address, m1, 10_000, 0)).to.equal(0);
    // Jump to the start of the next KST day and publish rates for that hour.
    const now = BigInt(await time.latest());
    const nextDayStart = ((now + 9n * 3600n) / 86400n + 1n) * 86400n - 9n * 3600n;
    await time.increaseTo(nextDayStart);
    await setAllRates(1000);
    expect(await ctx.boost.quoteBoost(p1.address, m1, 10_000, 0)).to.equal(1_000);
    const r = await pay(p1, m1, 10_000);
    expect(r.boost).to.equal(1_000);
  });
});
