"use client"
import { useState, useEffect } from 'react';
import { LitNetwork, LIT_RPC } from "@lit-protocol/constants";
import { LitActionResource, createSiweMessageWithRecaps } from "@lit-protocol/auth-helpers";
import { LitNodeClient, encryptString } from "@lit-protocol/lit-node-client";
import {
    createSiweMessage,
    generateAuthSig,
    LitAbility,
    LitAccessControlConditionResource,
} from "@lit-protocol/auth-helpers";
import {
    SignProtocolClient,
    SpMode,
    EvmChains,
    IndexService,
    decodeOnChainData,
    DataLocationOnChain,
    chainInfo,
    SchemaItem
} from "@ethsign/sp-sdk";
import { ethers } from 'ethers';

interface UserProfile {
    address: string;
    photo: string;
    location: string;
    profileText: string;
}

const code = `(async () => {
  const resp = await Lit.Actions.decryptAndCombine({
    accessControlConditions,
    ciphertext,
    dataToEncryptHash,
    authSig: null,
    chain: 'ethereum',
  });
  Lit.Actions.setResponse({ response: resp });
})();`

export default function MatchPage() {
    const [addresses, setAddresses] = useState<string[]>([]);
    const [currentUserIndex, setCurrentUserIndex] = useState<number>(0);
    const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

    const client = new LitNodeClient({
        litNetwork: LitNetwork.DatilDev,
        debug: true
    });

    const fetchData = async () => {

        await client.connect();
        const PK = process.env.NEXT_PUBLIC_PK;

        const ethersWallet = new ethers.Wallet(
            PK,
            new ethers.providers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE)
        );

        const ciphertext = "pzmZ4DmdRp35cUKO6Cg2xfFWiyXalB5rYzO847Tk/KKYLHVIwQlXy2XgjTzktVg0IHXd9Lg5MWatwmhmqmkEKHfmuwjk+EA3oAg6m4auamsgej88MqYTq5qygvnvDwSausmmk2bqs/bo/TaAYf/og9EC";
        const dataToEncryptHash = "64ec88ca00b268e5ba1a35678a1b5316d212f4f366b2477232534a8aeca37f3c";

        const chain = 'ethereum';
        const accessControlConditions = [
            {
                contractAddress: '',
                standardContractType: '',
                chain,
                method: 'eth_getBalance',
                parameters: [':userAddress', 'latest'],
                returnValueTest: {
                    comparator: '>=',
                    value: '0',
                },
            },
        ];

        ///////// session sigs...

        const sessionSigs = await client.getSessionSigs({
            chain: "ethereum",
            expiration: new Date(Date.now() + 1000 * 60 * 10).toISOString(), // 10 minutes
            resourceAbilityRequests: [
                {
                    resource: new LitActionResource('*'),
                    ability: LitAbility.LitActionExecution,
                },
                {
                    resource: new LitAccessControlConditionResource(
                        await LitAccessControlConditionResource.generateResourceString(
                            accessControlConditions,
                            dataToEncryptHash
                        )
                    ),
                    ability: LitAbility.AccessControlConditionDecryption,
                },
            ],
            authNeededCallback: async ({
                uri,
                expiration,
                resourceAbilityRequests,
            }) => {
                const toSign = await createSiweMessage({
                    uri,
                    expiration,
                    resources: resourceAbilityRequests,
                    walletAddress: ethersWallet.address,
                    nonce: await client.getLatestBlockhash(),
                    litNodeClient: client,
                });

                return await generateAuthSig({
                    signer: ethersWallet,
                    toSign,
                });
            },
        });

        const res = await client.executeJs({
            code,
            sessionSigs: sessionSigs, // your session
            jsParams: {
                accessControlConditions,
                ciphertext,
                dataToEncryptHash
            }
        });
        console.log("decrypted content sent from lit action:", res);

        await client.disconnect();
    }


    const fetchUserIds = async (): Promise<string[]> => {
        // Replace this with your actual API call to fetch user IDs
        return ['user1', 'user2', 'user3', 'user4', 'user5'];
    };

    // Placeholder function to fetch user profile
    const fetchUserProfile = async (address: string): Promise<UserProfile> => {
        console.log("Fetching user profile for user: " + address)
        // Replace this with your actual API call to fetch user profile details
        return {
            address,
            photo: 'https://via.placeholder.com/150',
            location: 'Sample Location',
            profileText: 'This is a sample profile text.'
        };
    };

    useEffect(() => {

        // Load user IDs on component mount
        const loadUserIds = async () => {
            const indexingClient = new IndexService("testnet");
            // const att = await indexingClient.queryAttestation(`onchain_evm_${chainId}_${attId}`);
            //const schemaId_full = "onchain_evm_84532_0x300";
            const schemaId_location = "onchain_evm_84532_0x38b";
            const indexing = "socialfly_app";
            // const res0 = await indexingClient.querySchema(schemaId_location);
            // console.log(res0);
            const res = await indexingClient.queryAttestationList({
                id: "",
                schemaId: "",
                attester: "",
                page: 1,
                mode: "onchain",
                indexingValue: indexing,
            });
            console.log(res);

            //const ids = await fetchUserIds();
            //setAddresses(ids);

            //// Load the first user profile
            //if (ids.length > 0) {
            //    const userProfile = await fetchUserProfile(ids[0]);
            //    setCurrentUser(userProfile);
            //}

        };

        loadUserIds();
    }, []);

    const handleLeftClick = async () => {
        console.log("Left click...")
        if (currentUserIndex > 0) {
            const newIndex = currentUserIndex - 1;
            const newUserProfile = await fetchUserProfile(addresses[newIndex]);
            setCurrentUserIndex(newIndex);
            setCurrentUser(newUserProfile);
        }
    };

    const handleRightClick = async () => {

        console.log("Right click...")

        // Temp - make sure we can call the decrypt...
        await fetchData();


        if (currentUserIndex < addresses.length - 1) {
            const newIndex = currentUserIndex + 1;
            const newUserProfile = await fetchUserProfile(addresses[newIndex]);
            setCurrentUserIndex(newIndex);
            setCurrentUser(newUserProfile);
        }
    };

    return (
        <div style={{ textAlign: 'center', marginTop: '50px' }}>
            {currentUser && (
                <div>
                    <img src={currentUser.photo} alt="User Profile" style={{ width: '150px', borderRadius: '50%' }} />
                    <p>{currentUser.profileText}</p>
                </div>
            )}
            <div>
                <button onClick={handleLeftClick} disabled={currentUserIndex === 0}>
                    Left
                </button>
                <button onClick={() => alert('Connect button clicked')}>Connect</button>
                <button onClick={handleRightClick} disabled={currentUserIndex === addresses.length - 1}>
                    Right
                </button>
            </div>
        </div>
    );
};

