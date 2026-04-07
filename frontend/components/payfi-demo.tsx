"use client";

import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSendTransaction,
  useSignTypedData,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { useSearchParams } from "next/navigation";
import {
  erc20Abi,
  getAddress,
  parseUnits,
  recoverTypedDataAddress,
  type PublicClient,
} from "viem";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n";
import {
  createIntent,
  fundingHint,
  getIntent,
  postFundingTx,
  releasePrepare,
  releaseSubmit,
  type IntentRecord,
  type ReleasePrepareResponse,
} from "@/lib/payfi-api";
import { domainFromApi, releaseMessageFromApi } from "@/lib/release-typed-data";
import { targetChain, targetChainId } from "@/lib/wagmi-config";
import { baseSepolia } from "wagmi/chains";
import {
  BASE_SEPOLIA_USDC_ADDRESS,
  BASE_SEPOLIA_USDC_DECIMALS,
  defaultDemoAssetAddress,
} from "@/lib/token-addresses";

/** Anvil + Rabby：RPC/链不一致或重启链后，旧 tx 会表现为长时间等不到回执。 */
async function waitTxReceipt(client: PublicClient, hash: `0x${string}`) {
  try {
    return await client.waitForTransactionReceipt({
      hash,
      timeout: 180_000,
      pollingInterval: 400,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/timed out|Timed out|timeout/i.test(msg)) {
      throw new Error(
        `${msg} · 请检查：1) 钱包与前端使用同一 RPC（页面 chainId ${targetChainId}，常见 http://127.0.0.1:8545）；2) 若刚执行过 reset-local-dev，请重新授权；3) 终端验证：cast receipt ${hash} --rpc-url http://127.0.0.1:8545`,
      );
    }
    throw e;
  }
}

function sepoliaUsdcToIntentAmounts(
  usdcDecimalStr: string,
  maxReleases: number,
): { amountTotal: string; amountPerLesson: string } {
  if (!Number.isInteger(maxReleases) || maxReleases < 1) {
    throw new Error("最大释放次数须为 ≥1 的整数。");
  }
  const trimmed = usdcDecimalStr.trim();
  if (!trimmed) {
    throw new Error("请输入托管总额（USDC）。");
  }
  let total: bigint;
  try {
    total = parseUnits(trimmed, BASE_SEPOLIA_USDC_DECIMALS);
  } catch {
    throw new Error("USDC 金额格式无效（示例：1000 或 0.5）。");
  }
  if (total <= BigInt(0)) {
    throw new Error("托管总额须大于 0。");
  }
  const mr = BigInt(maxReleases);
  if (total % mr !== BigInt(0)) {
    throw new Error(
      `总额按最小单位须能被 ${maxReleases} 整除（均分每次释放）。请调整金额或「释放次数」。`,
    );
  }
  const per = total / mr;
  return { amountTotal: total.toString(), amountPerLesson: per.toString() };
}

function parseCycleHoursToDurationSeconds(hoursStr: string): number {
  const trimmed = hoursStr.trim();
  if (!trimmed) {
    throw new Error("请输入托管周期（小时）。");
  }
  const h = Number(trimmed);
  if (!Number.isFinite(h) || h <= 0) {
    throw new Error("周期须为正数（小时），例如 8。");
  }
  const sec = Math.round(h * 3600);
  if (sec < 1) {
    throw new Error("周期换算成秒后须 ≥ 1。");
  }
  if (sec > 2 ** 53 - 1) {
    throw new Error("周期过大。");
  }
  return sec;
}

const defaultCreateBodyStatic = {
  merchant: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  user: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  /** Anvil Mock 18 decimals；Base Sepolia 创建时使用用户输入 USDC，不经此默认值 */
  amountTotal: "1000000000",
  amountPerLesson: "100000000",
  maxReleases: 10,
  durationSeconds: 2_592_000,
  agreementHash:
    "0x0000000000000000000000000000000000000000000000000000000000000000",
  termsVersion: "1.0.0",
};

type StoredReleaseState = {
  userSig: `0x${string}` | null;
  merchantSig: `0x${string}` | null;
  releasePrep: ReleasePrepareResponse | null;
};

function releaseStoreKey(intentId: string) {
  return `payfi.release.${intentId}`;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="payfi-label">{label}</span>
      {children}
    </label>
  );
}

