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
    let authority_wallet: SandboxContract<TreasuryContract>;
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
        authority_wallet = await blockchain.treasury('authority');
        collection_wallet = await blockchain.treasury('collection');
        editor_wallet = deployer;

        OWNER_ADDRESS = deployer.address;
        AUTHORITY_ADDRESS = authority_wallet.address;
        COLLECTION_ADDRESS = collection_wallet.address;
        EDITOR_ADDRESS = editor_wallet.address;

        configMetadata = {
            "name": "@old_knyazich",
            "stream": "3",
            "description": "I am Student Blockchain Academy A and a proud owner of this diploma",
            "images": "https://wallpapercave.com/wp/xPNxQ4y.jpg",
        };

        custom_nft_fields = ["stream"];

        config = {
            index: 777,
            collectionAddress: COLLECTION_ADDRESS,
            ownerAddress: OWNER_ADDRESS,
            authorityAddress: AUTHORITY_ADDRESS,
            content: encodeOnChainContent(configMetadata)
        };

        token = blockchain.openContract(
            Sbt.createFromConfig(config, code)
        );

        const deployResult = await token.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: token.address,
            deploy: true,
            success: true 
        });

        blockchainInitSnapshot = blockchain.snapshot();
    });

    beforeEach(async () => {
        blockchain.loadFrom(blockchainInitSnapshot);
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and sbt are ready to use
    });

    it ('should ignore external messages', async () => {
        try {
            let res = await blockchain.sendMessage({
                info: {
                    type: 'external-in',
                    dest: token.address,
                    importFee: 0n,
                },
                init: undefined,
                body: beginCell().endCell()
            });

            expect (res.transactions).toHaveTransaction({
                to: token.address,
                success: false,
            });
        } catch (e: any) {
            expect (e.message).toContain('message not accepted');
        }
    });
    
    it ('should return item data', async () => {
        let res = await token.getNftData();

        expect(res.inited).toBe(true);
        expect(res.index).toEqual(config.index);
        expect(res.collectionAddress!.toString()).toEqual(config.collectionAddress!.toString());
        expect(res.ownerAddress?.toString()).toEqual(config.ownerAddress!.toString());
        expect((res.content instanceof Cell) ? decodeOnChainContent(res.content, custom_nft_fields) : 
        {}).toEqual(configMetadata);
    });

    it ('should return editor', async () => {
        try {
            let res = await token.getEditor();
            expect(res).toEqual(EDITOR_ADDRESS);
        } catch (e: any) {
            if (EDITOR_ADDRESS === null) {
                expect(e.toString()).toContain("exit_code: 11");
            } else {
                expect(e).toBeUndefined();
            }
        }
    });

    it ('should not transfer', async () => {
        let newOwner =randomAddress();
        let res = await deployer.send({
            to: token.address,
            value: toNano(1),
            bounce: false,
            body: Queries.transfer({
                newOwner,
                forwardAmount: toNano('0.01'),
                responseTo: randomAddress()     
            }).endCell()
        });

        expect(res.transactions).toHaveTransaction({
            from: deployer.address,
            to: token.address,
            success: false,
            exitCode: 413
        });
    });

    it ('should not transfer by authority', async () => {
        let newOwner = randomAddress();
        let res = await authority_wallet.send({
            to: token.address, 
            value: toNano(1),        
            bounce: false,
            body: Queries.transfer({
                newOwner,
                forwardAmount: toNano('0.01'),
                responseTo: randomAddress()
            }).endCell()
        });

        expect(res.transactions).toHaveTransaction({
            from: authority_wallet.address,
            to: token.address,
            success: false,
            exitCode: 413
        });
    });

    it ('should destroy', async () => {
        let res = await token.sendDestroy(deployer.getSender(), {});

        expect(res.transactions).toHaveTransaction({
            from: deployer.address,
            to: token.address,
            success: true 
        });

        expect(res.transactions).toHaveTransaction({
            from: token.address,
            to: deployer.address,
            success: true,
            op: OperationCodes.excesses
        });

        let data = await token.getNftData();

        if (!data.inited) {
            throw new Error();
        }
        
        expect(data.ownerAddress).toEqual(null);
        expect(await token.getAuthority()).toEqual(null);
    });

    it ('shold not destroy', async () => {
        let res = await token.sendDestroy(authority_wallet.getSender(), {});

        expect(res.transactions).toHaveTransaction({
            from: authority_wallet.address,
            to: token.address,
            success: false,
            exitCode: 401
        });
    });

    it ('random guy prove ownership', async () => {
        let someGuyWallet = await blockchain.treasury('some guy');

        let dataCell = beginCell().storeUint(888, 16).endCell();

        let res = await someGuyWallet.send({
            to: token.address,
            value: toNano(1),
            bounce: false,
            body: Queries.proveOwnership({
                to: randomAddress(),
                data: dataCell,
                withContent: true 
            })
        });

        expect(res.transactions).toHaveTransaction({
            from: someGuyWallet.address,
            to: token.address,
            success: false,
            exitCode: 401
        });
    });

    it ('random guy request ownership', async () => {
        
    });
});
