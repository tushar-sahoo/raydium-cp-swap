const fs = require('fs');
const idl = require('./idl');
const {
    Keypair,
    PublicKey,
    Connection,
    Transaction,
    SystemProgram,
    clusterApiUrl,
    LAMPORTS_PER_SOL,
    SYSVAR_RENT_PUBKEY,
} = require('@solana/web3.js');
const {
    Wallet,
    Program,
    setProvider,
    AnchorProvider,
} = require('@coral-xyz/anchor');
const {
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction,
} = require('@solana/spl-token');
const { utf8 } = require('@coral-xyz/anchor/dist/cjs/utils/bytes');
const { BN } = require('bn.js');

const connection = new Connection(clusterApiUrl('devnet'), 'finalized');
// const connection = new Connection(clusterApiUrl('mainnet-beta'), 'finalized');

const token0Amt = LAMPORTS_PER_SOL; // Other Token
const token1Amt = 0.01 * LAMPORTS_PER_SOL; // SOL

const filePath = process.cwd() + '/owner.json';
const Array = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const keypair = Keypair.fromSecretKey(Uint8Array.from(Array));
const owner = keypair;

const CP_SWAP = idl?.metadata?.address;
const SOL_ADDRESS = 'So11111111111111111111111111111111111111112';
const tokenAddress = '12MwBnVsrwoR7kuomPudQzr1tgLp3URFQUoTCF4uj1Pn';

const AMM_CONFIG_SEED = utf8.encode('amm_config');
const POOL_AUTH_SEED = utf8.encode('vault_and_lp_mint_auth_seed');
const POOL_SEED = utf8.encode('pool');
const POOL_VAULT_SEED = utf8.encode('pool_vault');
const POOL_LPMINT_SEED = utf8.encode('pool_lp_mint');
const OBS_SEED = utf8.encode('observation');

const ammIndex = 0;
const tradeFeeRate = new BN(10);
const protocolFeeRate = new BN(1000);
const fundFeeRate = new BN(25000);
const create_fee = new BN(0);

const createPoolFee = new PublicKey(
    'vA8keeXqc4XBDUkCdTasNg4sWYqRceoEmDqzFUFuB2i'
);

