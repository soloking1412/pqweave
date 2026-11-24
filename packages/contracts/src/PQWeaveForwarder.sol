// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPQCVerifier} from "./interfaces/IPQCVerifier.sol";

/// @title PQWeaveForwarder
/// @notice EIP-7702 delegation target that turns an exposed EOA into a mailbox:
///         the address keeps receiving (exchange withdrawal whitelists, vesting
///         contracts, and counterparties keep working), but value does not rest
///         there — anyone can push it on to the owner's post-quantum account.
///
///         This is transitional protection, not quantum safety. The underlying
///         ECDSA key can always sign a new 7702 authorization and replace this
///         code, so a quantum attacker who recovers the key can uninstall the
///         mailbox. What the mailbox changes is the exposure window: instead of
///         funds sitting on a harvestable key forever, they sit there only until
///         the next flush.
/// @dev One canonical instance is deployed per chain and only ever used as a
///      7702 delegate. `receive()` is deliberately empty so plain `transfer()`
///      withdrawals (2300 gas stipend) from exchange hot wallets do not revert.
///      Storage is ERC-7201 namespaced so a delegation history that includes
///      PQWeaveAccount cannot alias into this contract's state.
contract PQWeaveForwarder {
    /// @custom:storage-location erc7201:pqweave.storage.Forwarder
    struct ForwarderStorage {
        address destination;
        IPQCVerifier verifier;
        bytes32 pqcRoot;
        uint64 destinationNonce;
        bool initialized;
        mapping(uint256 => bool) leafUsed;
    }

    // keccak256(abi.encode(uint256(keccak256("pqweave.storage.Forwarder")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 private constant STORAGE_SLOT =
        0xc2a75ef7f3b619d3cf59498293e1f5771c4fb7ddc789fe8024c88cc292bf5f00;

    bytes32 private constant SET_DESTINATION_TYPEHASH =
        keccak256("pqweave.forwarder.setDestination");

    event Installed(address indexed destination, address verifier);
    event Flushed(address indexed destination, uint256 amount);
    event FlushedERC20(address indexed token, address indexed destination, uint256 amount);
    event ForwardedERC721(address indexed token, uint256 tokenId);
    event ForwardedERC1155(address indexed token, uint256 id, uint256 amount);
    event DestinationChanged(address indexed newDestination, uint64 nonce);

    error NotSelf();
    error AlreadyInitialized();
    error NotInitialized();
    error InvalidDestination();
    error InvalidPqcKey();
    error InvalidVerifier();
    error Erc20TransferFailed(address token);
    error InvalidPqcSignature();
    error PqcLeafReused(uint256 leafIndex);

    /// @dev Deliberately empty: exchange hot wallets often send withdrawals via
    ///      `transfer()` with a 2300-gas stipend, which cannot afford forwarding
    ///      logic. Deposits accumulate here and move on the next `flush()`.
    receive() external payable {}

    /// @notice One-time configuration. Only the EOA itself can call this (via a
    ///         self-call inside its own 7702 transaction), so a reverted install
    ///         cannot leave a delegated-but-claimable account behind.
    function initialize(address destination_, bytes32 pqcRoot_, IPQCVerifier verifier_) public {
        _requireSelf();
        ForwarderStorage storage $ = _storage();
        if ($.initialized) revert AlreadyInitialized();
        if (destination_ == address(0) || destination_ == address(this)) {
            revert InvalidDestination();
        }
        if (pqcRoot_ == bytes32(0)) revert InvalidPqcKey();
        if (address(verifier_).code.length == 0) revert InvalidVerifier();
        $.initialized = true;
        $.destination = destination_;
        $.pqcRoot = pqcRoot_;
        $.verifier = verifier_;
        emit Installed(destination_, address(verifier_));
    }

    /// @notice Install and sweep in the same 7702 transaction: configure the
    ///         mailbox, then push the full native balance and the given ERC-20
    ///         balances to the destination. The sweep IS the flush logic — after
    ///         this transaction the delegation is already in its steady state.
    function initializeAndFlush(
        address destination_,
        bytes32 pqcRoot_,
        IPQCVerifier verifier_,
        address[] calldata erc20s
    ) external {
        initialize(destination_, pqcRoot_, verifier_);
        flush();
        for (uint256 i = 0; i < erc20s.length; i++) {
            flushERC20(erc20s[i]);
        }
    }

    /// @notice Push the full native balance to the destination. Permissionless:
    ///         funds can only ever move to the configured destination, so anyone
    ///         (the owner, a keeper, a well-wisher) may trigger it.
    function flush() public {
        ForwarderStorage storage $ = _storage();
        if (!$.initialized) revert NotInitialized();
        uint256 amount = address(this).balance;
        if (amount == 0) return;
        (bool ok,) = $.destination.call{value: amount}("");
        if (!ok) revert InvalidDestination();
        emit Flushed($.destination, amount);
    }

    /// @notice Push the full balance of an ERC-20 to the destination.
    ///         Permissionless, and tolerant of non-standard tokens that return
    ///         no data (e.g. USDT).
    function flushERC20(address token) public {
        ForwarderStorage storage $ = _storage();
        if (!$.initialized) revert NotInitialized();
        uint256 amount = _erc20BalanceOfSelf(token);
        if (amount == 0) return;
        (bool ok, bytes memory ret) =
            token.call(abi.encodeWithSelector(0xa9059cbb, $.destination, amount));
        if (!ok || (ret.length > 0 && !abi.decode(ret, (bool)))) {
            revert Erc20TransferFailed(token);
        }
        emit FlushedERC20(token, $.destination, amount);
    }

    /// @notice Push an ERC-721 held by this address to the destination.
    /// @dev Uses `transferFrom` so the destination does not need receiver hooks.
    function forwardERC721(address token, uint256 tokenId) external {
        ForwarderStorage storage $ = _storage();
        if (!$.initialized) revert NotInitialized();
        (bool ok,) = token.call(
            abi.encodeWithSignature(
                "transferFrom(address,address,uint256)", address(this), $.destination, tokenId
            )
        );
        if (!ok) revert Erc20TransferFailed(token);
        emit ForwardedERC721(token, tokenId);
    }

    /// @notice Push the full balance of an ERC-1155 id to the destination.
    function forwardERC1155(address token, uint256 id) external {
        ForwarderStorage storage $ = _storage();
        if (!$.initialized) revert NotInitialized();
        (bool okBal, bytes memory balRet) = token.staticcall(
            abi.encodeWithSignature("balanceOf(address,uint256)", address(this), id)
        );
        if (!okBal || balRet.length < 32) revert Erc20TransferFailed(token);
        uint256 amount = abi.decode(balRet, (uint256));
        if (amount == 0) return;
        (bool ok,) = token.call(
            abi.encodeWithSignature(
                "safeTransferFrom(address,address,uint256,uint256,bytes)",
                address(this),
                $.destination,
                id,
                amount,
                ""
            )
        );
        if (!ok) revert Erc20TransferFailed(token);
        emit ForwardedERC1155(token, id, amount);
    }

    /// @notice Point the mailbox at a new destination. Gated by a post-quantum
    ///         signature over `setDestinationDigest(newDestination)` — the ECDSA
    ///         key alone cannot redirect funds (it would have to re-delegate,
    ///         which is visible on-chain, rather than quietly retarget).
    function setDestination(address newDestination, bytes calldata pqcSignature) external {
        ForwarderStorage storage $ = _storage();
        if (!$.initialized) revert NotInitialized();
        if (newDestination == address(0) || newDestination == address(this)) {
            revert InvalidDestination();
        }
        uint256 leafIndex = _leafIndex(pqcSignature);
        if ($.leafUsed[leafIndex]) revert PqcLeafReused(leafIndex);
        bytes32 digest = setDestinationDigest(newDestination);
        if (!$.verifier.verify(digest, abi.encodePacked($.pqcRoot), pqcSignature)) {
            revert InvalidPqcSignature();
        }
        $.leafUsed[leafIndex] = true;
        $.destinationNonce += 1;
        $.destination = newDestination;
        emit DestinationChanged(newDestination, $.destinationNonce);
    }

    /// @notice The digest the post-quantum key signs to authorize a destination
    ///         change. Bound to this chain, this account, and a nonce so a
    ///         signature can never be replayed elsewhere or twice.
    function setDestinationDigest(address newDestination) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                SET_DESTINATION_TYPEHASH,
                block.chainid,
                address(this),
                _storage().destinationNonce,
                newDestination
            )
        );
    }

    // --- Views ---

    function destination() external view returns (address) {
        return _storage().destination;
    }

    function pqcRoot() external view returns (bytes32) {
        return _storage().pqcRoot;
    }

    function pqcVerifier() external view returns (IPQCVerifier) {
        return _storage().verifier;
    }

    function destinationNonce() external view returns (uint64) {
        return _storage().destinationNonce;
    }

    function initialized() external view returns (bool) {
        return _storage().initialized;
    }

    function pqcLeafUsed(uint256 leafIndex) external view returns (bool) {
        return _storage().leafUsed[leafIndex];
    }

    // --- Token receiver hooks (post-7702, safeTransferFrom into the EOA calls these) ---

    function onERC721Received(address, address, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC721Received.selector;
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address,
        address,
        uint256[] calldata,
        uint256[] calldata,
        bytes calldata
    ) external pure returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    // --- Internal helpers ---

    function _storage() private pure returns (ForwarderStorage storage $) {
        assembly {
            $.slot := STORAGE_SLOT
        }
    }

    function _requireSelf() internal view {
        if (msg.sender != address(this)) revert NotSelf();
    }

    function _erc20BalanceOfSelf(address token) internal view returns (uint256) {
        (bool ok, bytes memory ret) =
            token.staticcall(abi.encodeWithSelector(0x70a08231, address(this)));
        if (!ok || ret.length < 32) revert Erc20TransferFailed(token);
        return abi.decode(ret, (uint256));
    }

    function _leafIndex(bytes calldata pqcSignature) internal pure returns (uint256) {
        if (pqcSignature.length < 32) revert InvalidPqcSignature();
        return uint256(bytes32(pqcSignature[0:32]));
    }
}
