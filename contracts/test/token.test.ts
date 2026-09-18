import { expect } from "chai";
import { ethers } from "hardhat";
import { getAccounts } from "./fixtures";

describe("MockIMKRW", () => {
  async function deploy() {
    const acc = await getAccounts();
    const token = await ethers.deployContract("MockIMKRW", [], acc.deployer);
    return { acc, token };
  }

  it("has 0 decimals", async () => {
    const { token } = await deploy();
    expect(await token.decimals()).to.equal(0);
    expect(await token.name()).to.equal("Mock iMKRW");
    expect(await token.symbol()).to.equal("iMKRW");
  });

  it("mints with MINTER_ROLE and updates balance in whole won", async () => {
    const { acc, token } = await deploy();
    await token.connect(acc.deployer).mint(acc.payers[0].address, 1_000_000);
    expect(await token.balanceOf(acc.payers[0].address)).to.equal(1_000_000);
    expect(await token.totalSupply()).to.equal(1_000_000);
  });

  it("reverts mint without MINTER_ROLE", async () => {
    const { acc, token } = await deploy();
    await expect(token.connect(acc.stranger).mint(acc.stranger.address, 1))
      .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount")
      .withArgs(acc.stranger.address, await token.MINTER_ROLE());
  });
});
