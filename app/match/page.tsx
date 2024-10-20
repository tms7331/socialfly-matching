"use client"
import { useState, useEffect } from 'react';
import { LitNetwork, LIT_RPC } from "@lit-protocol/constants";
import { LitActionResource } from "@lit-protocol/auth-helpers";
import { LitNodeClient } from "@lit-protocol/lit-node-client";
import {
    createSiweMessage,
    generateAuthSig,
    LitAbility,
    LitAccessControlConditionResource,
} from "@lit-protocol/auth-helpers";
import {
    IndexService,
    decodeOnChainData,
    DataLocationOnChain,
    SchemaItem
} from "@ethsign/sp-sdk";
import { ethers } from 'ethers';


const indexing = "socialfly_app_0";


interface EncryptedData {
    ciphertext: string;
    dataToEncryptHash: string;
}

interface UserProfile {
    address: string;
    photo: string;
    profileText: string;
}

const accessControlConditions = [
    {
        contractAddress: '',
        standardContractType: '',
        chain: 'sepolia',
        method: 'eth_getBalance',
        parameters: [
            ':userAddress',
            'latest'
        ],
        returnValueTest: {
            comparator: '>=',
            value: '0'
        }
    }
]

const code = `(async () => {
  const resp = await Lit.Actions.decryptAndCombine({
    accessControlConditions,
    ciphertext: ciphertextLoc,
    dataToEncryptHash: dataToEncryptHashLoc,
    authSig: null,
    chain: 'ethereum',
  });
    const parsedData = JSON.parse(resp);
    const latitude = parseFloat(parsedData.latitude);
    const longitude = parseFloat(parsedData.longitude);
    const diffLat = latitude - parseFloat(myLatitude);
    const diffLong = longitude - parseFloat(myLongitude);
    const distance = Math.sqrt(diffLat * diffLat + diffLong * diffLong);
    if (distance > 50) {
        Lit.Actions.setResponse({ response: "Too far away!" });
    }
    else {
        const resp2 = await Lit.Actions.decryptAndCombine({
            accessControlConditions,
            ciphertext: ciphertextBio,
            dataToEncryptHash: dataToEncryptHashBio,
            authSig: null,
            chain: 'ethereum',
        });
        Lit.Actions.setResponse({ response: resp2 });
    }
})();`

const encryptedLocMap: Record<string, EncryptedData> = {};
const encryptedBioMap: Record<string, EncryptedData> = {};

