// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";
import {LamportMerkleVerifier} from "../src/verifiers/LamportMerkleVerifier.sol";
import {WinternitzMerkleVerifier} from "../src/verifiers/WinternitzMerkleVerifier.sol";

/// @notice Measures what each verifier actually costs, rather than asserting it.
/// @dev Two costs matter, and the measured result was not the expected one.
///
///      - **Calldata.** Lamport must transmit the one-time public key so the
///        verifier can rebuild the Merkle leaf; Winternitz derives it. At 16 gas
///        per non-zero byte this dominates, and it is the expected saving.
///      - **Execution.** Winternitz was expected to be *more* expensive here,
///        since it walks up to (W-1) hash steps per chain rather than doing one
///        hash per message bit. It is not. Lamport hashes a 16 KB one-time public
///        key to commit the leaf and decodes a 24 KB signature to get there, and
///        that outweighs the chain walking.
///
///      A test harness passes the signature in memory, so execution gas alone
///      understates Lamport's real cost. Calldata is priced separately below.
///      Figures at the time of writing, tree depth 2:
///
///        Lamport    24,736 bytes  393,496 calldata  276,566 execution  670,062 total
///        Winternitz  2,304 bytes   35,664 calldata  218,554 execution  254,218 total
contract VerifierGasTest is Test {
    using stdJson for string;

    LamportMerkleVerifier private lamport;
    WinternitzMerkleVerifier private winternitz;

    function setUp() public {
        lamport = new LamportMerkleVerifier();
        winternitz = new WinternitzMerkleVerifier();
    }

    function test_reportVerificationCost() public view {
        (bytes32 lRoot, bytes32 lMsg, bytes memory lSig) = _vector("hashsig");
        (bytes32 wRoot, bytes32 wMsg, bytes memory wSig) = _vector("winternitz");

        uint256 gasBefore = gasleft();
        lamport.verify(lMsg, abi.encodePacked(lRoot), lSig);
        uint256 lamportExecution = gasBefore - gasleft();

        gasBefore = gasleft();
        winternitz.verify(wMsg, abi.encodePacked(wRoot), wSig);
        uint256 winternitzExecution = gasBefore - gasleft();

        uint256 lamportCalldata = _calldataGas(lSig);
        uint256 winternitzCalldata = _calldataGas(wSig);

        console.log("Lamport    bytes / calldata gas / execution gas");
        console.log(lSig.length, lamportCalldata, lamportExecution);
        console.log("Winternitz bytes / calldata gas / execution gas");
        console.log(wSig.length, winternitzCalldata, winternitzExecution);
        console.log("Total gas, Lamport then Winternitz");
        console.log(lamportCalldata + lamportExecution, winternitzCalldata + winternitzExecution);
    }

    /// @dev The claim that motivates the second verifier existing at all.
    function test_winternitzIsCheaperAllIn() public view {
        (bytes32 lRoot, bytes32 lMsg, bytes memory lSig) = _vector("hashsig");
        (bytes32 wRoot, bytes32 wMsg, bytes memory wSig) = _vector("winternitz");

        uint256 gasBefore = gasleft();
        lamport.verify(lMsg, abi.encodePacked(lRoot), lSig);
        uint256 lamportTotal = (gasBefore - gasleft()) + _calldataGas(lSig);

        gasBefore = gasleft();
        winternitz.verify(wMsg, abi.encodePacked(wRoot), wSig);
        uint256 winternitzTotal = (gasBefore - gasleft()) + _calldataGas(wSig);

        assertLt(winternitzTotal, lamportTotal);
    }

    /// @dev EIP-2028 pricing: 16 gas per non-zero byte, 4 per zero byte.
    function _calldataGas(bytes memory data) private pure returns (uint256 gas) {
        for (uint256 i = 0; i < data.length; i++) {
            gas += data[i] == 0 ? 4 : 16;
        }
    }

    function _vector(string memory name)
        private
        view
        returns (bytes32 root, bytes32 message, bytes memory signature)
    {
        string memory json =
            vm.readFile(string.concat(vm.projectRoot(), "/test/vectors/", name, ".json"));
        root = json.readBytes32(".root");
        message = json.readBytes32(".message");
        signature = json.readBytes(".signature");
    }
}
