const fs = require('fs');
const idl = require('./idl');
const {
    Keypair,
    PublicKey,
    Connection,
    Transaction,
    clusterApiUrl,
} = require('@solana/web3.js');
const {
    Wallet,
    Program,
    setProvider,
    AnchorProvider,
} = require('@coral-xyz/anchor');
const {
    TOKEN_PROGRAM_ID,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction,
} = require('@solana/spl-token');
const { utf8 } = require('@coral-xyz/anchor/dist/cjs/utils/bytes');
const { BN } = require('bn.js');

const connection = new Connection(clusterApiUrl('devnet'), 'finalized');

const filePath = process.cwd() + '/owner.json';
const Array = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const keypair = Keypair.fromSecretKey(Uint8Array.from(Array));
const owner = keypair;

const CP_SWAP = idl?.metadata?.address;
const SOL_ADDRESS = 'So11111111111111111111111111111111111111112';
const tokenAddress = '12MwBnVsrwoR7kuomPudQzr1tgLp3URFQUoTCF4uj1Pn';

const POOL_SEED = utf8.encode('pool');
const AMM_CONFIG_SEED = utf8.encode('amm_config');
const POOL_VAULT_SEED = utf8.encode('pool_vault');
const POOL_LPMINT_SEED = utf8.encode('pool_lp_mint');
const POOL_AUTH_SEED = utf8.encode('vault_and_lp_mint_auth_seed');

const ammIndex = 0;

const remove = async () => {
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
        const [ownerLpToken] = PublicKey.findProgramAddressSync(
            [
                owner.publicKey.toBuffer(),
                TOKEN_PROGRAM_ID.toBuffer(),
                lpMintAddress.toBuffer(),
            ],
            ASSOCIATED_TOKEN_PROGRAM_ID
        );
        const ownerToken0 = getAssociatedTokenAddressSync(
            tokenMint0,
            owner.publicKey
        );
        const ownerToken1 = getAssociatedTokenAddressSync(
            tokenMint1,
            owner.publicKey
        );

        const balance = await connection.getTokenAccountBalance(ownerLpToken);
        const liquidity = new BN(balance.value.amount);

        const removeArgs = {
            lp_token_amount: liquidity,
            min_token0_amount: new BN(0),
            min_token1_amount: new BN(0),
        };
        const removeAccounts = {
            owner: owner.publicKey,
            authority,
            poolState: poolAddress,
            ownerLpToken,
            token0Account: ownerToken0,
            token1Account: ownerToken1,
            token0Vault: vault0,
            token1Vault: vault1,
            tokenProgram: TOKEN_PROGRAM_ID,
            tokenProgram2022: TOKEN_2022_PROGRAM_ID,
            vault0Mint: tokenMint0,
            vault1Mint: tokenMint1,
            lpMint: lpMintAddress,
            memoProgram: new PublicKey(
                'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
            ),
        };
        const removeIx = await createInstruction(
            'withdraw',
            removeAccounts,
            removeArgs
        );
        tx.add(removeIx);

        const blockhash = await connection.getLatestBlockhash('finalized');

        tx.recentBlockhash = blockhash.blockhash;
        tx.feePayer = owner.publicKey;

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
    } catch (e) {
        console.error(e);
        console.error('Error in remove');
    }
};

remove();

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
