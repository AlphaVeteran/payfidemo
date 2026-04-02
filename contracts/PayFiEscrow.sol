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
/// @dev 支持两种入金：`createAndDeposit`（用户 transferFrom）与 `registerDeposit`（仅 submitter；资金已由 Gateway EIP-3009 转入本合约后登记）。
contract PayFiEscrow is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 private constant RELEASE_TYPEHASH = keccak256(
        "Release(uint256 escrowId,uint256 nonce,uint256 amount,address merchant,bytes32 agreementHash)"
    );

    uint8 private constant STATUS_ACTIVE = 0;
    uint8 private constant STATUS_REFUNDED = 1;
    uint8 private constant STATUS_SETTLED = 2;

    /// @notice 可调用 `registerDeposit` 的后端 / 运营地址（HashKey 流程下绑定链上 intent ↔ escrow）
    address public immutable submitter;

    /// @notice 按资产累计的「未清偿托管义务」用于校验 Gateway 入账后余额是否覆盖新 escrow
    mapping(IERC20 => uint256) private liabilityPerAsset;

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

    event EscrowRegistered(
        uint256 indexed id,
        address indexed user,
        address indexed merchant,
        address asset,
        uint256 amountTotal
    );

    error NotSubmitter();

    modifier onlySubmitter() {
        if (msg.sender != submitter) revert NotSubmitter();
        _;
    }

    constructor(address submitter_) EIP712("PayFiEscrowDemo", "1") {
        require(submitter_ != address(0), "submitter");
        submitter = submitter_;
    }

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

        liabilityPerAsset[asset_] += uint256(amountTotal_);

        emit EscrowCreated(
            id, msg.sender, merchant_, address(asset_), amountTotal_, exp, agreementHash_
        );
    }

    /// @notice Gateway 已将 `amountTotal_` 转入本合约后，由 submitter 登记 escrow（如 `escrowId = uint256(keccak256(abi.encodePacked(intentId)))`）
    function registerDeposit(
        uint256 escrowId,
        address user_,
        address merchant_,
        IERC20 asset_,
        uint128 amountTotal_,
        uint128 amountPerLesson_,
        uint16 maxReleases_,
        uint64 expiresAt_,
        bytes32 agreementHash_,
        address disputeModule_
    ) external onlySubmitter nonReentrant {
        require(escrows[escrowId].user == address(0), "exists");
        require(user_ != address(0), "user");
        require(merchant_ != address(0), "merchant");
        require(address(asset_) != address(0), "asset");
        require(amountTotal_ > 0 && amountPerLesson_ > 0, "amounts");
        require(maxReleases_ > 0, "maxReleases");
        require(
            uint256(maxReleases_) * uint256(amountPerLesson_) == uint256(amountTotal_),
            "totalMismatch"
        );
        require(expiresAt_ > block.timestamp, "expires");

        uint256 bal = IERC20(asset_).balanceOf(address(this));
        uint256 liab = liabilityPerAsset[asset_];
        require(bal >= liab + uint256(amountTotal_), "insufficient");

        escrows[escrowId] = Escrow({
            user: user_,
            merchant: merchant_,
            asset: asset_,
            amountTotal: amountTotal_,
            amountPerLesson: amountPerLesson_,
            maxReleases: maxReleases_,
            releaseCount: 0,
            releasedTotal: 0,
            expiresAt: expiresAt_,
            status: STATUS_ACTIVE,
            releaseNonce: 0,
            agreementHash: agreementHash_,
            disputeModule: disputeModule_
        });

        liabilityPerAsset[asset_] = liab + uint256(amountTotal_);

        emit EscrowRegistered(escrowId, user_, merchant_, address(asset_), uint256(amountTotal_));
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
                    RELEASE_TYPEHASH, escrowId, e.releaseNonce, amount, e.merchant, e.agreementHash
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

        liabilityPerAsset[e.asset] -= amount;

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

        liabilityPerAsset[e.asset] -= rem;

        emit Refunded(escrowId, e.user, rem);
    }

    /// @dev 供链下 / 测试构造与合约一致的 EIP-712 digest
    function releaseDigest(uint256 escrowId, uint256 amount) external view returns (bytes32) {
        Escrow storage e = escrows[escrowId];
        require(e.user != address(0), "noEscrow");
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    RELEASE_TYPEHASH, escrowId, e.releaseNonce, amount, e.merchant, e.agreementHash
                )
            )
        );
    }
}
