import {Blockchain, BlockchainSnapshot, SandboxContract, TreasuryContract} from '@ton/sandbox';
import {Cell, toNano, Address, beginCell} from '@ton/core';
import {randomAddress} from "../utils/randomAddress";
import {SbtItemData, OperationCodes, Queries} from "../wrappers/sbt/Sbt.data";
import {Sbt} from '../wrappers/sbt/Sbt';
import "@ton/test-utils";

import { compile } from '@ton/blueprint';
import { decodeOnChainContent, encodeOnChainContent } from "../wrappers/nft-content/nftContent";
import { findTransactionRequired, flattenTransaction } from '@ton/test-utils';

describe('Sbt', () => {
    let code: Cell;
    let blockchain: Blockchain;
    let blockchainInitSnapshot: BlockchainSnapshot;
    let deployer: SandboxContract<TreasuryContract>;
    let authority_wallert: SandboxContract<TreasuryContract>;
    let collection_wallet: SandboxContract<TreasuryContract>;
    let editor_wallet: SandboxContract<TreasuryContract>;
    let token: SandboxContract<Sbt>;
    let sbt: SandboxContract<Sbt>;

    let OWNER_ADDRESS: Address;
    let AUTHORITY_ADDRESS: Address;
    let COLLECTION_ADDRESS: Address;
    let EDITOR_ADDRESS: Address;

    let config: SbtItemData;
    let configMetadata: {[key: string]: string | Buffer};
    let custom_nft_fields: string[];



    beforeAll(async () => {
        code = await compile('Sbt');
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
    });

    
    

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        sbt = blockchain.openContract(Sbt.createFromConfig({}, code));

        deployer = await blockchain.treasury('deployer');

        const deployResult = await sbt.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: sbt.address,
            deploy: true,
            success: true,
        });
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and sbt are ready to use
    });
});
