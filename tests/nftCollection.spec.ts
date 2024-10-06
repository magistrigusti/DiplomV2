import { CollectionMintNftItemInput, CollectionMintSbtItemInput, NftCollectionData, OperationCodes } from "../wrappers/nft-collection/NftCollection.data";
import { beginCell, Cell, contractAddress, toNano, Address } from '@ton/core';
import { NftCollection } from "../wrappers/nft-collection/NftCollection";
import { randomAddress } from "../utils/randomAddress";
import { Blockchain, BlockchainSnapshot, SandboxContract, TreasuryContract } from '@ton/sandbox';
import '@ton/test-utils';
import { compile } from '@ton/blueprint';
import { findTransactionRequired, flattenTransaction } from "@ton/test-utils";
import { decodeOnChainContent, encodeOffChainContent, encodeOnChainContent } from "../wrappers/nft-content/nftContent";
import { CANCELLED } from "dns";


describe('nft collectiom smc', () => {
    let code: Cell;
    let blockchain: Blockchain;
    let blockcainInitSnapshot: BlockchainSnapshot;
    let deployer: SandboxContract<TreasuryContract>;
    let anybody: SandboxContract<TreasuryContract>;
    let authority: SandboxContract<TreasuryContract>;
    let nftCollection: SandboxContract<NftCollection>;
    const ROYALTY_ADDRESS = randomAddress();
    let OWNER_ADDRESS: Address;
    let config: NftCollectionData;
    let imageData: Buffer;
    let imageDataSbt: Buffer;

    beforeAll( async () => {
        code = await compile('NftCollection');
        blockchain = await Blockchain.create();
        deployer = await blockchain.treasury('deployer');
        authority = await blockchain.treasury('authority');
        anybody = await blockchain.treasury('anybody else');
        OWNER_ADDRESS = deployer.address;

        imageData = Buffer.from(await (await (
            await fetch('https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSm6ibGCWzJbCUzn0IeojwqbCl12tDik1Au9g&s')
            ).blob()).arrayBuffer());
        imageDataSbt = Buffer.from(await (await (
            await fetch('https://cdn.fakty.com.ua/wp-content/uploads/2019/12/10/Screenshot_2-1.jpg')
        ).blob()).arrayBuffer());

        imageData = Buffer.concat([Buffer.from('PNG'), Buffer.alloc(1000, 0), Buffer.from("END")]);
        imageDataSbt = Buffer.concat([Buffer.from('JPEG'), Buffer.alloc(5000, 0), Buffer.from('End')]);

        config = {
            ownerAddress: OWNER_ADDRESS,
            nextItemIndex: 777,
            collectionContent: encodeOnChainContent({
                "name": 'Diploma',
                "description": "Collection of personal diploms for students",
                "image_data": imageDataSbt
            }),
            commonContent: encodeOnChainContent({
                "name": "Personal diploma for the student",
                "description": "Diploma for the student:",
                "image_data": imageDataSbt
            }),
            nftItemCode: new Cell(),
            royaltyParams: {
                royaltyFactor: 100,
                royaltyBase: 200,
                royaltyAddress: ROYALTY_ADDRESS
            },
        }

        nftCollection = blockchain.openContract(
            NftCollection.createFromConfig(config, code)
        );

        const deployResult = await nftCollection.sendDeploy(deployer.getSender(), toNano('0.05'));

        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: nftCollection.address,
            deploy: true,
            success: true,
        });

        blockchainInitSnapshot = blockchain.snapshot();
    });

    beforeEach(async () => {
        blockchain.loadFrom(blockchainInitSnapshot);
    });

    it('should deploy', async () => {
        // the check is done inside beforeEach
        // blockchain and nftCollection are ready to use
    });

    it('should ignore external messages', async () => {
        try {
            let res = await blockchain.sendMessage({
                info: {
                    type: 'external-in',
                    dest: nftCollection.address,
                    importFee: 0n,
                },
                init: undefined,
                body: beginCell().endCell()
            });
            
            expect(res.transactions).toHaveTransaction({
                to: nftCollection.address,success: false,
            });
        } catch (e: any) {
            expect(e.message).toContain('message not accepted');
        }
    });

    it('should return collection data', async () => {
        let res = await nftCollection.getCollectionData();

        expect(res.nextItemId).toEqual(config.nextItemIndex);
        expect(decodeOnChainContent(res.collectionContent)).toEqual(
            decodeOnChainContent((config.collectionContent instanceof Cell) ? 
            config.collectionContent : Cell.EMPTY));
        expect(res.ownerAddress.toString()).toEqual(config.ownerAddress.toString());
    })
})