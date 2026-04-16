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
import { baseSepolia } from "wagmi/chains";
import { useSearchParams } from "next/navigation";
import {
  erc20Abi,
  formatUnits,
  getAddress,
  isHash,
  parseUnits,
  recoverTypedDataAddress,
  type PublicClient,
} from "viem";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/lib/i18n";
import {
  autoFundIntentDemo,
  createIntent,
  fundingHint,
  getCrossSpaceDemoTask,
  getCoreIntentLinkByEscrowId,
  getCoreIntentLinkByIntentId,
  getIntent,
  getReleaseSignatures,
  listIntents,
  postFundingTx,
  refundIntent,
  releasePrepare,
  saveReleaseSignature,
  triggerCrossSpaceDemo,
  releaseSubmit,
  type CoreIntentLinkRecord,
  type IntentRecord,
  type ReleasePrepareResponse,
} from "@/lib/payfi-api";
import { domainFromApi, releaseMessageFromApi } from "@/lib/release-typed-data";
import HashkeyFundingAlternative from "@/components/shared/hashkey-funding-alternative";
import DualSignIntentFacts from "@/components/shared/dual-sign-intent-facts";
import PayFiLogo from "@/components/ui/payfi-logo";
import { releaseStoreKey, type StoredReleaseState } from "@/lib/release-local-state";
import { targetChain, targetChainId } from "@/lib/wagmi-config";
import { blockExplorerTxUrl } from "@/lib/explorer";
import {
  chainDisplayName,
  HASHKEY_TESTNET_CHAIN_ID,
  isPublicUsdcTestnet,
} from "@/lib/demo-network";
import { defaultDemoAssetAddress, demoUsdcDecimals } from "@/lib/token-addresses";

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

