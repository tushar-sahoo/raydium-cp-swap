const fs = require('fs');
const idl = require('./idl');
const {
    Connection,
    clusterApiUrl,
    PublicKey,
    Transaction,
    LAMPORTS_PER_SOL,
    Keypair,
} = require('@solana/web3.js');
const { AnchorProvider, Program, Wallet, setProvider } = require('@coral-xyz/anchor');
const {
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction,
    TOKEN_PROGRAM_ID,
} = require('@solana/spl-token');
const { BN } = require('bn.js');
const { utf8 } = require('@coral-xyz/anchor/dist/cjs/utils/bytes');

const connection = new Connection(clusterApiUrl('devnet'), 'finalized');

const swapAmount = 0.001 * LAMPORTS_PER_SOL;

const filePath = process.cwd() + '/owner.json';
const Array = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const keypair = Keypair.fromSecretKey(Uint8Array.from(Array));
const owner = keypair;

const CP_SWAP = idl?.metadata?.address;
const SOL_ADDRESS = 'So11111111111111111111111111111111111111112';
const tokenAddress = '12MwBnVsrwoR7kuomPudQzr1tgLp3URFQUoTCF4uj1Pn';

const POOL_SEED = utf8.encode('pool');
const OBS_SEED = utf8.encode('observation');
const AMM_CONFIG_SEED = utf8.encode('amm_config');
const POOL_VAULT_SEED = utf8.encode('pool_vault');
const POOL_AUTH_SEED = utf8.encode('vault_and_lp_mint_auth_seed');

const ammIndex = 0;

const buy = async () => {
    try {
        const tokenIn = new PublicKey(SOL_ADDRESS);
        const tokenOut = new PublicKey(tokenAddress);
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
        const [authority] = PublicKey.findProgramAddressSync(
            [POOL_AUTH_SEED],
            new PublicKey(CP_SWAP)
        );
        const [poolAddress] = PublicKey.findProgramAddressSync(
            [
                POOL_SEED,
                ammConfig.toBuffer(),
                tokenOut.toBuffer(),
                tokenIn.toBuffer(),
            ],
            new PublicKey(CP_SWAP)
        );
        const [inputVault] = PublicKey.findProgramAddressSync(
            [POOL_VAULT_SEED, poolAddress.toBuffer(), tokenIn.toBuffer()],
            new PublicKey(CP_SWAP)
        );
        const [outputVault] = PublicKey.findProgramAddressSync(
            [POOL_VAULT_SEED, poolAddress.toBuffer(), tokenOut.toBuffer()],
            new PublicKey(CP_SWAP)
        );
        const inputTokenAccount = getAssociatedTokenAddressSync(
            tokenIn,
            owner.publicKey
        );
        const outputTokenAccount = getAssociatedTokenAddressSync(
            tokenOut,
            owner.publicKey
        );
        const [observationAddress] = PublicKey.findProgramAddressSync(
            [OBS_SEED, poolAddress.toBuffer()],
            new PublicKey(CP_SWAP)
        );

        const buyArgs = {
            amount_in: new BN(swapAmount),
            minimum_amount_out: new BN(0),
        };

        const buyAccounts = {
            payer: owner.publicKey,
            authority,
            ammConfig,
            poolState: poolAddress,
            inputTokenAccount,
            outputTokenAccount,
            inputVault,
            outputVault,
            inputTokenProgram: TOKEN_PROGRAM_ID,
            outputTokenProgram: TOKEN_PROGRAM_ID,
            inputTokenMint: tokenIn,
            outputTokenMint: tokenOut,
            observationState: observationAddress,
        };

        const buyIx = await createInstruction(
            'swapBaseInput',
            buyAccounts,
            buyArgs
        );
        tx.add(buyIx);

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
        } else {
            console.log(simulate);
            console.log('Error in simulate');
        }
    } catch (err) {
        console.error(err);
        console.log('Error in buy');
    }
};

buy();

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
