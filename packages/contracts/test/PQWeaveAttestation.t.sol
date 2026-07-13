// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PQWeaveAttestation} from "../src/PQWeaveAttestation.sol";

contract PQWeaveAttestationTest is Test {
    PQWeaveAttestation internal attestation;

    bytes32 internal constant ROOT = keccak256("pqc-root");
    string internal constant BTC_ADDR = "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4";

    event Attested(
        address indexed signer,
        bytes32 indexed pqcRoot,
        string btcAddress,
        bytes btcSignature,
        uint64 timestamp
    );

    function setUp() public {
        attestation = new PQWeaveAttestation();
    }

    function test_attestRecordsTimestampAndEmits() public {
        vm.warp(1_800_000_000);
        bytes memory sig = hex"1234";

        vm.expectEmit(true, true, true, true);
        emit Attested(address(this), ROOT, BTC_ADDR, sig, uint64(1_800_000_000));
        attestation.attest(ROOT, BTC_ADDR, sig);

        assertEq(attestation.attestedAt(ROOT), 1_800_000_000);
    }

    function test_reattestUpdatesTimestamp() public {
        vm.warp(1000);
        attestation.attest(ROOT, BTC_ADDR, hex"aa");
        assertEq(attestation.attestedAt(ROOT), 1000);

        vm.warp(2000);
        attestation.attest(ROOT, BTC_ADDR, hex"bb");
        assertEq(attestation.attestedAt(ROOT), 2000);
    }

    function test_rejectsZeroRoot() public {
        vm.expectRevert(PQWeaveAttestation.InvalidRoot.selector);
        attestation.attest(bytes32(0), BTC_ADDR, hex"aa");
    }

    function test_rejectsEmptyAddress() public {
        vm.expectRevert(PQWeaveAttestation.EmptyAddress.selector);
        attestation.attest(ROOT, "", hex"aa");
    }

    function test_unattestedRootReadsZero() public view {
        assertEq(attestation.attestedAt(keccak256("never")), 0);
    }
}
