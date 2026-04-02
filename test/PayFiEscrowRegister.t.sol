// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PayFiEscrow} from "../contracts/PayFiEscrow.sol";
import {MockERC20} from "../contracts/mocks/MockERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Gateway 入账 + `registerDeposit` 路径（submitter = 本测试合约）
contract PayFiEscrowRegisterTest is Test {
    event EscrowRegistered(
        uint256 indexed id,
        address indexed user,
        address indexed merchant,
        address asset,
        uint256 amountTotal
    );

    PayFiEscrow internal escrow;
    MockERC20 internal token;

    address internal user;
    uint256 internal userPk;
    address internal merchant;
    uint256 internal merchantPk;

    uint256 internal customEscrowId;
    bytes32 internal constant AGREEMENT = bytes32(uint256(0xdef));

    function setUp() public {
        escrow = new PayFiEscrow(address(this));
        token = new MockERC20("Mock USDC", "mUSDC");
        (user, userPk) = makeAddrAndKey("user");
        (merchant, merchantPk) = makeAddrAndKey("merchant");

        customEscrowId = uint256(keccak256(abi.encodePacked("payfi-intent-1")));

        uint128 total = 500e18;
        uint128 per = 100e18;
        uint16 maxR = 5;

        token.mint(address(escrow), total);

        escrow.registerDeposit(
            customEscrowId,
            user,
            merchant,
            IERC20(address(token)),
            total,
            per,
            maxR,
            uint64(block.timestamp + 30 days),
            AGREEMENT,
            address(0)
        );
    }

    function test_register_holds_funds() public view {
        assertEq(token.balanceOf(address(escrow)), 500e18);
        assertEq(escrow.nextEscrowId(), 0);
    }

    function test_register_then_release_dual_sig() public {
        uint256 amount = 100e18;
        bytes32 digest = escrow.releaseDigest(customEscrowId, amount);

        (uint8 v0, bytes32 r0, bytes32 s0) = vm.sign(userPk, digest);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(merchantPk, digest);
        bytes memory userSig = abi.encodePacked(r0, s0, v0);
        bytes memory merchantSig = abi.encodePacked(r1, s1, v1);

        escrow.releaseBySignatures(customEscrowId, amount, userSig, merchantSig);

        assertEq(token.balanceOf(merchant), 100e18);
        assertEq(token.balanceOf(address(escrow)), 400e18);
    }

    function test_register_revert_not_submitter() public {
        PayFiEscrow e = new PayFiEscrow(address(this));
        MockERC20 t = new MockERC20("T", "T");
        t.mint(address(e), 100e18);

        vm.prank(user);
        vm.expectRevert(PayFiEscrow.NotSubmitter.selector);
        e.registerDeposit(
            uint256(keccak256("x")),
            user,
            merchant,
            IERC20(address(t)),
            100e18,
            100e18,
            1,
            uint64(block.timestamp + 1 days),
            bytes32(0),
            address(0)
        );
    }

    function test_register_revert_duplicate_id() public {
        PayFiEscrow e = new PayFiEscrow(address(this));
        MockERC20 t = new MockERC20("T", "T");
        uint256 id = uint256(keccak256("dup"));
        t.mint(address(e), 200e18);

        e.registerDeposit(
            id,
            user,
            merchant,
            IERC20(address(t)),
            100e18,
            100e18,
            1,
            uint64(block.timestamp + 1 days),
            bytes32(0),
            address(0)
        );

        t.mint(address(e), 100e18);
        vm.expectRevert(bytes("exists"));
        e.registerDeposit(
            id,
            user,
            merchant,
            IERC20(address(t)),
            100e18,
            100e18,
            1,
            uint64(block.timestamp + 1 days),
            bytes32(0),
            address(0)
        );
    }

    function test_register_revert_insufficient_balance() public {
        PayFiEscrow e = new PayFiEscrow(address(this));
        MockERC20 t = new MockERC20("T", "T");
        t.mint(address(e), 50e18);

        vm.expectRevert(bytes("insufficient"));
        e.registerDeposit(
            uint256(keccak256("underfunded")),
            user,
            merchant,
            IERC20(address(t)),
            100e18,
            100e18,
            1,
            uint64(block.timestamp + 1 days),
            bytes32(0),
            address(0)
        );
    }

    function test_register_revert_second_when_liability_exceeds_balance() public {
        PayFiEscrow e = new PayFiEscrow(address(this));
        MockERC20 t = new MockERC20("T", "T");
        t.mint(address(e), 500e18);

        e.registerDeposit(
            uint256(keccak256("a")),
            user,
            merchant,
            IERC20(address(t)),
            300e18,
            300e18,
            1,
            uint64(block.timestamp + 1 days),
            bytes32(0),
            address(0)
        );

        vm.expectRevert(bytes("insufficient"));
        e.registerDeposit(
            uint256(keccak256("b")),
            user,
            merchant,
            IERC20(address(t)),
            300e18,
            300e18,
            1,
            uint64(block.timestamp + 1 days),
            bytes32(0),
            address(0)
        );
    }

    function test_EscrowRegistered_event() public {
        PayFiEscrow e = new PayFiEscrow(address(this));
        MockERC20 t = new MockERC20("T", "T");
        uint256 id = uint256(keccak256("evt"));
        t.mint(address(e), 100e18);

        vm.expectEmit(true, true, true, true);
        emit EscrowRegistered(id, user, merchant, address(t), 100e18);

        e.registerDeposit(
            id,
            user,
            merchant,
            IERC20(address(t)),
            100e18,
            100e18,
            1,
            uint64(block.timestamp + 1 days),
            bytes32(0),
            address(0)
        );
    }
}
