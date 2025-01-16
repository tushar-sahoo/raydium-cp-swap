const fs = require('fs');
const idl = require('./idl');
const {
    Keypair,
    PublicKey,
    Connection,
    Transaction,
    clusterApiUrl,
    LAMPORTS_PER_SOL,
    SystemProgram,
} = require('@solana/web3.js');
const {
    Wallet,
    Program,
    setProvider,
    AnchorProvider,
} = require('@coral-xyz/anchor');
const {
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction,
} = require('@solana/spl-token');
const { utf8 } = require('@coral-xyz/anchor/dist/cjs/utils/bytes');
const { BN } = require('bn.js');

const connection = new Connection(clusterApiUrl('devnet'), 'finalized');
// const connection = new Connection(clusterApiUrl('mainnet-beta'), 'finalized');

const token1Amt = 0.01 * LAMPORTS_PER_SOL; // SOL
const token2Amt = LAMPORTS_PER_SOL; // Other Token

const filePath = process.cwd() + '/owner.json';
const Array = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const keypair = Keypair.fromSecretKey(Uint8Array.from(Array));
const owner = keypair;

const CP_SWAP = idl?.metadata?.address;
const SOL_ADDRESS = 'So11111111111111111111111111111111111111112';

const AMM_CONFIG_SEED = utf8.encode('amm_config');
const POOL_AUTH_SEED = utf8.encode('vault_and_lp_mint_auth_seed');
const POOL_SEED = utf8.encode('pool');
const POOL_VAULT_SEED = utf8.encode('pool_vault');
const POOL_LPMINT_SEED = utf8.encode('pool_lp_mint');

const ammIndex = 0;
const tradeFeeRate = new BN(10);
const protocolFeeRate = new BN(1000);
const fundFeeRate = new BN(25000);
const create_fee = new BN(0);

const createPoolFee = new PublicKey(
    'vA8keeXqc4XBDUkCdTasNg4sWYqRceoEmDqzFUFuB2i'
);

const main = async () => {
    try {
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
        check = await connection.getParsedAccountInfo(solATA);
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

        const [auth] = PublicKey.findProgramAddressSync(
            [POOL_AUTH_SEED],
            new PublicKey(CP_SWAP)
        );

        // const poolIx = await createInstruction('initialize');
    } catch (error) {
        console.error(error);
        console.error('Error in script main');
    }
};

main();

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
        log.red('Error in pump.fun create instruction');
    }
};

const u16ToBytes = (num) => {
    const arr = new ArrayBuffer(2);
    const view = new DataView(arr);
    view.setUint16(0, num, false);
    return new Uint8Array(arr);
};
