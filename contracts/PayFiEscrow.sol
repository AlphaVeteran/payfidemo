// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IDisputeModule} from "./interfaces/IDisputeModule.sol";

/// @title PayFiEscrow
/// @notice 多笔 escrowId；双签按次释放；到期退款给用户。与 API EIP-712 域名 PayFiEscrowDemo / v1 对齐。
contract PayFiEscrow is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 private constant RELEASE_TYPEHASH = keccak256(
        "Release(uint256 escrowId,uint256 nonce,uint256 amount,address merchant,bytes32 agreementHash)"
    );

    uint8 private constant STATUS_ACTIVE = 0;
    uint8 private constant STATUS_REFUNDED = 1;
    uint8 private constant STATUS_SETTLED = 2;

    struct Escrow {
        address user;
        address merchant;
        IERC20 asset;
        uint128 amountTotal;
        uint128 amountPerLesson;
        uint16 maxReleases;
        uint16 releaseCount;
        uint128 releasedTotal;
        uint64 expiresAt;
        uint8 status;
        uint256 releaseNonce;
        bytes32 agreementHash;
        address disputeModule;
    }

    mapping(uint256 => Escrow) public escrows;
    uint256 public nextEscrowId;

    event EscrowCreated(
        uint256 indexed id,
        address indexed user,
        address indexed merchant,
        address asset,
        uint256 amountTotal,
        uint64 expiresAt,
        bytes32 agreementHash
    );
    event Released(uint256 indexed id, uint256 indexed nonce, uint256 amount);
    event Refunded(uint256 indexed id, address indexed user, uint256 amount);

    constructor() EIP712("PayFiEscrowDemo", "1") {}

    /// @param disputeModule_ 可 address(0)；非零则在 release 前调用 canRelease
    function createAndDeposit(
        address merchant_,
        IERC20 asset_,
        uint128 amountTotal_,
        uint128 amountPerLesson_,
        uint16 maxReleases_,
        uint64 durationSeconds_,
        bytes32 agreementHash_,
        address disputeModule_
    ) external nonReentrant returns (uint256 id) {
        require(merchant_ != address(0), "merchant");
        require(address(asset_) != address(0), "asset");
        require(amountTotal_ > 0 && amountPerLesson_ > 0, "amounts");
        require(maxReleases_ > 0, "maxReleases");
        require(
            uint256(maxReleases_) * uint256(amountPerLesson_) == uint256(amountTotal_),
            "totalMismatch"
        );
        require(durationSeconds_ > 0, "duration");

        id = ++nextEscrowId;
        uint64 exp = uint64(block.timestamp + durationSeconds_);
        escrows[id] = Escrow({
            user: msg.sender,
            merchant: merchant_,
            asset: asset_,
            amountTotal: amountTotal_,
            amountPerLesson: amountPerLesson_,
            maxReleases: maxReleases_,
            releaseCount: 0,
            releasedTotal: 0,
            expiresAt: exp,
            status: STATUS_ACTIVE,
            releaseNonce: 0,
            agreementHash: agreementHash_,
            disputeModule: disputeModule_
        });

        asset_.safeTransferFrom(msg.sender, address(this), amountTotal_);

        emit EscrowCreated(id, msg.sender, merchant_, address(asset_), amountTotal_, exp, agreementHash_);
    }

    /// @notice 与 `releaseDigest` 使用相同结构；amount 须等于 amountPerLesson（MVP）
    function releaseBySignatures(
        uint256 escrowId,
        uint256 amount,
        bytes calldata userSig,
        bytes calldata merchantSig
    ) external nonReentrant {
        Escrow storage e = escrows[escrowId];
        require(e.user != address(0), "noEscrow");
        require(e.status == STATUS_ACTIVE, "badStatus");
        require(block.timestamp < e.expiresAt, "expired");
        require(e.releaseCount < e.maxReleases, "maxReleases");
        require(amount == uint256(e.amountPerLesson), "amount");

        if (e.disputeModule != address(0)) {
            require(IDisputeModule(e.disputeModule).canRelease(escrowId), "dispute");
        }

        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    RELEASE_TYPEHASH,
                    escrowId,
                    e.releaseNonce,
                    amount,
                    e.merchant,
                    e.agreementHash
                )
            )
        );

        address recoveredUser = ECDSA.recover(digest, userSig);
        address recoveredMerchant = ECDSA.recover(digest, merchantSig);
        require(recoveredUser == e.user && recoveredMerchant == e.merchant, "sig");

        unchecked {
            e.releaseNonce++;
            e.releaseCount++;
            e.releasedTotal += uint128(amount);
        }

        if (e.releasedTotal >= e.amountTotal) {
            e.status = STATUS_SETTLED;
        }

        e.asset.safeTransfer(e.merchant, amount);

        emit Released(escrowId, e.releaseNonce - 1, amount);
    }

    function refund(uint256 escrowId) external nonReentrant {
        Escrow storage e = escrows[escrowId];
        require(e.user != address(0), "noEscrow");
        require(e.status == STATUS_ACTIVE, "badStatus");
        require(block.timestamp >= e.expiresAt, "notExpired");

        uint256 rem = uint256(e.amountTotal) - uint256(e.releasedTotal);
        require(rem > 0, "nothing");

        e.status = STATUS_REFUNDED;
        e.asset.safeTransfer(e.user, rem);

        emit Refunded(escrowId, e.user, rem);
    }

    /// @dev 供链下 / 测试构造与合约一致的 EIP-712 digest
    function releaseDigest(uint256 escrowId, uint256 amount) external view returns (bytes32) {
        Escrow storage e = escrows[escrowId];
        require(e.user != address(0), "noEscrow");
        return
            _hashTypedDataV4(
                keccak256(
                    abi.encode(
                        RELEASE_TYPEHASH,
                        escrowId,
                        e.releaseNonce,
                        amount,
                        e.merchant,
                        e.agreementHash
                    )
                )
            );
    }
}