export default function PayFiDemo() {
  const { locale } = useI18n();
  const searchParams = useSearchParams();
  const text = {
    "zh-CN": {
      userWorkbench: "用户工作台",
      connectWallet: "连接钱包",
      connecting: "连接中…",
      chooseWallet: "选择钱包",
      close: "关闭",
      walletHint:
        "列表来自钱包的 EIP-6963 广播；点选即可连接。若某扩展明确报告不可用，会显示「未检测到」并禁用。",
      walletUnavailable: "未检测到",
      createContractIntent: "1) 创建托管合同意向",
      creating: "创建中…",
      createIntent: "创建合同意向",
      intentIdLabel: "合同意向编号（intentId）",
      intentPlaceholder: "创建成功后自动填入，或手动粘贴合同意向编号",
      refreshIntent: "刷新合同意向",
      funding: "2) 资金托管",
      release: "3) 双签释放",
      disconnect: "断开",
      noWalletDetected:
        "当前没有检测到钱包。请确认已安装 MetaMask / Rabby 等扩展；部分环境需用桌面 Chrome 且页面由 HTTPS 或 localhost 打开，扩展才会注入。",
      switchTo: "切换到",
      wrongChainNeed: "需",
      baseSepoliaConnectFirst: "Base Sepolia 请先连接钱包（将作为合同意向用户）。",
      releaseCountInvalid: "释放次数须为 ≥1 的整数。",
      noPublicClient: "缺少 public client",
      approveReverted: "授权交易回滚",
      depositReverted: "入金交易回滚",
      connectAndLoadFirst: "请先连接钱包并加载合同意向。",
      walletMustBeUser: "当前钱包必须是合同意向用户：",
      walletMustBeMerchant: "当前钱包必须是合同意向商家：",
      switchAccount: "请在钱包中切换账户。",
      userSigRecoverFail: "用户签名恢复地址与合同意向用户不一致。",
      merchantSigRecoverFail: "商家签名恢复地址与合同意向商家不一致。",
      needUserSigFirst:
        "请先完成用户签名。若你开了新窗口，请粘贴同一合同意向编号（intentId）并点击“刷新合同意向”。",
      signUserFirst: "请先以用户身份签名（同一份 prepare payload）。",
      needBothSigs: "需要用户和商家双方签名。",
      nonceDesyncHint:
        "检测到 releaseNonce 不一致：链上状态已变化。已清空旧签名，请点击“刷新合同意向”后重新执行 用户签名 -> 商家签名 -> 提交释放。",
      sepoliaHint:
        "默认使用 Circle Base Sepolia 测试 USDC（{decimals} decimals）。托管总额将均分为「释放次数」笔；「托管周期」对应链上 escrow 到期前可释放/退款的时间窗（秒级精度由小时换算）。商家地址可通过 NEXT_PUBLIC_DEMO_MERCHANT 配置；未配置时仍为 Anvil 演示商家地址（双签需对应私钥）。",
      usdcAddressLabel: "USDC 合约地址（Circle 测试网默认已填，可改）",
      totalEscrowLabel: "托管总额（USDC）",
      totalEscrowPlaceholder: "例如 100 或 0.5",
      releaseCountLabel: "释放次数（均分总额，须整除）",
      cycleHoursLabel: "托管周期（小时，链上 duration）",
      cycleHoursPlaceholder: "例如 8",
      fundingHint: "使用 {user} 连接钱包并切换网络，然后授权并入金。",
      approving: "授权中…",
      approveToken: "1. 授权代币",
      depositing: "入金中…",
      depositEscrow: "2. 存入托管",
      lastTx: "最近交易",
      currentWallet: "当前钱包",
      notConnected: "未连接",
      needUser: "需用户",
      needMerchant: "需商家",
      stepUserSign: "用户钱包签名",
      stepSwitchMerchant: "切换商家钱包",
      stepSubmit: "提交释放",
      serverSubmit: "服务端代发交易",
      signing: "签名中…",
      signAsUser: "用户签名",
      signAsMerchant: "商家签名",
      submitting: "提交中…",
      submitRelease: "提交释放",
    },
    "zh-TW": {
      userWorkbench: "使用者工作台",
      connectWallet: "連接錢包",
      connecting: "連接中…",
      chooseWallet: "選擇錢包",
      close: "關閉",
      walletHint:
        "清單來自錢包的 EIP-6963 廣播；點選即可連接。若某擴充明確回報不可用，會顯示「未檢測到」並停用。",
      walletUnavailable: "未檢測到",
      createContractIntent: "1) 建立託管合同意向",
      creating: "建立中…",
      createIntent: "建立合同意向",
      intentIdLabel: "合同意向編號（intentId）",
      intentPlaceholder: "建立成功後自動填入，或手動貼上合同意向編號",
      refreshIntent: "刷新合同意向",
      funding: "2) 資金託管",
      release: "3) 雙簽釋放",
      disconnect: "斷開",
      noWalletDetected:
        "目前未檢測到錢包。請確認已安裝 MetaMask / Rabby 等擴充；部分環境需使用桌面 Chrome，且頁面由 HTTPS 或 localhost 開啟，擴充才會注入。",
      switchTo: "切換到",
      wrongChainNeed: "需",
      baseSepoliaConnectFirst: "Base Sepolia 請先連接錢包（將作為合同意向使用者）。",
      releaseCountInvalid: "釋放次數須為 ≥1 的整數。",
      noPublicClient: "缺少 public client",
      approveReverted: "授權交易回滾",
      depositReverted: "入金交易回滾",
      connectAndLoadFirst: "請先連接錢包並載入合同意向。",
      walletMustBeUser: "目前錢包必須是合同意向使用者：",
      walletMustBeMerchant: "目前錢包必須是合同意向商家：",
      switchAccount: "請在錢包中切換帳戶。",
      userSigRecoverFail: "使用者簽名恢復地址與合同意向使用者不一致。",
      merchantSigRecoverFail: "商家簽名恢復地址與合同意向商家不一致。",
      needUserSigFirst:
        "請先完成使用者簽名。若你開了新視窗，請貼上同一合同意向編號（intentId）並點擊「刷新合同意向」。",
      signUserFirst: "請先以使用者身分簽名（同一份 prepare payload）。",
      needBothSigs: "需要使用者與商家雙方簽名。",
      nonceDesyncHint:
        "偵測到 releaseNonce 不一致：鏈上狀態已變化。已清空舊簽名，請點擊「刷新合同意向」後重新執行 使用者簽名 -> 商家簽名 -> 提交釋放。",
      sepoliaHint:
        "預設使用 Circle Base Sepolia 測試 USDC（{decimals} decimals）。託管總額將均分為「釋放次數」筆；「託管週期」對應鏈上 escrow 到期前可釋放/退款的時間窗（秒級精度由小時換算）。商家地址可透過 NEXT_PUBLIC_DEMO_MERCHANT 設定；未設定時仍為 Anvil 示範商家地址（雙簽需對應私鑰）。",
      usdcAddressLabel: "USDC 合約地址（Circle 測試網預設已填，可改）",
      totalEscrowLabel: "託管總額（USDC）",
      totalEscrowPlaceholder: "例如 100 或 0.5",
      releaseCountLabel: "釋放次數（均分總額，須整除）",
      cycleHoursLabel: "託管週期（小時，鏈上 duration）",
      cycleHoursPlaceholder: "例如 8",
      fundingHint: "使用 {user} 連接錢包並切換網路，然後授權並入金。",
      approving: "授權中…",
      approveToken: "1. 授權代幣",
      depositing: "入金中…",
      depositEscrow: "2. 存入託管",
      lastTx: "最近交易",
      currentWallet: "目前錢包",
      notConnected: "未連接",
      needUser: "需使用者",
      needMerchant: "需商家",
      stepUserSign: "使用者錢包簽名",
      stepSwitchMerchant: "切換商家錢包",
      stepSubmit: "提交釋放",
      serverSubmit: "服務端代發交易",
      signing: "簽名中…",
      signAsUser: "使用者簽名",
      signAsMerchant: "商家簽名",
      submitting: "提交中…",
      submitRelease: "提交釋放",
    },
    en: {
      userWorkbench: "User Console",
      connectWallet: "Connect Wallet",
      connecting: "Connecting…",
      chooseWallet: "Choose Wallet",
      close: "Close",
      walletHint:
        "Wallets are discovered via EIP-6963. Click to connect. If a wallet reports unavailable, it is disabled.",
      walletUnavailable: "Unavailable",
      createContractIntent: "1) Create Escrow Contract Intent",
      creating: "Creating…",
      createIntent: "Create Contract Intent",
      intentIdLabel: "Contract Intent ID (intentId)",
      intentPlaceholder: "Auto-filled after creation, or paste a Contract Intent ID",
      refreshIntent: "Refresh Contract Intent",
      funding: "2) Fund Escrow",
      release: "3) Dual-Sign Release",
      disconnect: "Disconnect",
      noWalletDetected:
        "No wallet detected. Please install MetaMask/Rabby. In some environments, injection requires desktop Chrome and pages served from HTTPS or localhost.",
      switchTo: "Switch to",
      wrongChainNeed: "need",
      baseSepoliaConnectFirst: "Connect wallet first on Base Sepolia (used as contract intent user).",
      releaseCountInvalid: "Release count must be an integer >= 1.",
      noPublicClient: "No public client",
      approveReverted: "Approve transaction reverted",
      depositReverted: "Deposit transaction reverted",
      connectAndLoadFirst: "Connect wallet and load contract intent first.",
      walletMustBeUser: "Current wallet must be contract intent user:",
      walletMustBeMerchant: "Current wallet must be contract intent merchant:",
      switchAccount: "Switch account in your wallet.",
      userSigRecoverFail: "Recovered user signature does not match contract intent user.",
      merchantSigRecoverFail: "Recovered merchant signature does not match contract intent merchant.",
      needUserSigFirst:
        "User signature required first. If in a new window, paste the same Contract Intent ID and click Refresh Contract Intent.",
      signUserFirst: "Sign as user first (same prepare payload).",
      needBothSigs: "Both user and merchant signatures are required.",
      nonceDesyncHint:
        "Detected releaseNonce desync: on-chain state changed. Cleared old signatures. Click Refresh Contract Intent, then sign as user -> sign as merchant -> submit release again.",
      sepoliaHint:
        "Uses Circle Base Sepolia test USDC ({decimals} decimals). Total escrow is split evenly by release count. Cycle hours map to on-chain escrow duration. Merchant can be set with NEXT_PUBLIC_DEMO_MERCHANT.",
      usdcAddressLabel: "USDC Contract Address (Circle testnet default prefilled)",
      totalEscrowLabel: "Total Escrow (USDC)",
      totalEscrowPlaceholder: "e.g. 100 or 0.5",
      releaseCountLabel: "Release Count (must divide total evenly)",
      cycleHoursLabel: "Escrow Cycle (hours, on-chain duration)",
      cycleHoursPlaceholder: "e.g. 8",
      fundingHint: "Use wallet {user}, switch network, then approve and deposit.",
      approving: "Approving…",
      approveToken: "1. Approve Token",
      depositing: "Depositing…",
      depositEscrow: "2. Deposit to Escrow",
      lastTx: "Last tx",
      currentWallet: "Current wallet",
      notConnected: "Not connected",
      needUser: "Required user",
      needMerchant: "Required merchant",
      stepUserSign: "User wallet signs",
      stepSwitchMerchant: "Switch to merchant wallet",
      stepSubmit: "Submit release",
      serverSubmit: "submitted by backend relayer",
      signing: "Signing…",
      signAsUser: "Sign as user",
      signAsMerchant: "Sign as merchant",
      submitting: "Submitting…",
      submitRelease: "Submit release",
    },
  }[locale];
  const { address, isConnected, connector } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: connectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: switchPending } = useSwitchChain();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const { signTypedDataAsync } = useSignTypedData();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const effectiveIsConnected = mounted ? isConnected : false;
  const effectiveChainId = mounted ? chainId : targetChainId;
  const effectiveAddress = mounted ? address : null;

  const walletConnectors = useMemo(
    () => [...connectors].sort((a, b) => a.name.localeCompare(b.name, "en")),
    [connectors],
  );

  const defaultCreateBody = {
    ...defaultCreateBodyStatic,
    asset: defaultDemoAssetAddress(targetChainId),
  };

  const [intentId, setIntentId] = useState("");
  const [intent, setIntent] = useState<IntentRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [userSig, setUserSig] = useState<`0x${string}` | null>(null);
  const [merchantSig, setMerchantSig] = useState<`0x${string}` | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [releaseResult, setReleaseResult] = useState<Record<string, unknown> | null>(
    null,
  );
  const [releasePrep, setReleasePrep] = useState<ReleasePrepareResponse | null>(null);
  const [releaseHint, setReleaseHint] = useState<string | null>(null);
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const [sepoliaTotalUsdc, setSepoliaTotalUsdc] = useState("100");
  const [sepoliaMaxReleases, setSepoliaMaxReleases] = useState("5");
  const [sepoliaCycleHours, setSepoliaCycleHours] = useState("8");
  const [sepoliaAssetAddress, setSepoliaAssetAddress] = useState<string>(
    BASE_SEPOLIA_USDC_ADDRESS,
  );

  const payfiApiDisplay = useMemo(() => {
    const base =
      typeof process.env.NEXT_PUBLIC_PAYFI_API_URL === "string" &&
      process.env.NEXT_PUBLIC_PAYFI_API_URL.length > 0
        ? process.env.NEXT_PUBLIC_PAYFI_API_URL.replace(/\/$/, "")
        : "http://127.0.0.1:8787";
    return base;
  }, []);

  const refreshIntent = useCallback(async () => {
    if (!intentId.trim()) {
      setIntent(null);
      return;
    }
    setError(null);
    const row = await getIntent(intentId.trim());
    setIntent(row);
  }, [intentId]);

  useEffect(() => {
    void refreshIntent();
  }, [refreshIntent]);

  useEffect(() => {
    const fromQuery = searchParams.get("intentId")?.trim();
    if (fromQuery) {
      setIntentId(fromQuery);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!mounted) return;
    const id = intentId.trim();
    if (!id) {
      setUserSig(null);
      setMerchantSig(null);
      setReleasePrep(null);
      return;
    }
    try {
      const raw = window.localStorage.getItem(releaseStoreKey(id));
      if (!raw) return;
      const parsed = JSON.parse(raw) as StoredReleaseState;
      setUserSig(parsed.userSig ?? null);
      setMerchantSig(parsed.merchantSig ?? null);
      setReleasePrep(parsed.releasePrep ?? null);
    } catch {
      // ignore malformed cache
    }
  }, [intentId, mounted]);

  useEffect(() => {
    if (!mounted) return;
    const id = intentId.trim();
    if (!id) return;
    const snapshot: StoredReleaseState = { userSig, merchantSig, releasePrep };
    window.localStorage.setItem(releaseStoreKey(id), JSON.stringify(snapshot));
  }, [intentId, userSig, merchantSig, releasePrep, mounted]);

  const onWrongChain = effectiveChainId !== targetChainId;

  useEffect(() => {
    if (isConnected) setWalletPickerOpen(false);
  }, [isConnected]);

  useEffect(() => {
    if (!walletPickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setWalletPickerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [walletPickerOpen]);

  useEffect(() => {
    if (!walletPickerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [walletPickerOpen]);

  const ensureTargetChain = async () => {
    if (chainId !== targetChainId) {
      await switchChainAsync({ chainId: targetChainId });
    }
  };

  const clearLocalReleaseState = useCallback(
    (id: string) => {
      setUserSig(null);
      setMerchantSig(null);
      setReleasePrep(null);
      if (!mounted) return;
      if (!id.trim()) return;
      window.localStorage.removeItem(releaseStoreKey(id.trim()));
    },
    [mounted],
  );


  const onCreate = async () => {
    setError(null);
    setBusy("create");
    try {
      let body: Record<string, unknown> = { ...defaultCreateBody };
      if (targetChainId === baseSepolia.id) {
        if (!address) {
          throw new Error(text.baseSepoliaConnectFirst);
        }
        const maxRel = Number.parseInt(sepoliaMaxReleases, 10);
        if (!Number.isInteger(maxRel) || maxRel < 1) {
          throw new Error(text.releaseCountInvalid);
        }
        const durationSeconds = parseCycleHoursToDurationSeconds(sepoliaCycleHours);
        const { amountTotal, amountPerLesson } = sepoliaUsdcToIntentAmounts(
          sepoliaTotalUsdc,
          maxRel,
        );
        const assetTrim = sepoliaAssetAddress.trim();
        const asset = assetTrim
          ? getAddress(assetTrim as `0x${string}`)
          : defaultDemoAssetAddress(targetChainId);
        body = {
          ...body,
          asset,
          user: getAddress(address),
          amountTotal,
          amountPerLesson,
          maxReleases: maxRel,
          durationSeconds,
        };
        const dm = process.env.NEXT_PUBLIC_DEMO_MERCHANT?.trim();
        if (dm) {
          body = { ...body, merchant: getAddress(dm as `0x${string}`) };
        }
      }
      const { intentId: id } = await createIntent(body);
      setIntentId(id);
      setUserSig(null);
      setMerchantSig(null);
      setReleaseResult(null);
      setReleasePrep(null);
      setReleaseHint(null);
      const row = await getIntent(id);
      setIntent(row);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onApprove = async () => {
    if (!intent) return;
    setError(null);
    setBusy("approve");
    try {
      await ensureTargetChain();
      const hint = await fundingHint(intent.intentId);
      const escrow = hint.to as `0x${string}`;
      const hash = await writeContractAsync({
        address: intent.asset as `0x${string}`,
        abi: erc20Abi,
        functionName: "approve",
        args: [escrow, BigInt(intent.amountTotal)],
      });
      if (!publicClient) throw new Error(text.noPublicClient);
      const receipt = await waitTxReceipt(publicClient, hash);
      if (receipt.status !== "success") throw new Error(text.approveReverted);
      setLastTx(hash);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onDeposit = async () => {
    if (!intent) return;
    setError(null);
    setBusy("deposit");
    try {
      await ensureTargetChain();
      const hint = await fundingHint(intent.intentId);
      const hash = await sendTransactionAsync({
        to: hint.to as `0x${string}`,
        data: hint.data,
      });
      if (!publicClient) throw new Error(text.noPublicClient);
      const receipt = await waitTxReceipt(publicClient, hash);
      if (receipt.status !== "success") throw new Error(text.depositReverted);
      await postFundingTx(intent.intentId, hash);
      setLastTx(hash);
      await refreshIntent();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onSignUser = async () => {
    if (!intent || !address) {
      setError(text.connectAndLoadFirst);
      return;
    }
    setError(null);
    setReleaseHint(null);
    setBusy("sign-user");
    try {
      await ensureTargetChain();
      if (getAddress(address) !== getAddress(intent.user)) {
        throw new Error(`${text.walletMustBeUser} ${intent.user}. ${text.switchAccount}`);
      }
      const prep = await releasePrepare(intent.intentId);
      const domain = domainFromApi(prep.typedData.domain as Record<string, unknown>);
      const message = releaseMessageFromApi(prep.typedData.message);
      const types = prep.typedData.types as Record<
        string,
        Array<{ name: string; type: string }>
      >;
      const sig = await signTypedDataAsync({
        domain,
        types,
        primaryType: "Release",
        message,
      });
      const recovered = await recoverTypedDataAddress({
        domain,
        types,
        primaryType: "Release",
        message,
        signature: sig,
      });
      if (getAddress(recovered) !== getAddress(intent.user)) {
        throw new Error(text.userSigRecoverFail);
      }
      setUserSig(sig);
      setMerchantSig(null);
      setReleasePrep(prep);
      const id = intent.intentId.trim();
      const snapshot: StoredReleaseState = {
        userSig: sig,
        merchantSig: null,
        releasePrep: prep,
      };
      if (mounted && id) {
        window.localStorage.setItem(releaseStoreKey(id), JSON.stringify(snapshot));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onSignMerchant = async () => {
    if (!intent || !address) {
      setError(text.connectAndLoadFirst);
      return;
    }
    if (!userSig || !releasePrep) {
      setReleaseHint(
        text.needUserSigFirst,
      );
      setError(text.signUserFirst);
      return;
    }
    setError(null);
    setReleaseHint(null);
    setBusy("sign-merchant");
    try {
      await ensureTargetChain();
      if (getAddress(address) !== getAddress(intent.merchant)) {
        throw new Error(`${text.walletMustBeMerchant} ${intent.merchant}. ${text.switchAccount}`);
      }
      const prep = releasePrep;
      const domain = domainFromApi(prep.typedData.domain as Record<string, unknown>);
      const message = releaseMessageFromApi(prep.typedData.message);
      const types = prep.typedData.types as Record<
        string,
        Array<{ name: string; type: string }>
      >;
      const sig = await signTypedDataAsync({
        domain,
        types,
        primaryType: "Release",
        message,
      });
      const recovered = await recoverTypedDataAddress({
        domain,
        types,
        primaryType: "Release",
        message,
        signature: sig,
      });
      if (getAddress(recovered) !== getAddress(intent.merchant)) {
        throw new Error(text.merchantSigRecoverFail);
      }
      setMerchantSig(sig);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onReleaseSubmit = async () => {
    if (!intent || !userSig || !merchantSig) {
      setError(text.needBothSigs);
      return;
    }
    setError(null);
    setReleaseHint(null);
    setBusy("submit-release");
    try {
      const res = await releaseSubmit(intent.intentId, userSig, merchantSig);
      setReleaseResult(res);
      clearLocalReleaseState(intent.intentId);
      await refreshIntent();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/releaseNonce desync|nonce desync/i.test(msg)) {
        clearLocalReleaseState(intent.intentId);
        setReleaseHint(text.nonceDesyncHint);
        await refreshIntent();
      }
      setError(msg);
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 pb-12 pt-6 sm:px-6">
      <header className="payfi-card space-y-4 p-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            <span className="payfi-title-gradient">PayFi</span>
            <span className="text-zinc-100"> {text.userWorkbench}</span>
          </h1>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">
            chainId {targetChainId} · API <span className="payfi-code">{payfiApiDisplay}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!effectiveIsConnected ? (
            <>
              <button
                type="button"
                disabled={connectPending || !mounted}
                onClick={() => setWalletPickerOpen((o) => !o)}
                className="payfi-btn-primary"
                aria-expanded={walletPickerOpen}
                aria-haspopup="dialog"
                aria-controls="wallet-picker-panel"
              >
                {connectPending ? text.connecting : text.connectWallet}
              </button>
              {mounted &&
                walletPickerOpen &&
                typeof document !== "undefined" &&
                createPortal(
                  <div className="fixed inset-0 z-[100]" role="presentation">
                    <button
                      type="button"
                      className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
                      aria-label={text.close}
                      onClick={() => setWalletPickerOpen(false)}
                    />
                    <aside
                      id="wallet-picker-panel"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="wallet-picker-title"
                      className="absolute right-0 top-0 z-[101] flex h-full w-[min(19rem,100vw)] flex-col border-l border-white/10 bg-zinc-950/98 py-4 shadow-[-16px_0_48px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:right-4 sm:top-4 sm:h-[calc(100vh-2rem)] sm:rounded-2xl sm:border sm:border-white/10"
                    >
                      <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 pb-3">
                        <h2
                          id="wallet-picker-title"
                          className="text-sm font-semibold tracking-tight text-zinc-100"
                        >
                          {text.chooseWallet}
                        </h2>
                        <button
                          type="button"
                          onClick={() => setWalletPickerOpen(false)}
                          className="rounded-lg px-2 py-1 text-xs text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                          aria-label={text.close}
                        >
                          {text.close}
                        </button>
                      </div>
                      <p className="px-4 pt-3 text-[11px] leading-relaxed text-zinc-500">
                        {text.walletHint}
                      </p>
                      <div
                        role="listbox"
                        aria-labelledby="wallet-picker-title"
                        className="mt-2 flex-1 overflow-y-auto px-2 pb-4"
                      >
                        {walletConnectors.length === 0 ? (
                          <p className="px-2 py-4 text-xs leading-relaxed text-zinc-500">
                            {text.noWalletDetected}
                          </p>
                        ) : (
                          walletConnectors.map((c) => {
                            const unavailable = c.ready === false;
                            return (
                              <button
                                key={`${c.id}-${c.uid}`}
                                type="button"
                                role="option"
                                aria-selected={false}
                                disabled={unavailable || connectPending}
                                onClick={() => {
                                  connect({ connector: c });
                                  setWalletPickerOpen(false);
                                }}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-zinc-200 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                                {unavailable && (
                                  <span className="shrink-0 text-[10px] font-normal text-zinc-500">
                                    {text.walletUnavailable}
                                  </span>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </aside>
                  </div>,
                  document.body,
                )}
            </>
          ) : (
            <>
              <span className="font-mono text-[11px] text-zinc-300">
                {effectiveAddress ?? "—"}
              </span>
              {connector && (
                <span className="text-[11px] text-zinc-500">· {connector.name}</span>
              )}
              <button type="button" onClick={() => disconnect()} className="payfi-btn-ghost">
                {text.disconnect}
              </button>
            </>
          )}
          {isConnected && onWrongChain && (
            <button
              type="button"
              disabled={switchPending}
              onClick={() => void switchChainAsync({ chainId: targetChainId })}
              className="payfi-btn-secondary"
            >
              {text.switchTo} {targetChain.name}
            </button>
          )}
          {effectiveIsConnected && (
            <span className="text-[11px] text-zinc-500">
              {effectiveChainId}
              {onWrongChain && ` → ${text.wrongChainNeed} ${targetChainId}`}
            </span>
          )}
        </div>
      </header>

      {error && <div className="payfi-alert-error">{error}</div>}

      <section className="payfi-card space-y-4 p-5">
        <h2 className="text-base font-semibold text-zinc-100">{text.createContractIntent}</h2>
        {targetChainId === baseSepolia.id && (
          <>
            <p className="text-xs leading-relaxed text-zinc-500">
              {text.sepoliaHint.replace("{decimals}", String(BASE_SEPOLIA_USDC_DECIMALS))}{" "}
              <span className="font-mono text-zinc-400">NEXT_PUBLIC_DEMO_MERCHANT</span>{" "}
              {locale === "en" ? "." : "。"}
            </p>
            <Field label={text.usdcAddressLabel}>
              <input
                className="payfi-input font-mono text-xs"
                type="text"
                spellCheck={false}
                autoComplete="off"
                value={sepoliaAssetAddress}
                onChange={(e) => setSepoliaAssetAddress(e.target.value)}
                placeholder={BASE_SEPOLIA_USDC_ADDRESS}
              />
            </Field>
            <Field label={text.totalEscrowLabel}>
              <input
                className="payfi-input font-mono text-sm"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={sepoliaTotalUsdc}
                onChange={(e) => setSepoliaTotalUsdc(e.target.value)}
                placeholder={text.totalEscrowPlaceholder}
              />
            </Field>
            <Field label={text.releaseCountLabel}>
              <input
                className="payfi-input w-full max-w-[12rem] font-mono text-sm"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={sepoliaMaxReleases}
                onChange={(e) => setSepoliaMaxReleases(e.target.value.replace(/\D/g, "") || "1")}
              />
            </Field>
            <Field label={text.cycleHoursLabel}>
              <input
                className="payfi-input w-full max-w-[12rem] font-mono text-sm"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={sepoliaCycleHours}
                onChange={(e) => setSepoliaCycleHours(e.target.value)}
                placeholder={text.cycleHoursPlaceholder}
              />
            </Field>
          </>
        )}
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void onCreate()}
          className="payfi-btn-primary w-full sm:w-auto"
        >
          {busy === "create" ? text.creating : text.createIntent}
        </button>
        <Field label={text.intentIdLabel}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="payfi-input flex-1 font-mono text-xs"
              value={intentId}
              onChange={(e) => setIntentId(e.target.value)}
              placeholder={text.intentPlaceholder}
            />
            <button
              type="button"
              onClick={() => void refreshIntent()}
              className="payfi-btn-ghost whitespace-nowrap"
            >
              {text.refreshIntent}
            </button>
          </div>
        </Field>
        {intent && (
          <pre className="max-h-64 overflow-auto rounded-xl border border-white/5 bg-black/40 p-3 text-xs text-zinc-400">
            {JSON.stringify(intent, null, 2)}
          </pre>
        )}
      </section>

      {intent && intent.status === "awaiting_funding" && (
        <section className="payfi-card space-y-4 p-5">
          <h2 className="text-base font-semibold text-zinc-100">{text.funding}</h2>
          <p className="text-xs text-zinc-500">
            {text.fundingHint.replace("{user}", intent.user)}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(busy) || onWrongChain}
              onClick={() => void onApprove()}
              className="payfi-btn-secondary"
            >
              {busy === "approve" ? text.approving : text.approveToken}
            </button>
            <button
              type="button"
              disabled={Boolean(busy) || onWrongChain}
              onClick={() => void onDeposit()}
              className="payfi-btn-primary"
            >
              {busy === "deposit" ? text.depositing : text.depositEscrow}
            </button>
          </div>
          {lastTx && (
            <p className="font-mono text-[11px] text-zinc-500">{text.lastTx}: {lastTx}</p>
          )}
        </section>
      )}

      {intent &&
        (intent.status === "active" || intent.status === "partially_settled") && (
          <section className="payfi-card space-y-4 p-5">
            <h2 className="text-base font-semibold text-zinc-100">{text.release}</h2>
            <div className="rounded-xl border border-white/8 bg-black/35 px-3 py-3 text-xs text-zinc-400">
              <div>
                {text.currentWallet}{" "}
                <span className="font-mono text-zinc-300">
                  {effectiveAddress ?? text.notConnected}
                </span>
              </div>
              <div className="mt-1">
                {text.needUser} <span className="font-mono text-zinc-300">{intent.user}</span>
              </div>
              <div className="mt-1">
                {text.needMerchant} <span className="font-mono text-zinc-300">{intent.merchant}</span>
              </div>
            </div>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm text-zinc-400">
              <li>
                {text.stepUserSign} <strong className="text-zinc-200">{text.signAsUser}</strong>
              </li>
              <li>
                {text.stepSwitchMerchant}{" "}
                <strong className="text-zinc-200">{text.signAsMerchant}</strong>
              </li>
              <li>
                <strong className="text-zinc-200">{text.stepSubmit}</strong>（{text.serverSubmit}）
              </li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={Boolean(busy) || onWrongChain}
                onClick={() => void onSignUser()}
                className="payfi-btn-secondary"
              >
                {busy === "sign-user" ? text.signing : text.signAsUser}
              </button>
              <button
                type="button"
                disabled={Boolean(busy) || onWrongChain}
                onClick={() => void onSignMerchant()}
                className="payfi-btn-secondary"
              >
                {busy === "sign-merchant" ? text.signing : text.signAsMerchant}
              </button>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void onReleaseSubmit()}
                className="payfi-btn-primary"
              >
                {busy === "submit-release" ? text.submitting : text.submitRelease}
              </button>
            </div>
            <div className="grid gap-2 font-mono text-[11px] text-zinc-500">
              <span>userSig: {userSig ? `${userSig.slice(0, 18)}…` : "—"}</span>
              <span>
                merchantSig: {merchantSig ? `${merchantSig.slice(0, 18)}…` : "—"}
              </span>
            </div>
            {releaseHint && <div className="payfi-alert-warn">{releaseHint}</div>}
            {releaseResult && (
              <pre className="overflow-auto rounded-xl border border-white/5 bg-black/40 p-3 text-xs text-zinc-400">
                {JSON.stringify(releaseResult, null, 2)}
              </pre>
            )}
          </section>
        )}
    </main>
  );
}
