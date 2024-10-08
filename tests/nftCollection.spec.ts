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
    });

    it('should return nft content', async () => {
        let res = await nftCollection.getNftContent(0, Cell.EMPTY);

        expect(decodeOnChainContent(res)).toEqual(decodeOnChainContent(
            (config.commonContent instanceof Cell) ? config.commonContent : Cell.EMPTY));

        let personalNftContent = encodeOnChainContent({"description": "Dmitrii Kostichkin"});
        let res2 = await nftCollection.getNftContent(0, personalNftContent);
        let resContent = decodeOnChainContent(res2);

        expect(resContent.descriptio).toEqual("Diploma for the student: Dmitrii Kostichkin");
        expect(resContent.imge_data).toEqual(imageDataSbt);
    });

    it('should return nft by index', async () => {
        let index = 77;
        let res = await nftCollection.getNftAddressByIndex(index);
        let nftItemData = beginCell().storeUint(index, 64).storeAddress(nftCollection.address).endCell();
        let expectedAddress = contractAddress(0,
            {code: config.nftItemCode, data: nftItemData});
        
            expect(res.toString()).toEqual(expectedAddress.toString());
    });

    it ('should return royalty params', async () => {
        let res = await nftCollection.getRoyaltyParams();

        expect(res.royaltyBase).toEqual(config.royaltyParams.royaltyBase);
        expect(res.royaltyFactor).toEqual(config.royaltyParams.royaltyFactor);
        expect(res.royaltyAddress.toString()).toEqual(config.royaltyParams.royaltyAddress.toString());
    });

    it ('should deploy new nft', async () => {
        let itemIndex = 1;
        let res = await nftCollection.sendDeployNewNft(deployer.getSender(), toNano('1'), {
            passAmount: toNano('0.5'),
            itemIndex,
            itemOwnerAddress: OWNER_ADDRESS,
            itemContent: 'test_content'
        });
        let itemData = beginCell().storeUint(itemIndex, 64).storeAddress(nftCollection.address).endCell();
        
        expect(res.transactions).toHaveTransaction({
            from: nftCollection.address,
            deploy: true,
            initCode: config.nftItemCode,
            initData: itemData,
            success: true,
        });
    });

    it ('should deploy new sbt', async () => {
        let itemIndex = 1;
        let res = await nftCollection.sendDeployNewSbt(deployer.getSender(), toNano('1'), {
            passAmount: toNano('0.5'),
            itemIndex,
            itemOwnerAddress: OWNER_ADDRESS,
            itemContent: encodeOnChainContent({"description": "Student",}),
        
            itemAuthority: authority.address,
        });
        let itemData = beginCell().storeUint(itemIndex, 64).storeAddress(nftCollection.address).endCell();

        expect(res.transactions).toHaveTransaction({
            from: nftCollection.address,
            deploy: true,
            initCode: config.nftItemCode,
            initData: itemData,
            success: true,
        });
    });

    it ('should batch deploy nft/s', async () => {
        let items: CollectionMintNftItemInput[] =[
            {
                passAmount: toNano("0.5"),
                index: 0,
                ownerAddress: randomAddress(),
                content: encodeOnChainContent({
                    "description": "Student 1",
                })
            },
            {
                passAmount: toNano('0.5'),
                index: 0,
                ownerAddress: randomAddress(),
                content: encodeOnChainContent({
                    "description": "Student 2"
                })
            },
        ]

        let res = await nftCollection.sendBatchDeployNft(deployer.getSender(), toNano('1'), {items});
        let nftItemData1 = beginCell().storeUint(0, 64).storeAddress(nftCollection.address).endCell();

        expect(res.transactions).toHaveTransaction({
            from: nftCollection.address,
            deploy: true,
            initCode: config.nftItemCode,
            initData: nftItemData1,
            success: true,
        });

        let nftItemData2 = beginCell().storeUint(1, 64).storeAddress(nftCollection.address).endCell();

        expect(res.transactions).toHaveTransaction({
            from: nftCollection.address,
            deploy: true,
            initCode: config.nftItemCode,
            initData: nftItemData2,
            success: true,
        });
    });

    it('should batch deploy sbt\'s', async () => {
        let items: CollectionMintSbtItemInput[] = [
            
            {
                passAmount: toNano('0.5'),
                index: 1,
                ownerAddress: randomAddress(),
                authorityAddress: randomAddress(),
                content: encodeOnChainContent({
                    "description": "Student 2",
                }),
            },
        ]

        let res = await nftCollection.sendBatchDeploySbt(deployer.getSender(), toNano('1'), {
            items
        })

        let itemData1 = beginCell()
            .storeUint(0, 64)
            .storeAddress(nftCollection.address)
            .endCell()

        expect(res.transactions).toHaveTransaction({
            from: nftCollection.address,
            deploy: true,
            initCode: config.nftItemCode,
            initData: itemData1,
            success: true,
        });

        let itemData2 = beginCell()
            .storeUint(1, 64)
            .storeAddress(nftCollection.address)
            .endCell()

        expect(res.transactions).toHaveTransaction({
            from: nftCollection.address,
            deploy: true,
            initCode: config.nftItemCode,
            initData: itemData2,
            success: true,
        });
    });

    it ('should deploy nft only if owner calls', async () => {
        let itemIndex = 1;
        let res = await nftCollection.sendDeployNewNft(anybody.getSender(), toNano('1'), {
            passAmount: toNano('0.5'),
            itemIndex,
            itemOwnerAddress: OWNER_ADDRESS,
            itemContent: encodeOnChainContent({
                "description": "Student",
            })
        });

        expect(res.transactions).toHaveTransaction({
            from: anybody.address,
            to: nftCollection.address,
            success: false,
            exitCode: 401
        });
    });

    it ('should change owner', async () => {
        let newOwner = randomAddress();
        let res = await nftCollection.sendChangeOwner(anybody.getSender(), newOwner);

        expect(res.transactions).toHaveTransaction({
            from: anybody.address,
            to: nftCollection.address,
            success: false,
            exitCode: 401
        });

        res = await nftCollection.sendChangeOwner(deployer.getSender(), newOwner)
        expect(res.transactions).toHaveTransaction({
            from: deployer.address,
            to: nftCollection.address,
            success: true
        });
        
        let data = await nftCollection.getCollectionData();
        expect(data.ownerAddress.toString()).toEqual(newOwner.toString());
    });

    it ('should send royalty params', async () => {
        let res = await nftCollection.sendGetRoyaltyParams(anybody.getSender());

        expect(res.transactions).toHaveTransaction({
            from: nftCollection.address,
            to: anybody.address,
            op: OperationCodes.GetRoyaltyParamsResponse,
            success: true 
        });

        expect(res.transactions).toHaveTransaction({
            from: nftCollection.address,
            to: anybody.address,
            op: OperationCodes.GetRoyaltyParamsResponse,
            success: true 
        });

        let tx = flattenTransaction(findTransactionRequired(res.transactions, {
            op: OperationCodes.GetRoyaltyParamsResponse }));
        let response = tx.body?.beginParse()!;
        let op = response.loadUint(32);
        let queryId = response.loadUint(64);
        let royaltyFactor = response.loadUint(16);
        let royaltyBase = response.loadUint(16);
        let royaltyAddress = response.loadAddress()!;

        expect(op).toEqual(OperationCodes.GetRoyaltyParamsResponse);
        expect(queryId).toEqual(0);
        expect(royaltyFactor).toEqual(config.royaltyParams.royaltyFactor);
        expect(royaltyBase).toEqual(config.royaltyParams.royaltyBase);
        expect(royaltyAddress.toString()).toEqual(config.royaltyParams.royaltyAddress.toString());
    });

    it ("should edit content", async () => {
        let royaltyAddress = randomAddress();
        let newConfig = {
            collectionContent: encodeOnChainContent({
                "name": "Diploma2",
                "description": "Descr 2",
            }),
            commonContent: encodeOnChainContent({
                "name": "Personal",
                "description": "Item desc",
            }),

            royaltyParams: {
                royaltyFactor: 159,
                royaltyBase: 220,
                royaltyAddress: royaltyAddress 
            }
        };

        let res = await nftCollection.sendEditContent(anybody.getSender(), newConfig);

        expect(res.transactions).toHaveTransaction({
            from: anybody.address,
            to: nftCollection.address,
            success: false,
            exitCode: 401
        });

        res = await nftCollection.sendEditContent(deployer.getSender(), newConfig);
        expect(res.transactions).toHaveTransaction({
            from: deployer.address,
            to: nftCollection.address,
            success: true,
        });

        let data = await nftCollection.getCollectionData();
        expect(decodeOnChainContent(data.collectionContent)).toEqual(decodeOnChainContent(
            newConfig.collectionContent));

        let dataNft = await nftCollection.getNftContent(0, Cell.EMPTY);
        expect(decodeOnChainContent(dataNft)).toEqual(decodeOnChainContent(newConfig.commonContent));

        let royalty = await nftCollection.getRoyaltyParams();
        expect(royalty.royaltyFactor).toEqual(150);
        expect(royalty.royaltyBase).toEqual(220);
        expect(royalty.royaltyAddress.toString()).toEqual(royaltyAddress.toString());
    });


});