export default function MatchPage() {
    const [addresses, setAddresses] = useState<string[]>([]);
    const [currentUserIndex, setCurrentUserIndex] = useState<number>(0);
    const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

    const client = new LitNodeClient({
        litNetwork: LitNetwork.DatilDev,
        debug: true
    });

    const fetchData = async (ciphertextLoc: string, dataToEncryptHashLoc: string,
        ciphertextBio: string, dataToEncryptHashBio: string,
        myLatitude: string, myLongitude: string
    ) => {
        await client.connect();
        // NEXT_PUBLIC_PK
        const PK = process.env.NEXT_PUBLIC_PK;
        // const wallet = await genWallet();

        const ethersWallet = new ethers.Wallet(
            PK, // Make sure to set this in your .env file
            new ethers.providers.JsonRpcProvider(LIT_RPC.CHRONICLE_YELLOWSTONE)
        );

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
                            dataToEncryptHashLoc
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
                ciphertextLoc,
                dataToEncryptHashLoc,
                ciphertextBio,
                dataToEncryptHashBio,
                myLatitude,
                myLongitude
            }
        });

        console.log("decrypted content sent from lit action:", res);
        await client.disconnect();
        return res;
    }

    const fetchUserProfile = async (address: string): Promise<UserProfile> => {
        console.log("Fetching user profile for user: " + address)

        // print keys in encryptedDataMap
        //console.log(Object.keys(encryptedDataMap));
        const location = encryptedLocMap[address];
        const bio = encryptedBioMap[address];
        console.log(location);
        console.log(bio);

        // const locationRes = await fetchData(location.ciphertext, location.dataToEncryptHash);
        // const bioRes = await fetchData(bio.ciphertext, bio.dataToEncryptHash);

        // Get our live location
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(asyncSuccessCallback, errorCallback);
        } else {
            console.error("Geolocation is not supported by this browser.");
        }


        async function asyncSuccessCallback(position) {
            try {
                const latitude = position.coords.latitude;
                const longitude = position.coords.longitude;
                console.log(`Latitude: ${latitude}, Longitude: ${longitude}`);

                const res = await fetchData(location.ciphertext, location.dataToEncryptHash, bio.ciphertext, bio.dataToEncryptHash, latitude, longitude);
                console.log(res);
                //console.log(bioRes);
                const newUserProfile = {
                    address,
                    photo: 'https://via.placeholder.com/150',
                    profileText: res.response
                };
                setCurrentUser(newUserProfile);


            } catch (error) {
                console.error("Error during async operation:", error);
            }
        }

        function errorCallback(error) {
            console.error(`Error: ${error.message}`);
        }





    };

    useEffect(() => {

        // Load user IDs on component mount
        const loadUserIds = async () => {
            const indexingClient = new IndexService("testnet");
            // const att = await indexingClient.queryAttestation(`onchain_evm_${chainId}_${attId}`);
            //const schemaId_full = "onchain_evm_84532_0x300";
            const schemaId_location = "onchain_evm_84532_0x38b";
            const schemaId_bio = "onchain_evm_84532_0x389"

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
            // Get set of attesters from res.rows
            const attesters = new Set(res!.rows.map(row => row.attester));
            // Now make it a list
            setAddresses(Array.from(attesters));
            // Now we need a map from each address to the location and bio
            for (const item of res!.rows) {
                const address = item.attester;
                const dec = decodeOnChainData(item.data, DataLocationOnChain.ONCHAIN, item.schema.data as SchemaItem[]);
                // console.log(dec)
                // And now fill in our map
                if (item.fullSchemaId == schemaId_location) {
                    console.log("location found!", address)
                    encryptedLocMap[address] = { ciphertext: dec.ciphertext, dataToEncryptHash: dec.dataToEncryptHash };
                }
                else if (item.fullSchemaId == schemaId_bio) {
                    console.log("bio found!")
                    encryptedBioMap[address] = { ciphertext: dec.ciphertext, dataToEncryptHash: dec.dataToEncryptHash };
                }

            }

            // use attester and id to create two arrays that match up?
            // filter out our own address

            // yeah then work on the decryption condition, same logic..




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

        if (currentUserIndex < addresses.length - 1) {
            const newIndex = currentUserIndex + 1;
            const newUserProfile = await fetchUserProfile(addresses[newIndex]);
            setCurrentUserIndex(newIndex);
            setCurrentUser(newUserProfile);
        }
    };

    return (
        <div className="flex flex-col items-center mt-12">
            {currentUser && (
                <div className="flex flex-col items-center">
                    <img
                        src={currentUser.photo}
                        alt="User Profile"
                        className="w-36 h-36 rounded-full object-cover"
                    />
                    <p className="mt-4 text-lg">{currentUser.profileText}</p>
                </div>
            )}
            <div className="flex mt-6 space-x-4">
                <button
                    onClick={handleLeftClick}
                    disabled={currentUserIndex === 0}
                    className="px-4 py-2 bg-blue-500 text-white rounded-md disabled:bg-gray-300"
                >
                    Left
                </button>
                <button
                    onClick={() => alert("For now you'll have to imagine you connected")}
                    className="px-4 py-2 bg-green-500 text-white rounded-md"
                >
                    Connect
                </button>
                <button
                    onClick={handleRightClick}
                    disabled={currentUserIndex === addresses.length - 1}
                    className="px-4 py-2 bg-blue-500 text-white rounded-md disabled:bg-gray-300"
                >
                    Right
                </button>
            </div>
        </div>

    );
};

