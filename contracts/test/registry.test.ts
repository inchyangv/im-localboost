import { expect } from "chai";
import { ethers } from "hardhat";
import { getAccounts, personId } from "./fixtures";

describe("MerchantRegistry", () => {
  async function deploy() {
    const acc = await getAccounts();
    const registry = await ethers.deployContract("MerchantRegistry", [], acc.deployer);
    await registry.connect(acc.deployer).grantRole(await registry.BANK_ROLE(), acc.bank.address);
    return { acc, registry };
  }

  it("register/get round trip", async () => {
    const { acc, registry } = await deploy();
    const m = acc.merchants[0].address;
    await expect(registry.connect(acc.bank).register(m, 4, 1, 100_000))
      .to.emit(registry, "MerchantRegistered")
      .withArgs(m, 4, 1, 100_000);
    const rec = await registry.get(m);
    expect(rec.zoneId).to.equal(4);
    expect(rec.categoryId).to.equal(1);
    expect(rec.active).to.equal(true);
    expect(rec.slotBaseline).to.equal(100_000);
  });

  it("reverts register without BANK_ROLE", async () => {
    const { acc, registry } = await deploy();
    await expect(registry.connect(acc.stranger).register(acc.merchants[0].address, 1, 1, 1))
      .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
  });

  it("reverts register of zero address", async () => {
    const { acc, registry } = await deploy();
    await expect(registry.connect(acc.bank).register(ethers.ZeroAddress, 1, 1, 1))
      .to.be.revertedWithCustomError(registry, "ZeroAddress");
  });

  it("setActive is reflected by get", async () => {
    const { acc, registry } = await deploy();
    const m = acc.merchants[0].address;
    await registry.connect(acc.bank).register(m, 4, 1, 100_000);
    await expect(registry.connect(acc.bank).setActive(m, false))
      .to.emit(registry, "MerchantActiveSet")
      .withArgs(m, false);
    expect((await registry.get(m)).active).to.equal(false);
    await expect(registry.connect(acc.stranger).setActive(m, true))
      .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
  });

  it("setPerson stores personOf and re-linking the same wallet is allowed", async () => {
    const { acc, registry } = await deploy();
    const w = acc.payers[0].address;
    await expect(registry.connect(acc.bank).setPerson(w, personId(1)))
      .to.emit(registry, "PersonSet")
      .withArgs(w, personId(1));
    expect(await registry.personOf(w)).to.equal(personId(1));
    await registry.connect(acc.bank).setPerson(w, personId(1));
    expect(await registry.personOf(w)).to.equal(personId(1));
  });

  it("setPerson rejects zero person and zero wallet", async () => {
    const { acc, registry } = await deploy();
    await expect(registry.connect(acc.bank).setPerson(acc.payers[0].address, ethers.ZeroHash))
      .to.be.revertedWithCustomError(registry, "ZeroPerson");
    await expect(registry.connect(acc.bank).setPerson(ethers.ZeroAddress, personId(1)))
      .to.be.revertedWithCustomError(registry, "ZeroAddress");
  });

  it("setPerson reverts without BANK_ROLE", async () => {
    const { acc, registry } = await deploy();
    await expect(registry.connect(acc.stranger).setPerson(acc.payers[0].address, personId(1)))
      .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
  });

  it("case16_twoWalletsOnePerson: second wallet for the same personId reverts", async () => {
    const { acc, registry } = await deploy();
    await registry.connect(acc.bank).setPerson(acc.payers[0].address, personId(1));
    await expect(registry.connect(acc.bank).setPerson(acc.payers[1].address, personId(1)))
      .to.be.revertedWithCustomError(registry, "PersonAlreadyLinked")
      .withArgs(personId(1), acc.payers[0].address);
    expect(await registry.personOf(acc.payers[1].address)).to.equal(ethers.ZeroHash);
  });
});