function publicTestnetUsdcToIntentAmounts(
  usdcDecimalStr: string,
  maxReleases: number,
  decimals: number,
): { amountTotal: string; amountPerLesson: string } {
  if (!Number.isInteger(maxReleases) || maxReleases < 1) {
    throw new Error("分期期数须为 ≥1 的整数。");
  }
  const trimmed = usdcDecimalStr.trim();
  if (!trimmed) {
    throw new Error("请输入托管总额（USDC）。");
  }
  let total: bigint;
  try {
    total = parseUnits(trimmed, decimals);
  } catch {
    throw new Error("USDC 金额格式无效（示例：1000 或 0.5）。");
  }
  if (total <= BigInt(0)) {
    throw new Error("托管总额须大于 0。");
  }
  const mr = BigInt(maxReleases);
  if (total % mr !== BigInt(0)) {
    throw new Error(
      `总额按最小单位须能被 ${maxReleases} 整除（均分每期放款）。请调整金额或「分期期数」。`,
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

const USER_WB_INTENTS_PAGE_SIZE = 5;

/** 最新在前；缺 createdAt 时退化为 intentId 字典序倒序 */
function sortIntentsNewestFirst(list: IntentRecord[]): IntentRecord[] {
  return [...list].sort((a, b) => {
    const ta = a.createdAt != null ? Date.parse(a.createdAt) : NaN;
    const tb = b.createdAt != null ? Date.parse(b.createdAt) : NaN;
    const fa = Number.isFinite(ta) ? ta : 0;
    const fb = Number.isFinite(tb) ? tb : 0;
    if (fb !== fa) return fb - fa;
    return b.intentId.localeCompare(a.intentId);
  });
}

function intentStatusLabel(status: string, loc: "zh-CN" | "zh-TW" | "en") {
  switch (status) {
    case "awaiting_funding":
      return loc === "en" ? "Awaiting Funding" : "待支付";
    case "active":
      return loc === "en" ? "In Escrow" : loc === "zh-TW" ? "託管中" : "托管中";
    case "partially_settled":
      return loc === "en" ? "Partially Settled" : loc === "zh-TW" ? "部分結算" : "部分结算";
    case "settled":
      return loc === "en" ? "Settled" : loc === "zh-TW" ? "已結算" : "已结算";
    case "refunded":
      return loc === "en" ? "Refunded" : loc === "zh-TW" ? "已退款" : "已退款";
    default:
      return status;
  }
}

/** 公链测试网（Base Sepolia / HashKey Testnet 等）新建意向表单缺省：10 USDC、5 期、1 小时。 */
const DEFAULT_ESCROW_USDC_TOTAL = "10";
const DEFAULT_MAX_RELEASES = "5";
const DEFAULT_CYCLE_HOURS = "1";

function initialDefaultEscrowUsdc(): string {
  const v = process.env.NEXT_PUBLIC_DEFAULT_ESCROW_USDC?.trim();
  return v && v.length > 0 ? v : DEFAULT_ESCROW_USDC_TOTAL;
}
function initialDefaultMaxReleases(): string {
  const v = process.env.NEXT_PUBLIC_DEFAULT_MAX_RELEASES?.trim();
  return v && v.length > 0 ? v : DEFAULT_MAX_RELEASES;
}
function initialDefaultCycleHours(): string {
  const v = process.env.NEXT_PUBLIC_DEFAULT_CYCLE_HOURS?.trim();
  return v && v.length > 0 ? v : DEFAULT_CYCLE_HOURS;
}

const defaultCreateBodyStatic = {
  merchant: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  user: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  /** Anvil Mock 18 decimals；Base Sepolia 新建时使用用户输入 USDC，不经此默认值 */
  amountTotal: "1000000000",
  amountPerLesson: "100000000",
  maxReleases: 10,
  durationSeconds: 2_592_000,
  agreementHash:
    "0x0000000000000000000000000000000000000000000000000000000000000000",
  termsVersion: "1.0.0",
};

/** 用户页「商家」栏默认值：优先 NEXT_PUBLIC_DEMO_MERCHANT，否则 Anvil 演示商家。 */
function defaultDemoMerchantAddress(): string {
  const dm = process.env.NEXT_PUBLIC_DEMO_MERCHANT?.trim();
  return dm && dm.length > 0 ? dm : defaultCreateBodyStatic.merchant;
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
      createContractIntent: "新建托管合同意向",
      creating: "新建中…",
      createIntent: "新建合同意向",
      intentIdLabel: "合同意向编号（intentId）",
      intentPlaceholder: "新建成功后自动填入，或手动粘贴合同意向编号",
      refreshIntent: "查询合同意向",
      funding: "资金托管",
      release: "链上托管分期放款（双签）",
      disconnect: "断开",
      noWalletDetected:
        "当前没有检测到钱包。请确认已安装 MetaMask / Rabby 等扩展；部分环境需用桌面 Chrome 且页面由 HTTPS 或 localhost 打开，扩展才会注入。",
      switchTo: "切换到",
      wrongChainNeed: "需",
      publicTestnetConnectFirst: "请在 {chain} 先连接钱包（将作为合同意向用户）。",
      releaseCountInvalid: "分期期数须为 ≥1 的整数。",
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
        "请先完成用户签名。若你开了新窗口，请粘贴同一合同意向编号（intentId）并点击“查询合同意向”。",
      signUserFirst: "请先以用户身份签名（同一份 prepare payload）。",
      needBothSigs: "需要用户和商家双方签名。",
      nonceDesyncHint:
        "检测到 releaseNonce 不一致：链上状态已变化。已清空旧签名，请点击“查询合同意向”后重新执行 用户签名 -> 商家签名 -> 提交分期放款。",
      baseSepoliaCreateHint:
        "默认使用 Circle Base Sepolia 测试 USDC（{decimals} decimals）。演示链上托管分期放款：托管总额将均分为「分期期数」笔；「托管周期」对应链上 escrow 到期前可放款/退款的时间窗（秒级精度由小时换算）。商家地址见下方栏（默认与 NEXT_PUBLIC_DEMO_MERCHANT 一致；双签需对应私钥）。",
      merchantAddressLabel: "商家地址",
      merchantAddressPlaceholder: "0x…（须与链上托管分期放款双签时的商家钱包一致）",
      invalidMerchantAddress: "商家地址无效，请输入有效的以太坊地址（0x + 40 位十六进制）。",
      usdcAddressLabel: "USDC 合约地址（测试网）",
      totalEscrowLabel: "托管总额（USDC）",
      totalEscrowPlaceholder: "例如 10 或 100",
      releaseCountLabel: "分期期数（均分总额，须整除）",
      cycleHoursLabel: "托管周期（小时，链上 duration）",
      cycleHoursPlaceholder: "例如 2",
      fundingNetworkLabel: "网络（链）",
      fundingNetworkHint: "（与钱包、页眉一致）",
      fundingPaymentAccountLabel: "合同用户地址（付款钱包须与此一致）",
      fundingMerchantAddressLabel: "商家地址（与意向一致）",
      fundingDepositAmountLabel: "应付托管总额（与意向约定一致，USDC）",
      fundingPrecheckTitle: "链上入金前请确认",
      fundingCheck1: "网络：钱包与页眉所示链一致（错误网络请先切换）。",
      fundingCheck2: "付款身份：当前连接钱包地址 = 下方用户地址（须为创建意向时的用户）。",
      fundingCheck3: "金额：与新建意向时锁定的托管总额一致（不可在本页改数；改金额须新建意向）。",
      fundingCheck4: "余额：钱包内 USDC ≥ 本笔总额，并预留原生代币作 gas。",
      fundingCheck5: "路径：先「授权代币」再「存入托管」；或使用 HashKey 收银台后完成登记。",
      fundingWalletMismatchHint:
        "当前钱包与合同用户地址不一致，请切换钱包后再授权/入金。",
      fundingNeedWallet: "请先连接钱包。",
      approving: "授权中…",
      approveToken: "授权代币",
      depositing: "入金中…",
      depositEscrow: "存入托管",
      lastTx: "最近交易",
      notConnected: "未连接",
      contractIntentId: "合同意向ID",
      userAddress: "用户地址",
      intentFactsTitle: "合同意向详情",
      userSignRole: "用户签名",
      merchantSignRole: "商家签名",
      pendingSign: "待签名",
      timeUnknown: "—",
      amountsSection: "金额",
      amountUnitUsdc: "USDC",
      amountUnitMock: "Mock",
      refreshContract: "刷新合同",
      expectedMerchant: "合同商家地址",
      releaseProgressLabel: "分期进度",
      escrowTotal: "托管总金额",
      merchantReceived: "商家已收到金额",
      userEscrowAmount: "用户账户金额",
      releaseNonce: "当前 nonce",
      signing: "签名中…",
      signAsUser: "用户签名",
      signAsMerchant: "商家签名",
      submitting: "提交中…",
      submitRelease: "提交分期放款",
      submitCooldownNote: "刚提交成功，数秒内已锁定「提交分期放款」以防重复上链。",
      waitingMerchantSig: "已完成用户签名，等待商家签名后即可提交本期分期放款。",
      readySubmitRelease: "用户与商家签名均已就绪，可提交本期分期放款。",
      refundRemaining: "剩余金额退回",
      refundRemainingBtn: "剩余金额退回",
      refunding: "退回中…",
      refundNotExpired: "尚未到期，当前不可退款。请在到期后再操作。",
      refundExpiredReady: "已到期，可将剩余金额退回用户。",
      refundTarget: "退回地址",
      refundAmount: "退回金额",
      refundDone: "已发起退款交易。",
      stepContractIntent: "合同意图",
      stepCreate: "新建意向",
      stepFund: "链上入金",
      stepRelease: "分期放款",
      stepRefundNav: "剩余退回",
      stepRefund: "退款",
      allStatus: "全部状态",
      userWorkbenchIntentSearchPlaceholder: "商家地址或合同意图编号（intentId）",
      userIntentListLoading: "加载中…",
      paginationPrev: "上一页",
      paginationNext: "下一页",
      paginationPage: "第 {page} / {total} 页",
      gatewayOptionalTitle: "HashKey Gateway 收银台",
      gatewayOpen: "打开收银台",
      fundEitherOrNote: "以下为与「授权代币 → 存入托管」二选一的入金路径",
      hspAlternativeCardTitle: "HashKey 收银台与支付登记",
      hspNoPaymentUrl: "当前意向未返回收银台链接（新建时网关可能失败），可直接在下方登记交易哈希。",
      hintCardTitle: "操作提示",
      explorerViewTx: "在区块浏览器查看交易",
      hspRegisterTitle: "已在收银台 / 外部完成支付？登记交易哈希",
      hspRegisterHint:
        "在收银台或外部钱包完成链上支付后，将 Blockscout 上**支付成功**的交易哈希粘贴并登记（同 API「POST .../funding/tx」）。若已通过上方按钮完成存入，请勿重复登记。",
      registerTxPlaceholder: "0x…（66 字符）",
      registerTxSubmit: "登记托管入金",
      registerTxBusy: "登记中…",
      invalidTxHash: "请输入有效的交易哈希（0x + 64 位十六进制）。",
      stepWrongContext: "当前步骤与合同状态不一致，已为你切换到合适步骤。",
      stepNeedIntentFirst: "请先新建或加载合同意向（intentId）。",
      stepNotFundedYet: "请先完成「链上入金」后再进行链上托管分期放款（双签）。",
      stepAlreadyFunded: "当前合同已不在「待支付」状态。若托管尚未完成，请查看上一步；否则请在本步继续分期放款或退款。",
      coreOrderSectionTitle: "Core Space：下单与保证金",
      espaceOrderSectionTitle: "eSpace：映射参数",
      coreOrderSectionHint:
        "当前卡片操作发生在 eSpace（创建 intent）。Core 下单/保证金映射状态按阶段回填到下方状态栏。",
      coreStepCore: "Core 下单",
      coreStepAdapter: "Adapter 映射",
      coreStepEscrow: "escrowId",
      coreOrderIdLabel: "Core orderId",
      coreEscrowIdLabel: "eSpace escrowId",
      coreMappedTxLabel: "Adapter 映射交易",
      coreMappedTxView: "查看交易",
      coreDemoMerchantLabel: "商家地址（Core Demo）",
      coreDemoBuyerLabel: "买家地址（Core Demo）",
      coreDemoSellerLabel: "卖家地址（Core Demo）",
      coreDemoTotalLabel: "托管总额（Core Demo）",
      coreDemoReleasesLabel: "分期期数（Core Demo）",
      espaceUserLabel: "买家地址（eSpace）",
      espaceMerchantLabel: "卖家地址（eSpace）",
      espaceTotalLabel: "托管总额（eSpace）",
      espaceReleasesLabel: "分期期数（eSpace）",
      espaceCycleLabel: "托管周期（小时）",
      createMappedIntentBtn: "生成映射intentId",
      autoMapFundBtn: "自动完成映射并入金（Demo）",
      autoMapFundBusy: "自动处理中…",
      autoMapFundDone: "已完成映射并自动入金，已跳转到下一步。",
      autoFlowSummaryTitle: "自动流程摘要",
      autoFlowIntentId: "intentId",
      autoFlowCoreOrderId: "coreOrderId",
      autoFlowEscrowId: "escrowId",
      autoFlowFundingTx: "fundingTxHash",
      fundOpsCollapsedHint:
        "Conflux + CrossSpace 测试默认收起手动链上入金操作。若需手动执行，可展开下方操作区。",
      expandFundOpsBtn: "展开链上入金操作（手动）",
      coreDepositBtn: "缴纳保证金",
      coreDepositBusy: "处理中…",
      coreDepositDone: "已触发 Core demo，下方状态会自动刷新。",
      coreDepositNeedDebug: "后端未开启调试接口（请设置 PAYFIDEMO_DEBUG=true 并重启 API）。",
      stepStatusPending: "待完成",
      stepStatusDone: "已完成",
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
      createContractIntent: "新建託管合同意向",
      creating: "新建中…",
      createIntent: "新建合同意向",
      intentIdLabel: "合同意向編號（intentId）",
      intentPlaceholder: "新建成功後自動填入，或手動貼上合同意向編號",
      refreshIntent: "查詢合同意向",
      funding: "資金託管",
      release: "鏈上託管分期放款（雙簽）",
      disconnect: "斷開",
      noWalletDetected:
        "目前未檢測到錢包。請確認已安裝 MetaMask / Rabby 等擴充；部分環境需使用桌面 Chrome，且頁面由 HTTPS 或 localhost 開啟，擴充才會注入。",
      switchTo: "切換到",
      wrongChainNeed: "需",
      publicTestnetConnectFirst: "請在 {chain} 先連接錢包（將作為合同意向使用者）。",
      releaseCountInvalid: "分期期數須為 ≥1 的整數。",
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
        "請先完成使用者簽名。若你開了新視窗，請貼上同一合同意向編號（intentId）並點擊「查詢合同意向」。",
      signUserFirst: "請先以使用者身分簽名（同一份 prepare payload）。",
      needBothSigs: "需要使用者與商家雙方簽名。",
      nonceDesyncHint:
        "偵測到 releaseNonce 不一致：鏈上狀態已變化。已清空舊簽名，請點擊「查詢合同意向」後重新執行 使用者簽名 -> 商家簽名 -> 提交分期放款。",
      baseSepoliaCreateHint:
        "預設使用 Circle Base Sepolia 測試 USDC（{decimals} decimals）。演示鏈上託管分期放款：託管總額將均分為「分期期數」筆；「託管週期」對應鏈上 escrow 到期前可放款/退款的時間窗（秒級精度由小時換算）。商家地址見下方欄（預設與 NEXT_PUBLIC_DEMO_MERCHANT 一致；雙簽需對應私鑰）。",
      merchantAddressLabel: "商家地址",
      merchantAddressPlaceholder: "0x…（須與鏈上託管分期放款雙簽時的商家錢包一致）",
      invalidMerchantAddress: "商家地址無效，請輸入有效的以太坊地址（0x + 40 位十六進位）。",
      usdcAddressLabel: "USDC 合約地址（測試網）",
      totalEscrowLabel: "託管總額（USDC）",
      totalEscrowPlaceholder: "例如 10 或 100",
      releaseCountLabel: "分期期數（均分總額，須整除）",
      cycleHoursLabel: "託管週期（小時，鏈上 duration）",
      cycleHoursPlaceholder: "例如 2",
      fundingNetworkLabel: "網路（鏈）",
      fundingNetworkHint: "（與錢包、頁眉一致）",
      fundingPaymentAccountLabel: "合同使用者地址（付款錢包須與此一致）",
      fundingMerchantAddressLabel: "商家地址（與意向一致）",
      fundingDepositAmountLabel: "應付託管總額（與意向約定一致，USDC）",
      fundingPrecheckTitle: "鏈上入金前請確認",
      fundingCheck1: "網路：錢包與頁眉所示鏈一致（錯誤網路請先切換）。",
      fundingCheck2: "付款身分：目前連接錢包地址 = 下方使用者地址（須為建立意向時的使用者）。",
      fundingCheck3: "金額：與新建意向時鎖定的託管總額一致（不可在本頁改數；改金額須新建意向）。",
      fundingCheck4: "餘額：錢包內 USDC ≥ 本筆總額，並預留原生代幣作 gas。",
      fundingCheck5: "路徑：先「授權代幣」再「存入託管」；或使用 HashKey 收銀台後完成登記。",
      fundingWalletMismatchHint:
        "目前錢包與合同使用者地址不一致，請切換錢包後再授權/入金。",
      fundingNeedWallet: "請先連接錢包。",
      approving: "授權中…",
      approveToken: "授權代幣",
      depositing: "入金中…",
      depositEscrow: "存入託管",
      lastTx: "最近交易",
      notConnected: "未連接",
      contractIntentId: "合同意向ID",
      userAddress: "使用者地址",
      intentFactsTitle: "合同意向詳情",
      userSignRole: "使用者簽名",
      merchantSignRole: "商家簽名",
      pendingSign: "待簽名",
      timeUnknown: "—",
      amountsSection: "金額",
      amountUnitUsdc: "USDC",
      amountUnitMock: "Mock",
      refreshContract: "刷新合同",
      expectedMerchant: "合同商家地址",
      releaseProgressLabel: "分期進度",
      escrowTotal: "託管總金額",
      merchantReceived: "商家已收到金額",
      userEscrowAmount: "使用者帳戶金額",
      releaseNonce: "目前 nonce",
      signing: "簽名中…",
      signAsUser: "使用者簽名",
      signAsMerchant: "商家簽名",
      submitting: "提交中…",
      submitRelease: "提交分期放款",
      submitCooldownNote: "剛提交成功，數秒內已鎖定「提交分期放款」以防重複上鏈。",
      waitingMerchantSig: "已完成使用者簽名，等待商家簽名後即可提交本期分期放款。",
      readySubmitRelease: "使用者與商家簽名均已就緒，可提交本期分期放款。",
      refundRemaining: "退回剩餘金額",
      refundRemainingBtn: "退回剩餘金額",
      refunding: "退回中…",
      refundNotExpired: "尚未到期，目前不可退款。請在到期後再操作。",
      refundExpiredReady: "已到期，可將剩餘金額退回使用者。",
      refundTarget: "退回地址",
      refundAmount: "退回金額",
      refundDone: "已送出退款交易。",
      stepContractIntent: "合同意圖",
      stepCreate: "新建意向",
      stepFund: "鏈上入金",
      stepRelease: "分期放款",
      stepRefundNav: "退回剩餘",
      stepRefund: "退款",
      allStatus: "全部狀態",
      userWorkbenchIntentSearchPlaceholder: "商家地址或合同意圖編號（intentId）",
      userIntentListLoading: "載入中…",
      paginationPrev: "上一頁",
      paginationNext: "下一頁",
      paginationPage: "第 {page} / {total} 頁",
      gatewayOptionalTitle: "HashKey Gateway 收銀台",
      gatewayOpen: "開啟收銀台",
      fundEitherOrNote: "以下為與「授權代幣 → 存入託管」二選一的入金路徑",
      hspAlternativeCardTitle: "HashKey 收銀台與支付登記",
      hspNoPaymentUrl: "目前意向未回傳收銀台連結（新建時網關可能失敗），可直接於下方登記交易雜湊。",
      hintCardTitle: "操作提示",
      explorerViewTx: "在區塊瀏覽器查看交易",
      hspRegisterTitle: "已在收銀台 / 外部完成支付？登記交易雜湊",
      hspRegisterHint:
        "在收銀台或外部錢包完成鏈上支付後，將 Blockscout 上**支付成功**的交易雜湊貼上並登記（同 API「POST .../funding/tx」）。若已透過上方按鈕完成存入，請勿重複登記。",
      registerTxPlaceholder: "0x…（66 字元）",
      registerTxSubmit: "登記託管入金",
      registerTxBusy: "登記中…",
      invalidTxHash: "請輸入有效的交易雜湊（0x + 64 位十六進位）。",
      stepWrongContext: "目前步驟與合同狀態不一致，已為你切換到合適步驟。",
      stepNeedIntentFirst: "請先新建或載入合同意向（intentId）。",
      stepNotFundedYet: "請先完成「鏈上入金」後再進行鏈上託管分期放款（雙簽）。",
      stepAlreadyFunded: "目前合同已不在「待支付」狀態。若託管尚未完成，請查看上一步；否則請在本步繼續分期放款或退款。",
      coreOrderSectionTitle: "Core Space：下單與保證金",
      espaceOrderSectionTitle: "eSpace：映射參數",
      coreOrderSectionHint:
        "目前此卡片操作發生在 eSpace（建立 intent）。Core 下單/保證金映射狀態會分階段回填到下方狀態列。",
      coreStepCore: "Core 下單",
      coreStepAdapter: "Adapter 映射",
      coreStepEscrow: "escrowId",
      coreOrderIdLabel: "Core orderId",
      coreEscrowIdLabel: "eSpace escrowId",
      coreMappedTxLabel: "Adapter 映射交易",
      coreMappedTxView: "查看交易",
      coreDemoMerchantLabel: "商家地址（Core Demo）",
      coreDemoBuyerLabel: "買家地址（Core Demo）",
      coreDemoSellerLabel: "賣家地址（Core Demo）",
      coreDemoTotalLabel: "托管總額（Core Demo）",
      coreDemoReleasesLabel: "分期期數（Core Demo）",
      espaceUserLabel: "買家地址（eSpace）",
      espaceMerchantLabel: "賣家地址（eSpace）",
      espaceTotalLabel: "託管總額（eSpace）",
      espaceReleasesLabel: "分期期數（eSpace）",
      espaceCycleLabel: "託管週期（小時）",
      createMappedIntentBtn: "產生映射 intentId",
      autoMapFundBtn: "自動完成映射並入金（Demo）",
      autoMapFundBusy: "自動處理中…",
      autoMapFundDone: "已完成映射並自動入金，已跳轉到下一步。",
      autoFlowSummaryTitle: "自動流程摘要",
      autoFlowIntentId: "intentId",
      autoFlowCoreOrderId: "coreOrderId",
      autoFlowEscrowId: "escrowId",
      autoFlowFundingTx: "fundingTxHash",
      fundOpsCollapsedHint:
        "Conflux + CrossSpace 測試預設收起手動鏈上入金操作。若需手動執行，可展開下方操作區。",
      expandFundOpsBtn: "展開鏈上入金操作（手動）",
      coreDepositBtn: "繳納保證金",
      coreDepositBusy: "處理中…",
      coreDepositDone: "已觸發 Core demo，下方狀態會自動更新。",
      coreDepositNeedDebug: "後端未開啟除錯接口（請設定 PAYFIDEMO_DEBUG=true 並重啟 API）。",
      stepStatusPending: "待完成",
      stepStatusDone: "已完成",
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
      createContractIntent: "New Escrow Contract Intent",
      creating: "Creating…",
      createIntent: "New Contract Intent",
      intentIdLabel: "Contract Intent ID (intentId)",
      intentPlaceholder: "Auto-filled after a new intent succeeds, or paste a Contract Intent ID",
      refreshIntent: "Query Contract Intent",
      funding: "Fund Escrow",
      release: "On-chain escrow installment (dual-sign)",
      disconnect: "Disconnect",
      noWalletDetected:
        "No wallet detected. Please install MetaMask/Rabby. In some environments, injection requires desktop Chrome and pages served from HTTPS or localhost.",
      switchTo: "Switch to",
      wrongChainNeed: "need",
      publicTestnetConnectFirst: "Connect wallet on {chain} first (as contract intent user).",
      releaseCountInvalid: "Installment count must be an integer >= 1.",
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
        "User signature required first. If in a new window, paste the same Contract Intent ID and click Query Contract Intent.",
      signUserFirst: "Sign as user first (same prepare payload).",
      needBothSigs: "Both user and merchant signatures are required.",
      nonceDesyncHint:
        "Detected releaseNonce desync: on-chain state changed. Cleared old signatures. Click Query Contract Intent, then sign as user -> sign as merchant -> submit installment disbursement again.",
      baseSepoliaCreateHint:
        "On-chain escrow installment disbursement demo. Uses Circle Base Sepolia test USDC ({decimals} decimals). Total escrow is split evenly by installment count. Cycle hours map to on-chain escrow duration. Set merchant below (defaults to NEXT_PUBLIC_DEMO_MERCHANT).",
      merchantAddressLabel: "Merchant address",
      merchantAddressPlaceholder: "0x… (must match the wallet used for dual-sign installment disbursement)",
      invalidMerchantAddress: "Invalid merchant address. Enter a valid Ethereum address (0x + 40 hex chars).",
      usdcAddressLabel: "USDC contract address (testnet)",
      totalEscrowLabel: "Total Escrow (USDC)",
      totalEscrowPlaceholder: "e.g. 10 or 100",
      releaseCountLabel: "Installment count (must divide total evenly)",
      cycleHoursLabel: "Escrow Cycle (hours, on-chain duration)",
      cycleHoursPlaceholder: "e.g. 2",
      fundingNetworkLabel: "Network (chain)",
      fundingNetworkHint: "(must match wallet & header)",
      fundingPaymentAccountLabel: "Intent user address (payer wallet must match)",
      fundingMerchantAddressLabel: "Merchant address (from intent)",
      fundingDepositAmountLabel: "Escrow total due (as locked on intent, USDC)",
      fundingPrecheckTitle: "Before on-chain funding, confirm",
      fundingCheck1: "Network: wallet matches the chain shown in the header (switch if needed).",
      fundingCheck2: "Payer: connected wallet address equals the user address below (intent user).",
      fundingCheck3: "Amount: matches the escrow total fixed at intent creation (cannot edit here; create a new intent to change).",
      fundingCheck4: "Balance: USDC ≥ this total; keep native token for gas.",
      fundingCheck5: "Flow: Approve then Deposit — or use HashKey checkout and register the tx.",
      fundingWalletMismatchHint: "Connected wallet does not match the intent user. Switch accounts.",
      fundingNeedWallet: "Connect your wallet first.",
      approving: "Approving…",
      approveToken: "Approve Token",
      depositing: "Depositing…",
      depositEscrow: "Deposit to Escrow",
      lastTx: "Last tx",
      notConnected: "Not connected",
      contractIntentId: "Contract Intent ID",
      userAddress: "User address",
      intentFactsTitle: "Intent details",
      userSignRole: "User signature",
      merchantSignRole: "Merchant signature",
      pendingSign: "Pending",
      timeUnknown: "—",
      amountsSection: "Amounts",
      amountUnitUsdc: "USDC",
      amountUnitMock: "Mock",
      refreshContract: "Refresh contract",
      expectedMerchant: "Intent merchant",
      releaseProgressLabel: "Installment progress",
      escrowTotal: "Total escrow",
      merchantReceived: "Merchant received",
      userEscrowAmount: "User escrow balance",
      releaseNonce: "Current nonce",
      signing: "Signing…",
      signAsUser: "Sign as user",
      signAsMerchant: "Sign as merchant",
      submitting: "Submitting…",
      submitRelease: "Submit installment disbursement",
      submitCooldownNote:
        "Submitted successfully — submit is locked for a few seconds to prevent duplicate on-chain txs.",
      waitingMerchantSig: "User signature is ready. Waiting for merchant signature before submitting this installment.",
      readySubmitRelease: "Both user and merchant signatures are ready. You can submit this installment disbursement now.",
      refundRemaining: "Return Remaining Funds",
      refundRemainingBtn: "Return Remaining Funds",
      refunding: "Refunding…",
      refundNotExpired: "Escrow has not expired yet, so refund is unavailable.",
      refundExpiredReady: "Escrow expired. Remaining funds can be returned to the user.",
      refundTarget: "Return Address",
      refundAmount: "Return Amount",
      refundDone: "Refund transaction submitted.",
      stepContractIntent: "Contract intents",
      stepCreate: "New intent",
      stepFund: "Fund on-chain",
      stepRelease: "Installment disbursement",
      stepRefundNav: "Refund remainder",
      stepRefund: "Refund",
      allStatus: "All statuses",
      userWorkbenchIntentSearchPlaceholder: "Merchant address or Contract Intent ID (intentId)",
      userIntentListLoading: "Loading…",
      paginationPrev: "Previous",
      paginationNext: "Next",
      paginationPage: "Page {page} / {total}",
      gatewayOptionalTitle: "HashKey Gateway checkout",
      gatewayOpen: "Open checkout",
      fundEitherOrNote: "Alternative to Approve + Deposit above — pick one funding path",
      hspAlternativeCardTitle: "HashKey checkout & tx registration",
      hspNoPaymentUrl:
        "No checkout URL on this intent (gateway may have failed when the intent was added). You can still register a tx hash below.",
      hintCardTitle: "Notices",
      explorerViewTx: "View transaction on explorer",
      hspRegisterTitle: "Paid via checkout or another wallet? Register tx hash",
      hspRegisterHint:
        "After paying on checkout or another wallet, paste the successful tx hash from the explorer and register (same as POST .../funding/tx). If you already deposited with the buttons above, do not register again.",
      registerTxPlaceholder: "0x… (66 chars)",
      registerTxSubmit: "Register funding tx",
      registerTxBusy: "Registering…",
      invalidTxHash: "Enter a valid tx hash (0x + 64 hex digits).",
      stepWrongContext: "This step does not match the current intent state; switched to the appropriate step.",
      stepNeedIntentFirst: "Add a new intent or load an intent (intentId) first.",
      stepNotFundedYet:
        "Complete on-chain funding first, then proceed with on-chain escrow installment disbursement (dual-sign).",
      stepAlreadyFunded:
        "This intent is no longer awaiting funding. Use the previous step if you still need to fund; otherwise continue with installment disbursement or refund here.",
      coreOrderSectionTitle: "Core Space: order & deposit",
      espaceOrderSectionTitle: "eSpace: mapping parameters",
      coreOrderSectionHint:
        "Actions in this card currently run on eSpace (intent creation). Core order/deposit mapping is filled into the status bar in stages.",
      coreStepCore: "Core order",
      coreStepAdapter: "Adapter mapping",
      coreStepEscrow: "escrowId",
      coreOrderIdLabel: "Core orderId",
      coreEscrowIdLabel: "eSpace escrowId",
      coreMappedTxLabel: "Adapter mapping tx",
      coreMappedTxView: "View tx",
      coreDemoMerchantLabel: "Merchant (Core demo)",
      coreDemoBuyerLabel: "Buyer (Core demo)",
      coreDemoSellerLabel: "Seller (Core demo)",
      coreDemoTotalLabel: "Total escrow (Core demo)",
      coreDemoReleasesLabel: "Release count (Core demo)",
      espaceUserLabel: "Buyer (eSpace)",
      espaceMerchantLabel: "Seller (eSpace)",
      espaceTotalLabel: "Total escrow (eSpace)",
      espaceReleasesLabel: "Release count (eSpace)",
      espaceCycleLabel: "Escrow cycle (hours)",
      createMappedIntentBtn: "Generate mapped intentId",
      autoMapFundBtn: "Auto map + fund (Demo)",
      autoMapFundBusy: "Auto processing…",
      autoMapFundDone: "Mapping and auto-funding completed. Moved to next step.",
      autoFlowSummaryTitle: "Auto flow summary",
      autoFlowIntentId: "intentId",
      autoFlowCoreOrderId: "coreOrderId",
      autoFlowEscrowId: "escrowId",
      autoFlowFundingTx: "fundingTxHash",
      fundOpsCollapsedHint:
        "In Conflux + CrossSpace tests, manual on-chain funding is collapsed by default. Expand if you need manual operations.",
      expandFundOpsBtn: "Expand on-chain funding actions (manual)",
      coreDepositBtn: "Deposit margin",
      coreDepositBusy: "Processing…",
      coreDepositDone: "Core demo triggered. Status below will refresh automatically.",
      coreDepositNeedDebug: "Debug endpoint is disabled (set PAYFIDEMO_DEBUG=true and restart API).",
      stepStatusPending: "Pending",
      stepStatusDone: "Done",
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
  const crossSpaceEnabled =
    process.env.NEXT_PUBLIC_CROSS_SPACE_ENABLED?.trim().toLowerCase() === "true";
  const isConfluxCrossSpace = crossSpaceEnabled && targetChainId === 71;
  const coreSpaceNetId = Number(process.env.NEXT_PUBLIC_CORESPACE_CHAIN_ID ?? 1);

  const [intentId, setIntentId] = useState("");
  const [intent, setIntent] = useState<IntentRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [userSig, setUserSig] = useState<`0x${string}` | null>(null);
  const [merchantSig, setMerchantSig] = useState<`0x${string}` | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [registerFundingTxInput, setRegisterFundingTxInput] = useState("");
  const [releaseResult, setReleaseResult] = useState<Record<string, unknown> | null>(
    null,
  );
  const [releasePrep, setReleasePrep] = useState<ReleasePrepareResponse | null>(null);
  const [releaseHint, setReleaseHint] = useState<string | null>(null);
  const [refundResult, setRefundResult] = useState<Record<string, unknown> | null>(null);
  const [walletPickerOpen, setWalletPickerOpen] = useState(false);
  const releaseSubmitInFlightRef = useRef(false);
  const [releaseSubmitCooldown, setReleaseSubmitCooldown] = useState(false);
  const [sepoliaTotalUsdc, setSepoliaTotalUsdc] = useState(initialDefaultEscrowUsdc);
  const [sepoliaMaxReleases, setSepoliaMaxReleases] = useState(initialDefaultMaxReleases);
  const [sepoliaCycleHours, setSepoliaCycleHours] = useState(initialDefaultCycleHours);
  const [sepoliaAssetAddress, setSepoliaAssetAddress] = useState<string>(() =>
    defaultDemoAssetAddress(targetChainId),
  );
  const [createMerchantAddress, setCreateMerchantAddress] = useState(
    defaultDemoMerchantAddress,
  );
  const [coreIntentLink, setCoreIntentLink] = useState<CoreIntentLinkRecord | null>(null);
  const [coreDemoBusy, setCoreDemoBusy] = useState(false);
  const [coreDemoMsg, setCoreDemoMsg] = useState<string | null>(null);
  const [coreDemoErr, setCoreDemoErr] = useState<string | null>(null);
  const [autoMapFundBusy, setAutoMapFundBusy] = useState(false);
  const [fundingOpsOpen, setFundingOpsOpen] = useState(!isConfluxCrossSpace);
  const [autoFlowFundingTxHash, setAutoFlowFundingTxHash] = useState<string | null>(null);

  /**
   * Wizard state machine (single-direction rules):
   * - `create_to_fund`  : move to step 3 after creating intent
   * - `auto_flow_done`  : move forward to step 4 after auto map+fund succeeds
   * - `sync_from_intent`: default intent-status driven step sync
   */
  const applyWizardTransition = useCallback(
    (
      event: "create_to_fund" | "auto_flow_done" | "sync_from_intent",
      payload?: { currentStep?: number; derivedStep?: number },
    ) => {
      if (event === "create_to_fund") {
        setWizardStep(3);
        return;
      }
      if (event === "auto_flow_done") {
        setWizardStep(4);
        return;
      }
      setWizardStep((prev) => {
        const current = payload?.currentStep ?? prev;
        const nextDerived = payload?.derivedStep ?? prev;
        if (current === 1) return current;
        return nextDerived;
      });
    },
    [],
  );

  const [userWbIntents, setUserWbIntents] = useState<IntentRecord[]>([]);
  const [userWbIntentsLoading, setUserWbIntentsLoading] = useState(false);
  const [userWbStatusFilter, setUserWbStatusFilter] = useState<string>("all");
  const [userWbMerchantFilter, setUserWbMerchantFilter] = useState("");
  const [userWbIntentListPage, setUserWbIntentListPage] = useState(1);
  const [intentListSelectNavigate, setIntentListSelectNavigate] = useState(false);
  const userWbFilterLookupRef = useRef<string | null>(null);

  const refreshIntent = useCallback(async () => {
    if (!intentId.trim()) {
      setIntent(null);
      setUserSig(null);
      setMerchantSig(null);
      setCoreIntentLink(null);
      return;
    }
    setError(null);
    const id = intentId.trim();
    try {
      const [row, sigs] = await Promise.all([getIntent(id), getReleaseSignatures(id)]);
      setIntent(row);
      setUserSig(sigs.userSig);
      setMerchantSig(sigs.merchantSig);
      if (crossSpaceEnabled) {
        const link = row.escrowId
          ? await getCoreIntentLinkByEscrowId(row.escrowId).catch(() => null)
          : await getCoreIntentLinkByIntentId(id).catch(() => null);
        if (link) {
          setCoreIntentLink(link);
        }
      } else {
        setCoreIntentLink(null);
      }
      if (typeof window !== "undefined" && id) {
        try {
          const raw = window.localStorage.getItem(releaseStoreKey(id));
          if (!raw) return;
          const parsed = JSON.parse(raw) as StoredReleaseState;
          setReleasePrep(parsed.releasePrep ?? null);
        } catch {
          // ignore malformed cache
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [crossSpaceEnabled, intentId]);

  useEffect(() => {
    void refreshIntent();
  }, [refreshIntent]);

  useEffect(() => {
    if (!crossSpaceEnabled) return;
    const id = intentId.trim();
    if (!id) return;
    const timer = window.setInterval(() => {
      void getIntent(id)
        .then(async (row) => {
          setIntent(row);
          const link = row.escrowId
            ? await getCoreIntentLinkByEscrowId(row.escrowId).catch(() => null)
            : await getCoreIntentLinkByIntentId(id).catch(() => null);
          if (link) {
            setCoreIntentLink(link);
          }
        })
        .catch(() => {
          // ignore transient polling errors
        });
    }, 8_000);
    return () => window.clearInterval(timer);
  }, [crossSpaceEnabled, intentId]);

  useEffect(() => {
    const fromQuery = searchParams.get("intentId")?.trim();
    if (fromQuery) {
      setIntentId(fromQuery);
    }
  }, [searchParams]);

  useEffect(() => {
    setReleaseSubmitCooldown(false);
  }, [intent?.intentId]);

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

  /** 与商家端一致：state 优先，否则用意向 / API 载荷中的签名，用于「提交分期放款」是否可点 */
  const displayUserSig = useMemo(
    () => userSig ?? (intent?.userSig as `0x${string}` | undefined) ?? null,
    [userSig, intent?.userSig],
  );
  const displayMerchantSig = useMemo(
    () => merchantSig ?? (intent?.merchantSig as `0x${string}` | undefined) ?? null,
    [merchantSig, intent?.merchantSig],
  );

  const onWrongChain = effectiveChainId !== targetChainId;

  /** 链上授权/入金：须为意向用户且已连接 */
  const fundingWalletAddressMatch = useMemo(() => {
    if (!intent?.user?.trim() || !effectiveAddress) return false;
    try {
      return getAddress(effectiveAddress) === getAddress(intent.user);
    } catch {
      return false;
    }
  }, [intent?.user, effectiveAddress]);

  const fundingOnChainDisabled =
    Boolean(busy) ||
    onWrongChain ||
    !effectiveAddress ||
    !fundingWalletAddressMatch;

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

  const reloadUserWorkbenchIntents = useCallback(async () => {
    setUserWbIntentsLoading(true);
    try {
      const rows = await listIntents();
      setUserWbIntents(sortIntentsNewestFirst(rows));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUserWbIntentsLoading(false);
    }
  }, []);

  const waitCrossSpaceDemoResult = useCallback(async (taskId: string) => {
    const start = Date.now();
    while (Date.now() - start < 190_000) {
      const snap = await getCrossSpaceDemoTask(taskId);
      if (snap.status === "running") {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }
      if (snap.status === "failed") {
        throw new Error(snap.error || "cross-space demo failed");
      }
      return snap;
    }
    throw new Error("cross-space demo status polling timed out");
  }, []);

  const onRunCoreDemo = useCallback(async () => {
    setCoreDemoMsg(null);
    setCoreDemoErr(null);
    setCoreDemoBusy(true);
    try {
      const started = await triggerCrossSpaceDemo();
      const done = await waitCrossSpaceDemoResult(started.taskId);
      const logs = `${done.stdout ?? ""}\n${done.stderr ?? ""}`;
      const orderIdMatch = logs.match(/core order placed orderId=(\d+)/i);
      const mappedMatch = logs.match(/mapped to escrowId=(\d+)\s+tx=(0x[a-fA-F0-9]{64})/i);
      if (orderIdMatch?.[1] || mappedMatch?.[1]) {
        const now = new Date().toISOString();
        setCoreIntentLink((prev) => ({
          coreOrderId: orderIdMatch?.[1] ?? prev?.coreOrderId ?? "—",
          escrowId: mappedMatch?.[1] ?? prev?.escrowId ?? "—",
          mappedTxHash: mappedMatch?.[2] ?? prev?.mappedTxHash,
          intentId: prev?.intentId,
          createdAt: prev?.createdAt ?? now,
          updatedAt: now,
        }));
      }
      setCoreDemoMsg(text.coreDepositDone);
      if (intentId.trim()) {
        await refreshIntent();
      }
      void reloadUserWorkbenchIntents();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/not found/i.test(msg)) {
        setCoreDemoErr(text.coreDepositNeedDebug);
      } else {
        setCoreDemoErr(msg);
      }
    } finally {
      setCoreDemoBusy(false);
    }
  }, [
    intentId,
    refreshIntent,
    reloadUserWorkbenchIntents,
    waitCrossSpaceDemoResult,
    text.coreDepositDone,
    text.coreDepositNeedDebug,
  ]);

  const onAutoMapAndFundDemo = async () => {
    setError(null);
    setCoreDemoMsg(null);
    setCoreDemoErr(null);
    setAutoFlowFundingTxHash(null);
    setAutoMapFundBusy(true);
    try {
      const started = await triggerCrossSpaceDemo();
      const done = await waitCrossSpaceDemoResult(started.taskId);
      const logs = `${done.stdout ?? ""}\n${done.stderr ?? ""}`;
      const orderIdMatch = logs.match(/core order placed orderId=(\d+)/i);
      const mappedMatch = logs.match(/mapped to escrowId=(\d+)\s+tx=(0x[a-fA-F0-9]{64})/i);
      if (orderIdMatch?.[1] || mappedMatch?.[1]) {
        const now = new Date().toISOString();
        setCoreIntentLink((prev) => ({
          coreOrderId: orderIdMatch?.[1] ?? prev?.coreOrderId ?? "—",
          escrowId: mappedMatch?.[1] ?? prev?.escrowId ?? "—",
          mappedTxHash: mappedMatch?.[2] ?? prev?.mappedTxHash,
          intentId: prev?.intentId,
          createdAt: prev?.createdAt ?? now,
          updatedAt: now,
        }));
      }
      const id = await onCreate();
      if (!id) throw new Error("create intent failed");
      const funded = await autoFundIntentDemo(id);
      setAutoFlowFundingTxHash(funded.fundingTxHash ?? null);
      setCoreDemoMsg(text.autoMapFundDone);
      const row = await getIntent(id);
      setIntent(row);
      setIntentId(id);
      // Single-direction rule: after auto map+fund succeeds, always continue to release step.
      applyWizardTransition("auto_flow_done");
      void reloadUserWorkbenchIntents();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/not found/i.test(msg)) {
        setCoreDemoErr(text.coreDepositNeedDebug);
      } else {
        setCoreDemoErr(msg);
      }
    } finally {
      setAutoMapFundBusy(false);
    }
  };

  const filteredUserWbIntents = useMemo(() => {
    return userWbIntents.filter((i) => {
      const byStatus = userWbStatusFilter === "all" || i.status === userWbStatusFilter;
      const q = userWbMerchantFilter.trim().toLowerCase();
      const byMerchantOrId =
        !q ||
        i.merchant.toLowerCase().includes(q) ||
        i.intentId.toLowerCase().includes(q);
      return byStatus && byMerchantOrId;
    });
  }, [userWbIntents, userWbStatusFilter, userWbMerchantFilter]);

  const userWbIntentListTotalPages = useMemo(() => {
    const n = filteredUserWbIntents.length;
    return Math.max(1, Math.ceil(n / USER_WB_INTENTS_PAGE_SIZE));
  }, [filteredUserWbIntents.length]);

  const pagedUserWbIntents = useMemo(() => {
    const start = (userWbIntentListPage - 1) * USER_WB_INTENTS_PAGE_SIZE;
    return filteredUserWbIntents.slice(start, start + USER_WB_INTENTS_PAGE_SIZE);
  }, [filteredUserWbIntents, userWbIntentListPage]);

  useEffect(() => {
    setUserWbIntentListPage(1);
  }, [userWbStatusFilter, userWbMerchantFilter]);

  useEffect(() => {
    if (userWbIntentListPage > userWbIntentListTotalPages) {
      setUserWbIntentListPage(userWbIntentListTotalPages);
    }
  }, [userWbIntentListPage, userWbIntentListTotalPages]);

  useEffect(() => {
    const q = userWbMerchantFilter.trim();
    const lower = q.toLowerCase();
    if (!q) return;

    const exact = userWbIntents.find((i) => i.intentId.toLowerCase() === lower);
    if (exact) {
      setIntentId(exact.intentId);
      userWbFilterLookupRef.current = null;
      return;
    }

    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (UUID_RE.test(q) && userWbFilterLookupRef.current !== lower) {
      userWbFilterLookupRef.current = lower;
      void getIntent(q)
        .then((one) => {
          setUserWbIntents((prev) =>
            prev.some((i) => i.intentId === one.intentId)
              ? prev
              : sortIntentsNewestFirst([...prev, one]),
          );
          setIntentId(one.intentId);
        })
        .catch(() => {
          userWbFilterLookupRef.current = null;
        });
      return;
    }

    if (filteredUserWbIntents.length === 1) {
      setIntentId(filteredUserWbIntents[0]!.intentId);
    }
  }, [userWbMerchantFilter, userWbIntents, filteredUserWbIntents]);

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


  const onCreate = async (): Promise<string | null> => {
    setError(null);
    setRefundResult(null);
    setBusy("create");
    try {
      let body: Record<string, unknown> = { ...defaultCreateBody };
      if (isPublicUsdcTestnet(targetChainId)) {
        if (!address) {
          throw new Error(
            text.publicTestnetConnectFirst.replace(
              "{chain}",
              chainDisplayName(targetChainId, locale),
            ),
          );
        }
        const maxRel = Number.parseInt(sepoliaMaxReleases, 10);
        if (!Number.isInteger(maxRel) || maxRel < 1) {
          throw new Error(text.releaseCountInvalid);
        }
        const durationSeconds = parseCycleHoursToDurationSeconds(sepoliaCycleHours);
        const dec = demoUsdcDecimals(targetChainId);
        const { amountTotal, amountPerLesson } = publicTestnetUsdcToIntentAmounts(
          sepoliaTotalUsdc,
          maxRel,
          dec,
        );
        const asset =
          targetChainId === HASHKEY_TESTNET_CHAIN_ID
            ? getAddress(defaultDemoAssetAddress(targetChainId))
            : (() => {
                const assetTrim = sepoliaAssetAddress.trim();
                return assetTrim
                  ? getAddress(assetTrim as `0x${string}`)
                  : getAddress(defaultDemoAssetAddress(targetChainId));
              })();
        let merchantResolved: `0x${string}`;
        try {
          merchantResolved = getAddress(createMerchantAddress.trim() as `0x${string}`);
        } catch {
          throw new Error(text.invalidMerchantAddress);
        }
        body = {
          ...body,
          asset,
          user: getAddress(address),
          merchant: merchantResolved,
          amountTotal,
          amountPerLesson,
          maxReleases: maxRel,
          durationSeconds,
        };
      } else if (isConfluxCrossSpace) {
        if (!effectiveAddress) {
          throw new Error(
            text.publicTestnetConnectFirst.replace(
              "{chain}",
              chainDisplayName(targetChainId, locale),
            ),
          );
        }
        const maxRel = Number.parseInt(eSpaceReleasesDisplay, 10);
        if (!Number.isInteger(maxRel) || maxRel < 1) {
          throw new Error(text.releaseCountInvalid);
        }
        const durationSeconds = parseCycleHoursToDurationSeconds(eSpaceCycleDisplay);
        const dec = demoUsdcDecimals(targetChainId);
        const { amountTotal, amountPerLesson } = publicTestnetUsdcToIntentAmounts(
          eSpaceTotalDisplay,
          maxRel,
          dec,
        );
        let merchantResolved: `0x${string}`;
        try {
          merchantResolved = getAddress(eSpaceMerchantDisplay as `0x${string}`);
        } catch {
          throw new Error(text.invalidMerchantAddress);
        }
        const userResolved = getAddress(effectiveAddress as `0x${string}`);
        body = {
          ...body,
          asset: getAddress(defaultDemoAssetAddress(targetChainId)),
          user: userResolved,
          merchant: merchantResolved,
          amountTotal,
          amountPerLesson,
          maxReleases: maxRel,
          durationSeconds,
        };
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
      if (crossSpaceEnabled) {
        const link = row.escrowId
          ? await getCoreIntentLinkByEscrowId(row.escrowId).catch(() => null)
          : await getCoreIntentLinkByIntentId(id).catch(() => null);
        if (link) setCoreIntentLink(link);
      }
      applyWizardTransition("create_to_fund");
      return id;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const onApprove = async () => {
    if (!intent) return;
    setError(null);
    if (intent.status !== "awaiting_funding") {
      setError(text.stepAlreadyFunded);
      return;
    }
    if (!address) {
      setError(text.fundingNeedWallet);
      return;
    }
    try {
      if (getAddress(address) !== getAddress(intent.user)) {
        setError(text.fundingWalletMismatchHint);
        return;
      }
    } catch {
      setError(text.fundingWalletMismatchHint);
      return;
    }
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
    if (intent.status !== "awaiting_funding") {
      setError(text.stepAlreadyFunded);
      return;
    }
    if (!address) {
      setError(text.fundingNeedWallet);
      return;
    }
    try {
      if (getAddress(address) !== getAddress(intent.user)) {
        setError(text.fundingWalletMismatchHint);
        return;
      }
    } catch {
      setError(text.fundingWalletMismatchHint);
      return;
    }
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

  const onRegisterFundingTxPaste = async () => {
    if (!intent) return;
    setError(null);
    const raw = registerFundingTxInput.trim();
    if (!isHash(raw)) {
      setError(text.invalidTxHash);
      return;
    }
    setBusy("register-tx");
    try {
      await postFundingTx(intent.intentId, raw);
      setLastTx(raw);
      setRegisterFundingTxInput("");
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
    setReleaseSubmitCooldown(false);
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
      await saveReleaseSignature(intent.intentId, "user", sig);
      setReleasePrep(prep);
      await refreshIntent();
      const sigs = await getReleaseSignatures(intent.intentId);
      setUserSig(sigs.userSig ?? sig);
      setMerchantSig(sigs.merchantSig);
      const id = intent.intentId.trim();
      const snapshot: StoredReleaseState = {
        userSig: sigs.userSig ?? sig,
        merchantSig: sigs.merchantSig,
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

  const onReleaseSubmit = async () => {
    if (!intent) {
      setError(text.needBothSigs);
      return;
    }
    if (releaseSubmitInFlightRef.current || releaseSubmitCooldown) return;

    setError(null);
    setReleaseHint(null);
    releaseSubmitInFlightRef.current = true;
    setBusy("submit-release");
    try {
      // Force a fresh chain-backed nonce snapshot before submit.
      // If nonce already advanced, clear stale signatures and guide re-sign.
      const prep = await releasePrepare(intent.intentId);
      const prepMsg = releaseMessageFromApi(prep.typedData.message as Record<string, unknown>);
      if (prepMsg.nonce !== BigInt(intent.releaseNonce)) {
        clearLocalReleaseState(intent.intentId);
        setReleaseHint(text.nonceDesyncHint);
        await refreshIntent();
        return;
      }

      const sigs = await getReleaseSignatures(intent.intentId);
      const submitUserSig = userSig ?? sigs.userSig;
      const submitMerchantSig = merchantSig ?? sigs.merchantSig;
      if (!submitUserSig || !submitMerchantSig) {
        throw new Error(text.needBothSigs);
      }
      const res = await releaseSubmit(intent.intentId, submitUserSig, submitMerchantSig);
      setReleaseResult(res);
      if (res.ok && intent) {
        setIntent({
          ...intent,
          status: res.status as IntentRecord["status"],
          releaseNonce: res.releaseNonce,
          releaseCount: res.releaseCount,
          releasedTotal: res.releasedTotal,
        });
      }
      clearLocalReleaseState(intent.intentId);
      setReleaseSubmitCooldown(true);
      window.setTimeout(() => setReleaseSubmitCooldown(false), 4500);
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
      releaseSubmitInFlightRef.current = false;
      setBusy(null);
    }
  };

  const onRefundRemaining = async () => {
    if (!intent) return;
    setError(null);
    setBusy("refund");
    try {
      const out = await refundIntent(intent.intentId);
      setRefundResult(out as Record<string, unknown>);
      if (typeof out.txHash === "string") {
        setLastTx(out.txHash);
      }
      await refreshIntent();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const remainingAmount = useMemo(() => {
    if (!intent) return null;
    try {
      const total = BigInt(intent.amountTotal);
      const released = BigInt(intent.releasedTotal);
      return total > released ? total - released : BigInt(0);
    } catch {
      return null;
    }
  }, [intent]);

  const refundExpired = useMemo(() => {
    if (!intent?.expiresAt) return false;
    return Date.now() >= intent.expiresAt * 1000;
  }, [intent?.expiresAt]);

  const derivedWizardStep = useMemo(() => {
    if (!intent?.intentId?.trim()) return 2;
    if (intent.status === "awaiting_funding") return 3;
    return 4;
  }, [intent]);

  const [wizardStep, setWizardStep] = useState(2);

  /** 离开退款步骤后，不再展示上一笔「已退款」等底部操作提示 */
  useEffect(() => {
    if (wizardStep !== 5) setRefundResult(null);
  }, [wizardStep]);

  /** 切换 intentId 时清除上一笔操作的底部提示 */
  useEffect(() => {
    setRefundResult(null);
  }, [intentId]);

  /** 进入「新建意向」步骤时清除 nonce 等链上提示，避免与当前表单无关的提示残留 */
  useEffect(() => {
    if (wizardStep === 2) setReleaseHint(null);
  }, [wizardStep]);

  useEffect(() => {
    if (wizardStep !== 3) return;
    setFundingOpsOpen(!isConfluxCrossSpace);
  }, [isConfluxCrossSpace, wizardStep]);

  useEffect(() => {
    applyWizardTransition("sync_from_intent", { derivedStep: derivedWizardStep });
  }, [applyWizardTransition, derivedWizardStep]);

  useEffect(() => {
    if (!intentListSelectNavigate) return;
    if (wizardStep !== 1) return;
    if (!intent?.intentId?.trim()) return;
    if (intent.intentId !== intentId.trim()) return;
    setWizardStep(derivedWizardStep);
    setIntentListSelectNavigate(false);
  }, [intentListSelectNavigate, wizardStep, intent, intentId, derivedWizardStep]);

  useEffect(() => {
    if (wizardStep !== 1) return;
    void reloadUserWorkbenchIntents();
  }, [wizardStep, reloadUserWorkbenchIntents]);

  const canSelectWizardStep = (step: number) => {
    if (step === 1 || step === 2) return true;
    if (!intent?.intentId?.trim()) return false;
    if (step === 3) return true;
    if (step === 4) return intent.status !== "awaiting_funding";
    if (step === 5) {
      if (intent.status !== "active" && intent.status !== "partially_settled") {
        return false;
      }
      return remainingAmount !== null && remainingAmount > BigInt(0);
    }
    return false;
  };

  const onSelectWizardStep = (step: number) => {
    if (!canSelectWizardStep(step)) {
      setError(text.stepNeedIntentFirst);
      return;
    }
    if (step === 4 && intent?.status === "awaiting_funding") {
      setError(text.stepWrongContext);
      return;
    }
    setError(null);
    setWizardStep(step);
  };

  const fundingEscrowAmountDisplay = useMemo(() => {
    if (!intent?.amountTotal?.trim()) return "—";
    try {
      return formatUnits(BigInt(intent.amountTotal), demoUsdcDecimals(targetChainId));
    } catch {
      return intent.amountTotal;
    }
  }, [intent?.amountTotal]);

  const lastTxExplorerUrl =
    lastTx && /^0x[a-fA-F0-9]+$/.test(lastTx)
      ? blockExplorerTxUrl(targetChainId, lastTx)
      : null;

  const autoFlowFundingTxExplorerUrl =
    autoFlowFundingTxHash && /^0x[a-fA-F0-9]+$/.test(autoFlowFundingTxHash)
      ? blockExplorerTxUrl(targetChainId, autoFlowFundingTxHash)
      : null;

  const createLockedTotalUsdc = useMemo(() => {
    if (isConfluxCrossSpace) {
      const configured =
        process.env.NEXT_PUBLIC_DEMO_AMOUNT_TOTAL?.trim() ||
        process.env.NEXT_PUBLIC_DEFAULT_ESCROW_USDC?.trim();
      return configured && configured.length > 0 ? configured : sepoliaTotalUsdc;
    }
    if (intent?.amountTotal?.trim()) {
      try {
        return formatUnits(BigInt(intent.amountTotal), demoUsdcDecimals(targetChainId));
      } catch {
        return intent.amountTotal;
      }
    }
    return sepoliaTotalUsdc;
  }, [intent?.amountTotal, isConfluxCrossSpace, sepoliaTotalUsdc]);
  const createLockedMaxReleases = useMemo(() => {
    if (isConfluxCrossSpace) {
      const configured = process.env.NEXT_PUBLIC_DEMO_MAX_RELEASES?.trim() ||
        process.env.NEXT_PUBLIC_DEFAULT_MAX_RELEASES?.trim();
      return configured && configured.length > 0 ? configured : sepoliaMaxReleases;
    }
    return intent?.maxReleases ? String(intent.maxReleases) : sepoliaMaxReleases;
  }, [intent?.maxReleases, isConfluxCrossSpace, sepoliaMaxReleases]);
  const createLockedCycleHours = useMemo(() => {
    if (isConfluxCrossSpace) {
      const configured = process.env.NEXT_PUBLIC_DEMO_CYCLE_HOURS?.trim() ||
        process.env.NEXT_PUBLIC_DEFAULT_CYCLE_HOURS?.trim();
      return configured && configured.length > 0 ? configured : sepoliaCycleHours;
    }
    if (intent?.durationSeconds && Number.isFinite(intent.durationSeconds)) {
      return String(intent.durationSeconds / 3600);
    }
    return sepoliaCycleHours;
  }, [intent?.durationSeconds, isConfluxCrossSpace, sepoliaCycleHours]);

  const coreOrderIdDisplay = coreIntentLink?.coreOrderId ?? "—";
  const coreEscrowIdDisplay = intent?.escrowId ?? coreIntentLink?.escrowId ?? "—";
  const coreBuyerHexDisplay = intent?.user || effectiveAddress || defaultCreateBodyStatic.user || "—";
  const coreSellerHexDisplay =
    intent?.merchant || process.env.NEXT_PUBLIC_DEMO_MERCHANT?.trim() || createMerchantAddress || "—";
  const [coreBuyerCfxBase32Display, setCoreBuyerCfxBase32Display] = useState("—");
  const [coreSellerCfxBase32Display, setCoreSellerCfxBase32Display] = useState("—");
  useEffect(() => {
    const hex = coreBuyerHexDisplay;
    if (hex === "—" || !/^0x[a-fA-F0-9]{40}$/.test(hex)) {
      setCoreBuyerCfxBase32Display("—");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("@conflux-dev/conflux-address-js/lib/browser.js");
        type EncodeFn = (hexAddress: string, netId: number) => string;
        type ModuleShape = { default?: { encode?: EncodeFn }; encode?: EncodeFn };
        const shaped = mod as unknown as ModuleShape;
        const encode: EncodeFn | undefined = shaped.default?.encode ?? shaped.encode;
        if (!encode) throw new Error("missing encode");
        const base32 = encode(hex, coreSpaceNetId);
        if (!cancelled) setCoreBuyerCfxBase32Display(base32);
      } catch {
        if (!cancelled) setCoreBuyerCfxBase32Display("—");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coreBuyerHexDisplay, coreSpaceNetId]);
  useEffect(() => {
    const hex = coreSellerHexDisplay;
    if (hex === "—" || !/^0x[a-fA-F0-9]{40}$/.test(hex)) {
      setCoreSellerCfxBase32Display("—");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("@conflux-dev/conflux-address-js/lib/browser.js");
        type EncodeFn = (hexAddress: string, netId: number) => string;
        type ModuleShape = { default?: { encode?: EncodeFn }; encode?: EncodeFn };
        const shaped = mod as unknown as ModuleShape;
        const encode: EncodeFn | undefined = shaped.default?.encode ?? shaped.encode;
        if (!encode) throw new Error("missing encode");
        const base32 = encode(hex, coreSpaceNetId);
        if (!cancelled) setCoreSellerCfxBase32Display(base32);
      } catch {
        if (!cancelled) setCoreSellerCfxBase32Display("—");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coreSellerHexDisplay, coreSpaceNetId]);
  const coreDemoTotalDisplay =
    process.env.NEXT_PUBLIC_DEMO_AMOUNT_TOTAL?.trim() ||
    process.env.NEXT_PUBLIC_DEFAULT_ESCROW_USDC?.trim() ||
    createLockedTotalUsdc ||
    "—";
  const coreDemoReleasesDisplay =
    process.env.NEXT_PUBLIC_DEMO_MAX_RELEASES?.trim() ||
    process.env.NEXT_PUBLIC_DEFAULT_MAX_RELEASES?.trim() ||
    createLockedMaxReleases ||
    "—";
  const eSpaceUserDisplay = isConfluxCrossSpace
    ? intent?.user || defaultCreateBodyStatic.user || "—"
    : effectiveAddress || intent?.user || defaultCreateBodyStatic.user || "—";
  const eSpaceMerchantDisplay =
    process.env.NEXT_PUBLIC_DEMO_MERCHANT?.trim() || intent?.merchant || createMerchantAddress || "—";
  const eSpaceTotalDisplay =
    process.env.NEXT_PUBLIC_DEMO_AMOUNT_TOTAL?.trim() ||
    process.env.NEXT_PUBLIC_DEFAULT_ESCROW_USDC?.trim() ||
    createLockedTotalUsdc ||
    "—";
  const eSpaceReleasesDisplay =
    process.env.NEXT_PUBLIC_DEMO_MAX_RELEASES?.trim() ||
    process.env.NEXT_PUBLIC_DEFAULT_MAX_RELEASES?.trim() ||
    createLockedMaxReleases ||
    "—";
  const eSpaceCycleDisplay =
    process.env.NEXT_PUBLIC_DEMO_CYCLE_HOURS?.trim() ||
    process.env.NEXT_PUBLIC_DEFAULT_CYCLE_HOURS?.trim() ||
    createLockedCycleHours ||
    "—";
  const coreMappedTxHash = coreIntentLink?.mappedTxHash ?? null;
  const coreMappedTxExplorerUrl =
    coreMappedTxHash && /^0x[a-fA-F0-9]{64}$/.test(coreMappedTxHash)
      ? blockExplorerTxUrl(targetChainId, coreMappedTxHash)
      : null;
  const coreFlowSteps = [
    { key: "core", label: text.coreStepCore, done: Boolean(coreIntentLink?.coreOrderId) },
    { key: "adapter", label: text.coreStepAdapter, done: Boolean(coreIntentLink?.escrowId) },
    { key: "escrow", label: text.coreStepEscrow, done: coreEscrowIdDisplay !== "—" },
  ];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[28rem] flex-col gap-6 px-4 pb-12 pt-6 sm:max-w-3xl sm:px-6">
      <header className="payfi-card space-y-4 p-5">
        <div className="flex items-start gap-3">
          <PayFiLogo />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              <span className="payfi-title-gradient">{text.userWorkbench}</span>
            </h1>
          </div>
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

      <nav
        className="payfi-card flex flex-wrap gap-2 p-3 sm:px-4"
        aria-label="PayFi demo steps"
      >
        {([1, 2, 3, 4, 5] as const).map((step) => (
          <button
            key={step}
            type="button"
            disabled={!canSelectWizardStep(step)}
            onClick={() => onSelectWizardStep(step)}
            className={`rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
              wizardStep === step
                ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40"
                : "bg-white/5 text-zinc-400 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            }`}
          >
            {step === 1
              ? text.stepContractIntent
              : step === 2
                ? text.stepCreate
                : step === 3
                  ? text.stepFund
                  : step === 4
                    ? text.stepRelease
                    : text.stepRefundNav}
          </button>
        ))}
      </nav>

      {wizardStep === 1 && (
        <section className="payfi-card space-y-4 p-5">
          <div className="flex flex-col gap-2 md:flex-row">
            <select
              value={userWbStatusFilter}
              onChange={(e) => setUserWbStatusFilter(e.target.value)}
              className="payfi-select md:max-w-[11rem]"
            >
              <option value="all">{text.allStatus}</option>
              <option value="awaiting_funding">
                {intentStatusLabel("awaiting_funding", locale)}
              </option>
              <option value="active">{intentStatusLabel("active", locale)}</option>
              <option value="partially_settled">
                {intentStatusLabel("partially_settled", locale)}
              </option>
              <option value="settled">{intentStatusLabel("settled", locale)}</option>
              <option value="refunded">{intentStatusLabel("refunded", locale)}</option>
            </select>
            <input
              value={userWbMerchantFilter}
              onChange={(e) => setUserWbMerchantFilter(e.target.value)}
              placeholder={text.userWorkbenchIntentSearchPlaceholder}
              className="payfi-input flex-1"
            />
          </div>
          {userWbIntentsLoading ? (
            <p className="text-sm text-zinc-500">{text.userIntentListLoading}</p>
          ) : (
            <div className="space-y-2">
              {pagedUserWbIntents.map((i) => (
                <div
                  key={i.intentId}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setIntentListSelectNavigate(true);
                    setIntentId(i.intentId);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setIntentListSelectNavigate(true);
                      setIntentId(i.intentId);
                    }
                  }}
                  className={`payfi-card payfi-card-hover flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-left outline-none transition ${
                    intentId.trim() === i.intentId ? "ring-1 ring-inset ring-sky-500/45" : ""
                  }`}
                >
                  <span className="truncate font-mono text-[11px] text-zinc-300">{i.intentId}</span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {intentStatusLabel(i.status, locale)}
                  </span>
                </div>
              ))}
            </div>
          )}
          {filteredUserWbIntents.length > USER_WB_INTENTS_PAGE_SIZE && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
              <button
                type="button"
                disabled={userWbIntentListPage <= 1}
                onClick={() => setUserWbIntentListPage((p) => Math.max(1, p - 1))}
                className="payfi-btn-secondary text-xs"
              >
                {text.paginationPrev}
              </button>
              <span className="text-xs text-zinc-500">
                {text.paginationPage
                  .replace("{page}", String(userWbIntentListPage))
                  .replace("{total}", String(userWbIntentListTotalPages))}
              </span>
              <button
                type="button"
                disabled={userWbIntentListPage >= userWbIntentListTotalPages}
                onClick={() =>
                  setUserWbIntentListPage((p) => Math.min(userWbIntentListTotalPages, p + 1))
                }
                className="payfi-btn-secondary text-xs"
              >
                {text.paginationNext}
              </button>
            </div>
          )}
        </section>
      )}

      {wizardStep === 2 && (
        <section className="payfi-card space-y-4 p-5">
          <h2 className="text-base font-semibold text-zinc-100">{text.createContractIntent}</h2>
          {(isPublicUsdcTestnet(targetChainId) || crossSpaceEnabled) && (
            <>
              <Field label={text.merchantAddressLabel}>
                <input
                  className="payfi-input font-mono text-xs"
                  type="text"
                  spellCheck={false}
                  autoComplete="off"
                  value={createMerchantAddress}
                  onChange={(e) => setCreateMerchantAddress(e.target.value)}
                  placeholder={text.merchantAddressPlaceholder}
                />
              </Field>
              {targetChainId === baseSepolia.id && (
                <>
                  <p className="text-xs leading-relaxed text-zinc-500">
                    {text.baseSepoliaCreateHint.replace(
                      "{decimals}",
                      String(demoUsdcDecimals(targetChainId)),
                    )}
                  </p>
                  <Field label={text.usdcAddressLabel}>
                    <input
                      className="payfi-input font-mono text-xs"
                      type="text"
                      spellCheck={false}
                      autoComplete="off"
                      value={sepoliaAssetAddress}
                      onChange={(e) => setSepoliaAssetAddress(e.target.value)}
                      placeholder={defaultDemoAssetAddress(targetChainId)}
                    />
                  </Field>
                </>
              )}
              <div className="grid grid-cols-3 gap-2 sm:gap-4 [&>label]:min-w-0">
                <Field label={text.totalEscrowLabel}>
                  <input
                    className="payfi-input w-full min-w-0 font-mono text-sm"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={crossSpaceEnabled ? createLockedTotalUsdc : sepoliaTotalUsdc}
                    onChange={(e) => setSepoliaTotalUsdc(e.target.value)}
                    placeholder={text.totalEscrowPlaceholder}
                    disabled={crossSpaceEnabled}
                  />
                </Field>
                <Field label={text.releaseCountLabel}>
                  <input
                    className="payfi-input w-full min-w-0 font-mono text-sm"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    value={crossSpaceEnabled ? createLockedMaxReleases : sepoliaMaxReleases}
                    onChange={(e) =>
                      setSepoliaMaxReleases(e.target.value.replace(/\D/g, "") || "1")
                    }
                    disabled={crossSpaceEnabled}
                  />
                </Field>
                <Field label={text.cycleHoursLabel}>
                  <input
                    className="payfi-input w-full min-w-0 font-mono text-sm"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={crossSpaceEnabled ? createLockedCycleHours : sepoliaCycleHours}
                    onChange={(e) => setSepoliaCycleHours(e.target.value)}
                    placeholder={text.cycleHoursPlaceholder}
                    disabled={crossSpaceEnabled}
                  />
                </Field>
              </div>
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
        </section>
      )}

      {wizardStep === 3 && (
        <section className="payfi-card space-y-4 p-5">
          <h2 className="text-base font-semibold text-zinc-100">{text.stepFund}</h2>
          {crossSpaceEnabled && (
            <div className="rounded-xl border border-sky-900/40 bg-sky-950/20 p-3">
              <p className="text-xs font-semibold text-zinc-200">{text.coreOrderSectionTitle}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{text.coreOrderSectionHint}</p>
              <button
                type="button"
                onClick={() => void onRunCoreDemo()}
                disabled={coreDemoBusy}
                className="payfi-btn-primary mt-2 text-xs w-full sm:w-auto"
              >
                {coreDemoBusy ? text.coreDepositBusy : text.coreDepositBtn}
              </button>
              {coreDemoMsg ? <p className="mt-1 text-[11px] text-emerald-400/95">{coreDemoMsg}</p> : null}
              {coreDemoErr ? <p className="mt-1 text-[11px] text-amber-300/95">{coreDemoErr}</p> : null}
              <div className="mt-3 grid grid-cols-3 gap-2">
                {coreFlowSteps.map((step) => (
                  <div
                    key={step.key}
                    className={`rounded-md border px-2 py-2 text-center ${
                      step.done
                        ? "border-emerald-700/45 bg-emerald-950/25"
                        : "border-zinc-700/60 bg-zinc-900/50"
                    }`}
                  >
                    <p className="text-[11px] font-medium text-zinc-200">{step.label}</p>
                    <p className="mt-0.5 text-[10px] text-zinc-500">
                      {step.done ? text.stepStatusDone : text.stepStatusPending}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-1 text-[11px]">
                <p className="text-zinc-300">
                  <span className="payfi-label">{text.coreDemoBuyerLabel}:</span>{" "}
                  <span className="font-mono">{coreBuyerCfxBase32Display}</span>{" "}
                  <span className="text-zinc-500">(</span>
                  <span className="font-mono text-zinc-500">{coreBuyerHexDisplay}</span>
                  <span className="text-zinc-500">)</span>
                </p>
                <p className="text-zinc-300">
                  <span className="payfi-label">{text.coreDemoSellerLabel}:</span>{" "}
                  <span className="font-mono">{coreSellerCfxBase32Display}</span>{" "}
                  <span className="text-zinc-500">(</span>
                  <span className="font-mono text-zinc-500">{coreSellerHexDisplay}</span>
                  <span className="text-zinc-500">)</span>
                </p>
                <p className="text-zinc-300">
                  <span className="payfi-label">{text.coreDemoTotalLabel}:</span>{" "}
                  <span className="font-mono">{coreDemoTotalDisplay}</span>
                </p>
                <p className="text-zinc-300">
                  <span className="payfi-label">{text.coreDemoReleasesLabel}:</span>{" "}
                  <span className="font-mono">{coreDemoReleasesDisplay}</span>
                </p>
                <p className="text-zinc-300">
                  <span className="payfi-label">{text.coreOrderIdLabel}:</span>{" "}
                  <span className="font-mono">{coreOrderIdDisplay}</span>
                </p>
                <p className="text-zinc-300">
                  <span className="payfi-label">{text.coreEscrowIdLabel}:</span>{" "}
                  <span className="font-mono">{coreEscrowIdDisplay}</span>
                </p>
                <p className="text-zinc-300">
                  <span className="payfi-label">{text.coreMappedTxLabel}:</span>{" "}
                  <span className="font-mono">{coreMappedTxHash ?? "—"}</span>
                  {coreMappedTxExplorerUrl ? (
                    <>
                      {" "}
                      <a
                        href={coreMappedTxExplorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400 underline-offset-2 hover:underline"
                      >
                        {text.coreMappedTxView}
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
            </div>
          )}
          {crossSpaceEnabled && (
            <div className="rounded-xl border border-violet-900/35 bg-violet-950/20 p-3">
              <p className="text-xs font-semibold text-zinc-200">{text.espaceOrderSectionTitle}</p>
              <div className="mt-2 space-y-1 text-[11px] text-zinc-300">
                <p>
                  <span className="payfi-label">{text.espaceUserLabel}:</span>{" "}
                  <span className="font-mono">{eSpaceUserDisplay}</span>
                </p>
                <p>
                  <span className="payfi-label">{text.espaceMerchantLabel}:</span>{" "}
                  <span className="font-mono">{eSpaceMerchantDisplay}</span>
                </p>
                <p>
                  <span className="payfi-label">{text.espaceTotalLabel}:</span>{" "}
                  <span className="font-mono">{eSpaceTotalDisplay}</span>
                </p>
                <p>
                  <span className="payfi-label">{text.espaceReleasesLabel}:</span>{" "}
                  <span className="font-mono">{eSpaceReleasesDisplay}</span>
                </p>
                <p>
                  <span className="payfi-label">{text.espaceCycleLabel}:</span>{" "}
                  <span className="font-mono">{eSpaceCycleDisplay}</span>
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {isConfluxCrossSpace && (
                  <button
                    type="button"
                    disabled={Boolean(busy) || autoMapFundBusy || coreDemoBusy}
                    onClick={() => void onAutoMapAndFundDemo()}
                    className="payfi-btn-primary w-full sm:w-auto"
                  >
                    {autoMapFundBusy ? text.autoMapFundBusy : text.autoMapFundBtn}
                  </button>
                )}
              </div>
              <div className="mt-3 rounded-md border border-white/10 bg-black/20 px-2.5 py-2 text-[11px]">
                <p className="pb-1 text-zinc-300">{text.autoFlowSummaryTitle}</p>
                <p className="text-zinc-400">
                  <span className="payfi-label">{text.autoFlowIntentId}:</span>{" "}
                  <span className="font-mono">{intentId || "—"}</span>
                </p>
                <p className="text-zinc-400">
                  <span className="payfi-label">{text.autoFlowCoreOrderId}:</span>{" "}
                  <span className="font-mono">{coreOrderIdDisplay}</span>
                </p>
                <p className="text-zinc-400">
                  <span className="payfi-label">{text.autoFlowEscrowId}:</span>{" "}
                  <span className="font-mono">{coreEscrowIdDisplay}</span>
                </p>
                <p className="text-zinc-400">
                  <span className="payfi-label">{text.autoFlowFundingTx}:</span>{" "}
                  <span className="font-mono">{autoFlowFundingTxHash ?? "—"}</span>
                  {autoFlowFundingTxExplorerUrl ? (
                    <>
                      {" "}
                      <a
                        href={autoFlowFundingTxExplorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400 underline-offset-2 hover:underline"
                      >
                        {text.explorerViewTx}
                      </a>
                    </>
                  ) : null}
                </p>
              </div>
            </div>
          )}
          {!intent?.intentId?.trim() ? (
            <p className="text-sm text-zinc-400">{text.stepNeedIntentFirst}</p>
          ) : intent.status !== "awaiting_funding" ? (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed text-zinc-400">{text.stepAlreadyFunded}</p>
              <button
                type="button"
                onClick={() => setWizardStep(4)}
                className="payfi-btn-secondary"
              >
                {text.stepRelease} →
              </button>
            </div>
          ) : (
            <>
              {isConfluxCrossSpace && !fundingOpsOpen ? (
                <div className="rounded-xl border border-white/8 bg-black/25 px-3 py-3">
                  <p className="text-[11px] leading-relaxed text-zinc-400">{text.fundOpsCollapsedHint}</p>
                  <button
                    type="button"
                    onClick={() => setFundingOpsOpen(true)}
                    className="payfi-btn-secondary mt-2 text-xs"
                  >
                    {text.expandFundOpsBtn}
                  </button>
                </div>
              ) : null}
              {(!isConfluxCrossSpace || fundingOpsOpen) && (
                <>
              <div className="space-y-2 text-sm">
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                  <span className="payfi-label shrink-0 text-zinc-400">
                    {text.fundingNetworkLabel}{" "}
                    <span className="font-normal text-zinc-500">{text.fundingNetworkHint}</span>
                  </span>
                  <span className="break-words font-mono text-zinc-200">
                    {chainDisplayName(targetChainId, locale)} · chainId {targetChainId}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                  <span className="payfi-label shrink-0 text-zinc-400">
                    {text.fundingPaymentAccountLabel}
                  </span>
                  <span className="break-all font-mono text-zinc-200">{intent.user}</span>
                </div>
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                  <span className="payfi-label shrink-0 text-zinc-400">
                    {text.fundingMerchantAddressLabel}
                  </span>
                  <span className="break-all font-mono text-zinc-200">{intent.merchant}</span>
                </div>
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                  <span className="payfi-label shrink-0 text-zinc-400">
                    {text.fundingDepositAmountLabel}
                  </span>
                  <span className="font-mono text-zinc-200">{fundingEscrowAmountDisplay}</span>
                </div>
              </div>
              <div className="rounded-xl border border-white/8 bg-black/25 px-3 py-3">
                <p className="text-[11px] font-semibold text-zinc-300">{text.fundingPrecheckTitle}</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-zinc-500">
                  <li>{text.fundingCheck1}</li>
                  <li>{text.fundingCheck2}</li>
                  <li>{text.fundingCheck3}</li>
                  <li>{text.fundingCheck4}</li>
                  <li>{text.fundingCheck5}</li>
                </ul>
                {!effectiveAddress && (
                  <p className="mt-2 text-[11px] text-zinc-500">{text.fundingNeedWallet}</p>
                )}
                {effectiveAddress && !fundingWalletAddressMatch && (
                  <p className="mt-2 text-[11px] text-amber-200/90">{text.fundingWalletMismatchHint}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={fundingOnChainDisabled}
                  onClick={() => void onApprove()}
                  className="payfi-btn-primary"
                >
                  {busy === "approve" ? text.approving : text.approveToken}
                </button>
                <button
                  type="button"
                  disabled={fundingOnChainDisabled}
                  onClick={() => void onDeposit()}
                  className="payfi-btn-primary"
                >
                  {busy === "deposit" ? text.depositing : text.depositEscrow}
                </button>
              </div>
              {lastTx && (
                <p className="font-mono text-[11px] text-zinc-500">
                  {text.lastTx}: {lastTx}
                  {lastTxExplorerUrl ? (
                    <>
                      {" "}
                      <a
                        href={lastTxExplorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-400 underline-offset-2 hover:underline"
                      >
                        {text.explorerViewTx}
                      </a>
                    </>
                  ) : null}
                </p>
              )}
              {targetChainId === HASHKEY_TESTNET_CHAIN_ID && (
                <HashkeyFundingAlternative
                  paymentUrl={intent.paymentUrl}
                  registerTxValue={registerFundingTxInput}
                  onRegisterTxChange={setRegisterFundingTxInput}
                  onRegisterSubmit={onRegisterFundingTxPaste}
                  busy={busy}
                  labels={{
                    eitherOrNote: text.fundEitherOrNote,
                    cardTitle: text.hspAlternativeCardTitle,
                    gatewayTitle: text.gatewayOptionalTitle,
                    gatewayOpen: text.gatewayOpen,
                    noPaymentUrl: text.hspNoPaymentUrl,
                    registerTitle: text.hspRegisterTitle,
                    registerHint: text.hspRegisterHint,
                    registerPlaceholder: text.registerTxPlaceholder,
                    registerSubmit: text.registerTxSubmit,
                    registerBusy: text.registerTxBusy,
                  }}
                />
              )}
                </>
              )}
            </>
          )}
        </section>
      )}

      {wizardStep === 4 && !intent?.intentId?.trim() && (
        <p className="payfi-card p-5 text-sm text-zinc-400">{text.stepNeedIntentFirst}</p>
      )}

      {wizardStep === 4 && intent && intent.status === "awaiting_funding" && (
        <div className="payfi-card space-y-3 p-5">
          <p className="text-sm text-zinc-400">{text.stepNotFundedYet}</p>
          <button
            type="button"
            onClick={() => setWizardStep(3)}
            className="payfi-btn-secondary"
          >
            {text.stepFund} →
          </button>
        </div>
      )}

      {wizardStep === 4 &&
        intent &&
        (intent.status === "active" || intent.status === "partially_settled") && (
          <section className="payfi-card space-y-4 p-5">
            <h2 className="text-base font-semibold text-zinc-100">{text.release}</h2>
            <DualSignIntentFacts
              intent={intent}
              chainId={targetChainId}
              locale={locale}
              onRefresh={() => void refreshIntent()}
              labels={{
                title: text.intentFactsTitle,
                contractIntentId: text.contractIntentId,
                userAddress: text.userAddress,
                merchantAddress: text.expectedMerchant,
                releaseProgressLabel: text.releaseProgressLabel,
                escrowTotal: text.escrowTotal,
                merchantReceived: text.merchantReceived,
                userEscrowAmount: text.userEscrowAmount,
                releaseNonce: text.releaseNonce,
                refreshContract: text.refreshContract,
                userSignRole: text.userSignRole,
                merchantSignRole: text.merchantSignRole,
                pendingSign: text.pendingSign,
                timeUnknown: text.timeUnknown,
                amountsSection: text.amountsSection,
                amountUnitUsdc: text.amountUnitUsdc,
                amountUnitMock: text.amountUnitMock,
              }}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={Boolean(busy) || onWrongChain}
                onClick={() => void onSignUser()}
                className="payfi-btn-primary"
              >
                {busy === "sign-user" ? text.signing : text.signAsUser}
              </button>
              <button
                type="button"
                disabled={
                  Boolean(busy) ||
                  releaseSubmitCooldown ||
                  !displayUserSig ||
                  !displayMerchantSig
                }
                onClick={() => void onReleaseSubmit()}
                className="payfi-btn-primary"
              >
                {busy === "submit-release" ? text.submitting : text.submitRelease}
              </button>
            </div>
            {displayUserSig && (
              <p className="text-xs text-zinc-500">
                {displayMerchantSig ? text.readySubmitRelease : text.waitingMerchantSig}
              </p>
            )}
            {releaseResult && (
              <pre className="overflow-auto rounded-xl border border-white/5 bg-black/40 p-3 text-xs text-zinc-400">
                {JSON.stringify(releaseResult, null, 2)}
              </pre>
            )}
          </section>
        )}

      {wizardStep === 5 &&
        intent &&
        (intent.status === "active" || intent.status === "partially_settled") &&
        remainingAmount !== null &&
        remainingAmount > BigInt(0) && (
          <section className="payfi-card space-y-4 p-5">
            <h2 className="text-base font-semibold text-zinc-100">{text.refundRemaining}</h2>
            <p className="text-xs text-zinc-500">
              {refundExpired ? text.refundExpiredReady : text.refundNotExpired}
              {!refundExpired && intent.expiresAt
                ? ` (${new Date(intent.expiresAt * 1000).toLocaleString()})`
                : ""}
            </p>
            <div className="grid gap-2 rounded-xl border border-white/8 bg-black/35 px-3 py-3 text-xs text-zinc-400">
              <p>
                {text.refundTarget}{" "}
                <span className="font-mono text-zinc-300">{intent.user}</span>
              </p>
              <p>
                {text.refundAmount}{" "}
                <span className="font-mono text-zinc-300">
                  {isPublicUsdcTestnet(targetChainId)
                    ? `${formatUnits(remainingAmount, demoUsdcDecimals(targetChainId))} USDC (${remainingAmount.toString()})`
                    : remainingAmount.toString()}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={Boolean(busy) || !refundExpired}
                onClick={() => void onRefundRemaining()}
                className="payfi-btn-primary"
              >
                {busy === "refund" ? text.refunding : text.refundRemainingBtn}
              </button>
            </div>
            {refundResult && (
              <pre className="overflow-auto rounded-xl border border-white/5 bg-black/40 p-3 text-xs text-zinc-400">
                {JSON.stringify(refundResult, null, 2)}
              </pre>
            )}
          </section>
        )}

      {(releaseHint || releaseSubmitCooldown || refundResult) && (
        <aside
          className="payfi-card space-y-3 border border-amber-500/25 bg-amber-500/5 p-4"
          aria-live="polite"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wide text-amber-200/80">
            {text.hintCardTitle}
          </h2>
          {releaseHint && (
            <p className="text-sm leading-relaxed text-amber-100/95">{releaseHint}</p>
          )}
          {releaseSubmitCooldown && (
            <p className="text-sm leading-relaxed text-amber-100/95">{text.submitCooldownNote}</p>
          )}
          {refundResult && (
            <p className="text-sm leading-relaxed text-amber-100/95">{text.refundDone}</p>
          )}
        </aside>
      )}
    </main>
  );
}
