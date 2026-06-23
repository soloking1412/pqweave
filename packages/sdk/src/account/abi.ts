import { parseAbi } from 'viem';

export const pqWeaveAccountAbi = parseAbi([
  'function initialize(address owner, bytes pqcPublicKey, address verifier, uint256 valueThreshold)',
  'function execute(address dest, uint256 value, bytes data)',
  'struct Call { address dest; uint256 value; bytes data; }',
  'function executeBatch(Call[] calls)',
  'function setOwner(address newOwner)',
  'function rotatePqcKey(bytes newPublicKey)',
  'function setVerifier(address newVerifier)',
  'function setValueThreshold(uint256 newThreshold)',
  'function owner() view returns (address)',
  'function valueThreshold() view returns (uint256)',
  'function pqcPublicKey() view returns (bytes)',
  'function pqcVerifier() view returns (address)',
  'function pqcLeafUsed(uint256 leafIndex) view returns (bool)',
]);

export const pqWeaveFactoryAbi = parseAbi([
  'function createAccount(address owner, bytes pqcPublicKey, address verifier, uint256 valueThreshold, bytes32 salt) returns (address)',
  'function getAddress(address owner, bytes pqcPublicKey, address verifier, uint256 valueThreshold, bytes32 salt) view returns (address)',
]);

export const migrationSweeperAbi = parseAbi([
  'struct Erc20Sweep { address token; uint256 amount; }',
  'struct Erc721Sweep { address token; uint256 tokenId; }',
  'struct Erc1155Sweep { address token; uint256 id; uint256 amount; }',
  'function sweep(address to, Erc20Sweep[] erc20s, Erc721Sweep[] erc721s, Erc1155Sweep[] erc1155s)',
]);

export const batchExecutorAbi = parseAbi([
  'struct Call { address target; uint256 value; bytes data; }',
  'function executeBatch(Call[] calls)',
]);

export const erc20Abi = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
]);

export const erc721Abi = parseAbi([
  'function transferFrom(address from, address to, uint256 tokenId)',
]);
