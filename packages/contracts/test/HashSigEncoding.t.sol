// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {HashSigEncoding} from "../src/libraries/HashSigEncoding.sol";
import {LamportMerkleVerifier} from "../src/verifiers/LamportMerkleVerifier.sol";
import {WinternitzMerkleVerifier} from "../src/verifiers/WinternitzMerkleVerifier.sol";

contract HashSigEncodingTest is Test {
    LamportMerkleVerifier internal lamport = new LamportMerkleVerifier();
    WinternitzMerkleVerifier internal winternitz = new WinternitzMerkleVerifier();

    function valid(bytes calldata signature, uint256 head) external pure returns (bool) {
        return HashSigEncoding.valid(signature, head);
    }

    function encoded(uint256 head, uint256 depth, uint256 index)
        internal
        pure
        returns (bytes memory data)
    {
        data = new bytes((head + 1 + depth) * 32);
        assembly ("memory-safe") {
            mstore(add(data, 32), index)
            mstore(add(data, mul(head, 32)), mul(head, 32))
            mstore(add(data, mul(add(head, 1), 32)), depth)
        }
    }

    function testFuzz_canonicalIndexBounds(bool isLamport, uint8 rawDepth, uint256 index)
        public
        view
    {
        uint256 head = isLamport ? 770 : 69;
        uint256 depth = bound(rawDepth, 0, 12);
        index = bound(index, 0, (uint256(1) << depth) - 1);
        assertTrue(this.valid(encoded(head, depth, index), head));
        assertFalse(this.valid(encoded(head, depth, index + (uint256(1) << depth)), head));
        assertFalse(this.valid(bytes.concat(encoded(head, depth, index), hex"00"), head));
    }

    function test_rejectsOversizedProofBeforeDecode() public view {
        assertFalse(lamport.verify(bytes32(0), abi.encode(bytes32(0)), encoded(770, 13, 0)));
        assertFalse(winternitz.verify(bytes32(0), abi.encode(bytes32(0)), encoded(69, 13, 0)));
    }

    function testFuzz_malformedSignaturesDoNotRevert(bytes calldata signature) public view {
        // Forge's bounded random bytes are smaller than either valid encoding.
        vm.assume(signature.length < 2240);
        assertFalse(lamport.verify(bytes32(0), abi.encode(bytes32(0)), signature));
        assertFalse(winternitz.verify(bytes32(0), abi.encode(bytes32(0)), signature));
    }

    function testFuzz_noncanonicalTailOffsetRejected(uint256 offset) public view {
        vm.assume(offset != 69 * 32);
        bytes memory signature = encoded(69, 0, 0);
        assembly ("memory-safe") { mstore(add(signature, mul(69, 32)), offset) }
        assertFalse(winternitz.verify(bytes32(0), abi.encode(bytes32(0)), signature));
    }
}
