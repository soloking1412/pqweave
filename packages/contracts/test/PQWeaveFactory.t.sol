// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PQWeaveAccount} from "../src/PQWeaveAccount.sol";
import {PQWeaveFactory} from "../src/PQWeaveFactory.sol";
import {LamportMerkleVerifier} from "../src/verifiers/LamportMerkleVerifier.sol";

contract PQWeaveFactoryTest is Test {
    PQWeaveFactory internal factory;
    LamportMerkleVerifier internal verifier;

    address internal entryPoint = makeAddr("entryPoint");
    address internal owner = makeAddr("owner");
    bytes internal pqcKey = abi.encodePacked(keccak256("pqc-root"));
    uint256 internal threshold = 1 ether;
    bytes32 internal salt = keccak256("user-salt");

    function setUp() public {
        factory = new PQWeaveFactory(entryPoint);
        verifier = new LamportMerkleVerifier();
    }

    function test_deploysAtPredictedAddress() public {
        address predicted = factory.getAddress(owner, pqcKey, verifier, threshold, salt);
        PQWeaveAccount account = factory.createAccount(owner, pqcKey, verifier, threshold, salt);

        assertEq(address(account), predicted);
        assertGt(predicted.code.length, 0);
        assertEq(account.owner(), owner);
        assertEq(account.valueThreshold(), threshold);
        assertEq(address(account.pqcVerifier()), address(verifier));
    }

    function test_createIsIdempotent() public {
        PQWeaveAccount first = factory.createAccount(owner, pqcKey, verifier, threshold, salt);
        PQWeaveAccount second = factory.createAccount(owner, pqcKey, verifier, threshold, salt);
        assertEq(address(first), address(second));
    }
}
