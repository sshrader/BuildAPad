// Read-only: lists the pairing tokens pump.fun allows for new coins on this network (the "custom pair" list). Spends nothing.
// Usage (from this folder):  node 14-check-pairs.mjs            (devnet)
//   mainnet:  CLUSTER=mainnet-beta MAINNET_OK=yes RPC_URL=<your mainnet RPC> node 14-check-pairs.mjs
import { createRequire } from 'node:module';
import * as web3 from '@solana/web3.js';
import { connection, CLUSTER } from './lib.mjs';

const require = createRequire(import.meta.url);
const pump = require('../pump.js');
const { PublicKey } = web3;
const B = pump.createBuilder(web3);

const show = async (label, list) => {
  console.log('\n' + label + ': ' + list.length);
  for (const m of list) {
    const addr = m.toBase58();
    const info = await connection.getAccountInfo(new PublicKey(addr)).catch(() => null);
    const prog = info ? (info.owner.toBase58().startsWith('TokenzQ') ? 'Token-2022' : 'SPL Token') : 'not found on this network';
    const dec = info && info.data.length >= 45 ? info.data[44] : '?';
    console.log('  ' + addr + '  ' + prog + '  decimals ' + dec);
  }
};

console.log('Network:', CLUSTER);
const g = await connection.getAccountInfo(B.globalPda());
if (!g) { console.log('pump.fun global account not found on this network.'); process.exit(0); }
const glob = pump.decodeAccount(pump.IDLS.pump, 'Global', g.data, web3);
const white = (glob.whitelisted_quote_mints || []).filter(k => k && k.toBase58 && k.toBase58() !== '11111111111111111111111111111111');
await show('Whitelisted pairs (Global)', white);
console.log('\nmax_curve_depth:', String(glob.max_curve_depth), ' creator_fee_configurable:', String(glob.creator_fee_configurable));

const [qc] = PublicKey.findProgramAddressSync([Buffer.from('quote-control')], new PublicKey(pump.PUMP));
const q = await connection.getAccountInfo(qc);
if (!q) { console.log('\nNo quote-control account on this network (no custom pairs set up).'); process.exit(0); }
const ctl = pump.decodeAccount(pump.IDLS.pump, 'QuoteControl', q.data, web3);
await show('Custom pairs (quote-control)', (ctl.mints || []).map(x => x.mint));
