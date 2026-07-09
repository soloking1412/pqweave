// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IAccount, PackedUserOperation} from "./interfaces/IAccount.sol";
import {IPQCVerifier} from "./interfaces/IPQCVerifier.sol";
import {ECDSA} from "./libraries/ECDSA.sol";
import {QuantumPolicy} from "./libraries/QuantumPolicy.sol";

/// @title PQWeaveAccount
/// @notice ERC-4337 account with a configurable post-quantum signature gate,
///         supporting a spectrum of security levels:
///         - Hybrid (default): ECDSA authorizes routine operations; sensitive ones
///           (large transfers, approvals, admin changes) also require a
///           post-quantum signature.
///         - pqcOnly: every operation also requires a post-quantum signature.
///         - Sole authority: with owner == address(0) the ECDSA key is removed
///           from the trust model entirely and the post-quantum key alone
///           authorizes the account — fully quantum-safe, no ECDSA fallback.
/// @dev Designed to be used either as a fresh ERC-4337 account or as the
///      delegation target of an existing EOA under EIP-7702.
contract PQWeaveAccount is IAccount {
    struct Call {
        address dest;
        uint256 value;
        bytes data;
    }

    uint256 internal constant SIG_OK = 0;
    uint256 internal constant SIG_FAILED = 1;

    address public immutable entryPoint;

    /// @notice Who may call `initialize` besides the account itself. For a
    ///         factory-created account this is the factory (which initializes
    ///         atomically at creation). For the canonical EIP-7702 delegate
    ///         instance this is the CREATE2 deployer proxy, which never makes
    ///         calls — so a delegated EOA can only be initialized by its own
    ///         self-call, closing the delegated-but-uninitialized front-run.
    address public immutable deployer;

    /// @notice ECDSA authority. Set to address(0) to remove the ECDSA key from
    ///         the trust model entirely, making the post-quantum key the account's
    ///         sole authority (the maximum-security configuration).
    address public owner;
    /// @notice Merkle root committing to the post-quantum one-time keys.
    bytes public pqcPublicKey;
    /// @notice Verifier used for the post-quantum gate.
    IPQCVerifier public pqcVerifier;
    /// @notice Native value at or above which a post-quantum signature is required.
    uint256 public valueThreshold;
    /// @notice When true, every operation requires a post-quantum signature,
    ///         regardless of the policy. Implied when there is no ECDSA owner.
    bool public pqcOnly;
    /// @notice Consumed post-quantum one-time keys, preventing signature reuse.
    mapping(uint256 => bool) public pqcLeafUsed;

    bool private _initialized;

    event Initialized(
        address indexed owner, address verifier, uint256 valueThreshold, bool pqcOnly
    );
    event OwnerChanged(address indexed newOwner);
    event PqcKeyRotated(bytes newPublicKey);
    event VerifierChanged(address indexed newVerifier);
    event ValueThresholdChanged(uint256 newThreshold);
    event PqcOnlyChanged(bool enabled);
    event Executed(address indexed dest, uint256 value, bytes data);

    error AlreadyInitialized();
    error InvalidPqcKey();
    error InvalidVerifier();
    error NotEntryPoint();
    error NotAuthorized();
    error CallReverted(bytes returnData);

    constructor(address entryPoint_) {
        entryPoint = entryPoint_;
        deployer = msg.sender;
    }

    receive() external payable {}

    /// @notice One-time configuration. For a factory-deployed account this is
    ///         called atomically at creation; for an EIP-7702 EOA the holder
    ///         calls it once, as a self-call, in the same transaction that
    ///         delegates. Guarded because a 7702 authorization persists even if
    ///         the transaction's call reverts — an unguarded initialize would
    ///         let anyone claim a delegated-but-uninitialized account.
    function initialize(
        address owner_,
        bytes calldata pqcPublicKey_,
        IPQCVerifier verifier_,
        uint256 valueThreshold_
    ) external {
        if (msg.sender != deployer && msg.sender != address(this)) revert NotAuthorized();
        if (_initialized) revert AlreadyInitialized();
        if (pqcPublicKey_.length != 32) revert InvalidPqcKey();
        if (address(verifier_) == address(0)) revert InvalidVerifier();
        _initialized = true;
        owner = owner_;
        pqcPublicKey = pqcPublicKey_;
        pqcVerifier = verifier_;
        valueThreshold = valueThreshold_;
        emit Initialized(owner_, address(verifier_), valueThreshold_, pqcOnly);
    }

    // --- ERC-4337 validation ---

    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256 validationData) {
        if (msg.sender != entryPoint) revert NotEntryPoint();

        validationData = _validateSignatures(userOp, userOpHash);
        _payPrefund(missingAccountFunds);
    }

    function _validateSignatures(PackedUserOperation calldata userOp, bytes32 userOpHash)
        internal
        returns (uint256)
    {
        (bytes memory ecdsaSignature, bytes memory pqcSignature) =
            abi.decode(userOp.signature, (bytes, bytes));

        address currentOwner = owner;

        // The ECDSA leg is enforced only when an owner is set. An owner of
        // address(0) removes the (quantum-vulnerable) ECDSA key from the trust
        // model entirely, leaving the post-quantum key as the sole authority.
        if (currentOwner != address(0)) {
            if (ECDSA.recover(_ethSignedHash(userOpHash), ecdsaSignature) != currentOwner) {
                return SIG_FAILED;
            }
        }

        // The post-quantum leg is mandatory when there is no ECDSA owner, when
        // pqcOnly is set, or when the policy classifies the operation as sensitive.
        if (currentOwner == address(0) || pqcOnly || _requiresPqc(userOp.callData)) {
            if (pqcSignature.length < 32) return SIG_FAILED;
            uint256 leafIndex = _leafIndex(pqcSignature);
            if (pqcLeafUsed[leafIndex]) return SIG_FAILED;
            if (!pqcVerifier.verify(userOpHash, pqcPublicKey, pqcSignature)) return SIG_FAILED;
            pqcLeafUsed[leafIndex] = true;
        }

        return SIG_OK;
    }

    function _requiresPqc(bytes calldata callData) internal view returns (bool) {
        if (callData.length < 4) return true;
        bytes4 selector = bytes4(callData[0:4]);

        if (selector == this.execute.selector) {
            (address dest, uint256 value, bytes memory data) =
                abi.decode(callData[4:], (address, uint256, bytes));
            return QuantumPolicy.requiresPqc(valueThreshold, address(this), dest, value, data);
        }

        if (selector == this.executeBatch.selector) {
            Call[] memory calls = abi.decode(callData[4:], (Call[]));
            for (uint256 i = 0; i < calls.length; i++) {
                if (QuantumPolicy.requiresPqc(
                        valueThreshold, address(this), calls[i].dest, calls[i].value, calls[i].data
                    )) {
                    return true;
                }
            }
            return false;
        }

        // Any other selector is an administrative self-call: require PQC.
        return true;
    }

    // --- Execution ---

    function execute(address dest, uint256 value, bytes calldata data) external {
        _requireEntryPointOrSelf();
        _call(dest, value, data);
    }

    function executeBatch(Call[] calldata calls) external {
        _requireEntryPointOrSelf();
        for (uint256 i = 0; i < calls.length; i++) {
            _call(calls[i].dest, calls[i].value, calls[i].data);
        }
    }

    // --- Administration (require a self-call, hence a post-quantum signature) ---

    function setOwner(address newOwner) external {
        _requireSelf();
        owner = newOwner;
        emit OwnerChanged(newOwner);
    }

    function rotatePqcKey(bytes calldata newPublicKey) external {
        _requireSelf();
        if (newPublicKey.length != 32) revert InvalidPqcKey();
        pqcPublicKey = newPublicKey;
        emit PqcKeyRotated(newPublicKey);
    }

    function setVerifier(IPQCVerifier newVerifier) external {
        _requireSelf();
        pqcVerifier = newVerifier;
        emit VerifierChanged(address(newVerifier));
    }

    function setValueThreshold(uint256 newThreshold) external {
        _requireSelf();
        valueThreshold = newThreshold;
        emit ValueThresholdChanged(newThreshold);
    }

    /// @notice Require a post-quantum signature for every operation, not just the
    ///         policy-classified sensitive ones.
    function setPqcOnly(bool enabled) external {
        _requireSelf();
        pqcOnly = enabled;
        emit PqcOnlyChanged(enabled);
    }

    // --- Internal helpers ---

    function _call(address dest, uint256 value, bytes calldata data) internal {
        (bool ok, bytes memory ret) = dest.call{value: value}(data);
        if (!ok) revert CallReverted(ret);
        emit Executed(dest, value, data);
    }

    function _payPrefund(uint256 missingAccountFunds) internal {
        if (missingAccountFunds > 0) {
            (bool ok,) = payable(msg.sender).call{value: missingAccountFunds}("");
            ok; // failure is surfaced by the EntryPoint, per ERC-4337
        }
    }

    function _requireEntryPointOrSelf() internal view {
        if (msg.sender != entryPoint && msg.sender != address(this)) revert NotAuthorized();
    }

    function _requireSelf() internal view {
        if (msg.sender != address(this)) revert NotAuthorized();
    }

    function _ethSignedHash(bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
    }

    function _leafIndex(bytes memory pqcSignature) internal pure returns (uint256 leafIndex) {
        assembly {
            leafIndex := mload(add(pqcSignature, 0x20))
        }
    }
}