const createPool = async () => {
    try {
        const tokenMint0 = new PublicKey(tokenAddress);
        const tokenMint1 = new PublicKey(SOL_ADDRESS);
        const tx = new Transaction();
        const solATA = getAssociatedTokenAddressSync(
            new PublicKey(SOL_ADDRESS),
            owner.publicKey
        );
        let check = await connection.getParsedAccountInfo(solATA);
        if (check.value == null) {
            const createIx = createAssociatedTokenAccountInstruction(
                owner.publicKey,
                solATA,
                owner.publicKey,
                new PublicKey(SOL_ADDRESS)
            );
            tx.add(createIx);
        }

        const [ammConfig] = PublicKey.findProgramAddressSync(
            [AMM_CONFIG_SEED, u16ToBytes(ammIndex)],
            new PublicKey(CP_SWAP)
        );
        console.log(ammConfig.toBase58());
        check = await connection.getParsedAccountInfo(ammConfig);
        console.log(check);
        if (check.value == null) {
            const ammAccount = {
                owner: owner.publicKey,
                ammConfig,
                systemProgram: SystemProgram.programId,
            };
            const ammArgs = {
                ammIndex,
                tradeFeeRate,
                protocolFeeRate,
                fundFeeRate,
                create_fee,
            };
            const ammConfigIx = await createInstruction(
                'createAmmConfig',
                ammAccount,
                ammArgs
            );
            tx.add(ammConfigIx);
        }

        const [authority] = PublicKey.findProgramAddressSync(
            [POOL_AUTH_SEED],
            new PublicKey(CP_SWAP)
        );
        const [poolAddress] = PublicKey.findProgramAddressSync(
            [
                POOL_SEED,
                ammConfig.toBuffer(),
                tokenMint0.toBuffer(),
                tokenMint1.toBuffer(),
            ],
            new PublicKey(CP_SWAP)
        );
        const [lpMintAddress] = PublicKey.findProgramAddressSync(
            [POOL_LPMINT_SEED, poolAddress.toBuffer()],
            new PublicKey(CP_SWAP)
        );
        const [vault0] = PublicKey.findProgramAddressSync(
            [POOL_VAULT_SEED, poolAddress.toBuffer(), tokenMint0.toBuffer()],
            new PublicKey(CP_SWAP)
        );
        const [vault1] = PublicKey.findProgramAddressSync(
            [POOL_VAULT_SEED, poolAddress.toBuffer(), tokenMint1.toBuffer()],
            new PublicKey(CP_SWAP)
        );
        const [creatorLpTokenAddress] = PublicKey.findProgramAddressSync(
            [
                owner.publicKey.toBuffer(),
                TOKEN_PROGRAM_ID.toBuffer(),
                lpMintAddress.toBuffer(),
            ],
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
        const [observationAddress] = PublicKey.findProgramAddressSync(
            [OBS_SEED, poolAddress.toBuffer()],
            new PublicKey(CP_SWAP)
        );
        const creatorToken0 = getAssociatedTokenAddressSync(
            tokenMint0,
            owner.publicKey
        );
        const creatorToken1 = getAssociatedTokenAddressSync(
            tokenMint1,
            owner.publicKey
        );

        const initArgs = {
            initAmount0: new BN(token0Amt),
            initAmount1: new BN(token1Amt),
            openTime: new BN(0),
        };
        const initAccounts = {
            creator: owner.publicKey,
            ammConfig,
            authority,
            poolState: poolAddress,
            token0Mint: tokenMint0,
            token1Mint: tokenMint1,
            lpMint: lpMintAddress,
            creatorToken0,
            creatorToken1,
            creatorLpToken: creatorLpTokenAddress,
            token0Vault: vault0,
            token1Vault: vault1,
            createPoolFee,
            observationState: observationAddress,
            tokenProgram: TOKEN_PROGRAM_ID,
            token0Program: TOKEN_PROGRAM_ID,
            token1Program: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
        };
        const poolIx = await createInstruction(
            'initialize',
            initAccounts,
            initArgs
        );
        tx.add(poolIx);

        const blockhash = await connection.getLatestBlockhash('finalized');
        tx.recentBlockhash = blockhash.blockhash;
        tx.feePayer = owner.publicKey;
        tx.lastValidBlockHeight = blockhash.blockHeight;

        tx.sign(owner);

        const simulate = await connection.simulateTransaction(tx);
        if (simulate?.value?.err === null) {
            const signature = await connection.sendTransaction(tx, [owner], {
                skipPreflight: true,
            });
            console.log(signature);
            const confirm = await connection.confirmTransaction(signature);
            console.log(confirm);
            console.log(poolAddress.toBase58());
        } else {
            console.log(simulate);
            console.log('Error in simulate');
            console.log(poolAddress.toBase58());
        }
    } catch (error) {
        console.error(error);
        console.error('Error in createPool');
    }
};

const checkPool = async (poolAddress) => {
    try {
        const wallet = new Wallet(owner);

        const provider = new AnchorProvider(
            connection,
            wallet,
            AnchorProvider.defaultOptions()
        );
        setProvider(provider);

        const program = new Program(idl, new PublicKey(CP_SWAP), provider);

        poolAddress = new PublicKey(poolAddress);
        const poolState = await program.account.poolState.fetch(poolAddress);
        console.log({ poolState });
    } catch (error) {
        console.error(error);
        console.error('Error in checkPool');
    }
};

createPool();
checkPool('GACx4VrNtFUbu1aHt8pzecDDPCKbpJR3Pdqwqudwyv23');

// HELPERS
const createInstruction = async (functionName, accounts, args) => {
    try {
        const wallet = new Wallet(owner);

        const provider = new AnchorProvider(
            connection,
            wallet,
            AnchorProvider.defaultOptions()
        );
        setProvider(provider);

        const program = new Program(idl, new PublicKey(CP_SWAP), provider);

        const instructions = await program.methods[functionName](
            ...Object.values(args)
        )
            .accounts(accounts)
            .instruction();

        return instructions;
    } catch (error) {
        console.error(error);
        console.error('Error in create instruction');
    }
};

const u16ToBytes = (num) => {
    const arr = new ArrayBuffer(2);
    const view = new DataView(arr);
    view.setUint16(0, num, false);
    return new Uint8Array(arr);
};
