import chai, {expect} from "chai";
import {ethers} from "hardhat";
import {solidity} from "ethereum-waffle";
import {BigNumber, Contract, ContractFactory, utils} from "ethers";
import {Provider} from "@ethersproject/providers";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import {advanceTimeAndBlock} from "../shared/utilities";

chai.use(solidity);

async function latestBlocktime(provider: Provider): Promise<number> {
    const {timestamp} = await provider.getBlock("latest");
    return timestamp;
}

describe("ContractGuard", () => {
    const ETH = utils.parseEther("1");
    const ZERO = BigNumber.from(0);

    const {provider} = ethers;

    let operator: SignerWithAddress;
    let fraud: SignerWithAddress;
    let rewardPool: SignerWithAddress;

    before("setup accounts", async () => {
        [operator, fraud, rewardPool] = await ethers.getSigners();
    });

    // core
    let Dollar: ContractFactory;
    let Bond: ContractFactory;
    let Share: ContractFactory;
    let Treasury: ContractFactory;
    let Boardroom: ContractFactory;
    let MockOracle: ContractFactory;

    let Tester: ContractFactory;

    before("fetch contract factories", async () => {
        Dollar = await ethers.getContractFactory("Dollar");
        Bond = await ethers.getContractFactory("Bond");
        Share = await ethers.getContractFactory("Share");
        Treasury = await ethers.getContractFactory("Treasury");
        Boardroom = await ethers.getContractFactory("Boardroom");
        MockOracle = await ethers.getContractFactory("MockOracle");
        Tester = await ethers.getContractFactory("Tester");
    });

    let bond: Contract;
    let dollar: Contract;
    let share: Contract;
    let oracle: Contract;
    let treasury: Contract;
    let boardroom: Contract;
    let tester: Contract;

    beforeEach("deploy contracts", async () => {
        dollar = await Dollar.connect(operator).deploy();
        bond = await Bond.connect(operator).deploy();
        share = await Share.connect(operator).deploy();

        oracle = await MockOracle.connect(operator).deploy();
        boardroom = await Boardroom.connect(operator).deploy(dollar.address, share.address);
        treasury = await Treasury.connect(operator).deploy(
            dollar.address,
            bond.address,
            share.address,
            oracle.address,
            boardroom.address,
            await latestBlocktime(provider)
        );
        await boardroom.connect(operator).transferOperator(treasury.address);

        tester = await Tester.connect(operator).deploy(treasury.address, boardroom.address);
    });

    it("#actionTreasury", async () => {
        const dollarPrice = ETH.mul(106).div(100);
        await oracle.setPrice(dollarPrice);

        for await (const token of [dollar, bond, share]) {
            await token.connect(operator).transferOperator(treasury.address);
        }
        await expect(tester.connect(fraud).actionTreasury()).to.revertedWith("ContractGuard: one block, one function");
    });

    it("#actionBoardroom", async () => {
        await share.connect(operator).distributeReward(rewardPool.address);
        await share.connect(rewardPool).transfer(tester.address, ETH);
        await expect(tester.connect(fraud).actionBoardroom(share.address, ETH)).to.revertedWith("ContractGuard: one block, one function");
    });
});
