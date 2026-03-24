const API_BASE = "/api/payfi/v1";

const createForm = document.querySelector("#create-form");
const createResult = document.querySelector("#create-result");
const queryForm = document.querySelector("#query-form");
const queryInput = document.querySelector("#query-intent-id");
const queryResult = document.querySelector("#query-result");
const fundingForm = document.querySelector("#funding-form");
const fundingInput = document.querySelector("#funding-intent-id");
const fundingResult = document.querySelector("#funding-result");
const copyCalldataBtn = document.querySelector("#copy-calldata-btn");
const copyCastBtn = document.querySelector("#copy-cast-btn");
const copyFundingReportBtn = document.querySelector("#copy-funding-report-btn");
const copyStatus = document.querySelector("#copy-status");
const commandBuffer = document.querySelector("#command-buffer");
const releaseIntentInput = document.querySelector("#release-intent-id");
const copyReleasePipelineBtn = document.querySelector("#copy-release-pipeline-btn");
const releaseCopyStatus = document.querySelector("#release-copy-status");

let latestFundingData = "";
let latestFundingTo = "";

function showResult(node, payload, isError = false) {
  node.style.color = isError ? "#fca5a5" : "#93c5fd";
  node.textContent = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}

function cleanPayload(raw) {
  const payload = { ...raw };
  if (!payload.webhookUrl) delete payload.webhookUrl;
  payload.maxReleases = Number(payload.maxReleases);
  payload.durationSeconds = Number(payload.durationSeconds);
  return payload;
}

async function writeBufferAndCopy(text, statusNode, successText) {
  if (commandBuffer) {
    commandBuffer.value = text;
    commandBuffer.focus();
    commandBuffer.setSelectionRange(0, commandBuffer.value.length);
  }
  try {
    await navigator.clipboard.writeText(text);
    statusNode.textContent = successText;
  } catch (_error) {
    statusNode.textContent = "Filled textbox. Clipboard copy failed.";
  }
}

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fd = new FormData(createForm);
  const raw = Object.fromEntries(fd.entries());
  const payload = cleanPayload(raw);

  try {
    const res = await fetch(`${API_BASE}/intents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "create failed");
    showResult(createResult, data);
    if (data.intentId) {
      queryInput.value = data.intentId;
      fundingInput.value = data.intentId;
      if (releaseIntentInput) releaseIntentInput.value = data.intentId;
    }
  } catch (error) {
    showResult(createResult, error instanceof Error ? error.message : String(error), true);
  }
});

queryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const intentId = queryInput.value.trim();
  if (!intentId) {
    showResult(queryResult, "intentId is required", true);
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/intents/${encodeURIComponent(intentId)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "query failed");
    showResult(queryResult, data);
    if (releaseIntentInput) releaseIntentInput.value = intentId;
  } catch (error) {
    showResult(queryResult, error instanceof Error ? error.message : String(error), true);
  }
});

fundingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  copyStatus.textContent = "";
  latestFundingData = "";
  latestFundingTo = "";
  const intentId = fundingInput.value.trim();
  if (!intentId) {
    showResult(fundingResult, "intentId is required", true);
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/intents/${encodeURIComponent(intentId)}/funding/hint`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "funding hint failed");
    latestFundingData = data?.data || "";
    latestFundingTo = data?.to || "";
    showResult(fundingResult, data);
    if (releaseIntentInput) releaseIntentInput.value = intentId;
  } catch (error) {
    showResult(fundingResult, error instanceof Error ? error.message : String(error), true);
  }
});

copyCalldataBtn.addEventListener("click", async () => {
  copyStatus.textContent = "";
  if (!latestFundingData) {
    copyStatus.textContent = "No calldata yet.";
    return;
  }
  await writeBufferAndCopy(latestFundingData, copyStatus, "Shown below + copied.");
});

copyCastBtn.addEventListener("click", async () => {
  copyStatus.textContent = "";
  const intentId = fundingInput.value.trim();
  if (!intentId) {
    copyStatus.textContent = "Enter intentId first.";
    return;
  }
  try {
    const [intentRes, hintRes] = await Promise.all([
      fetch(`${API_BASE}/intents/${encodeURIComponent(intentId)}`),
      fetch(`${API_BASE}/intents/${encodeURIComponent(intentId)}/funding/hint`),
    ]);
    const intent = await intentRes.json();
    const hint = await hintRes.json();
    if (!intentRes.ok) throw new Error(intent?.error || "intent not found");
    if (!hintRes.ok) throw new Error(hint?.error || "funding hint failed");

    const to = hint.to;
    const asset = intent.asset;
    const amountTotal = intent.amountTotal;
    const agreementHash = intent.anchor.agreementHash;
    const sig =
      "createAndDeposit(address,address,uint128,uint128,uint16,uint64,bytes32,address)";
    const disputeZero = "0x0000000000000000000000000000000000000000";
    const argList = [
      intent.merchant,
      intent.asset,
      intent.amountTotal,
      intent.amountPerLesson,
      String(intent.maxReleases),
      String(intent.durationSeconds),
      agreementHash,
      disputeZero,
    ];
    const argsLines = argList.join(" \\\n  ");

    /** Approve 后再 createAndDeposit；无 # 行（交互式 zsh 默认不把 # 当注释） */
    const castCmd =
      `export PATH="$HOME/.foundry/bin:$PATH"\n` +
      `set -a && source .env && set +a\n` +
      `cast send \\\n` +
      `  --rpc-url /tmp/payfi-anvil.ipc \\\n` +
      `  --private-key "$USER_PRIVATE_KEY" \\\n` +
      `  ${asset} \\\n` +
      `  "approve(address,uint256)" \\\n` +
      `  ${to} \\\n` +
      `  ${amountTotal}\n` +
      `cast send \\\n` +
      `  --rpc-url /tmp/payfi-anvil.ipc \\\n` +
      `  --private-key "$USER_PRIVATE_KEY" \\\n` +
      `  ${to} \\\n` +
      `  "${sig}" \\\n` +
      `  ${argsLines}`;

    await writeBufferAndCopy(castCmd, copyStatus, "Shown below + copied cast command.");
  } catch (error) {
    copyStatus.textContent = error instanceof Error ? error.message : String(error);
  }
});

copyReleasePipelineBtn?.addEventListener("click", async () => {
  if (!releaseCopyStatus || !releaseIntentInput) return;
  releaseCopyStatus.textContent = "";
  const intentId = releaseIntentInput.value.trim();
  if (!intentId) {
    releaseCopyStatus.textContent = "Enter intentId first.";
    return;
  }
  const block =
    `export BASE=http://127.0.0.1:8787\n` +
    `INTENT_ID=${intentId}\n` +
    `export PATH="$HOME/.foundry/bin:$PATH"\n` +
    `set -a && source .env && set +a\n` +
    `PREP=$(curl -sS -X POST "$BASE/api/payfi/v1/intents/$INTENT_ID/release/prepare")\n` +
    `SIGS=$(echo "$PREP" | node scripts/sign-release.mjs)\n` +
    `USER_SIG=$(echo "$SIGS" | jq -r .userSig)\n` +
    `MERCHANT_SIG=$(echo "$SIGS" | jq -r .merchantSig)\n` +
    `curl -sS -X POST "$BASE/api/payfi/v1/intents/$INTENT_ID/release/submit" \\\n` +
    `  -H "Content-Type: application/json" \\\n` +
    `  -d "$(jq -n --arg u "$USER_SIG" --arg m "$MERCHANT_SIG" '{userSig:$u, merchantSig:$m}')" | jq .`;
  try {
    await navigator.clipboard.writeText(block);
    releaseCopyStatus.textContent = "Copied.";
  } catch (_error) {
    releaseCopyStatus.textContent = "Copy failed.";
  }
});

copyFundingReportBtn.addEventListener("click", async () => {
  copyStatus.textContent = "";
  const intentId = fundingInput.value.trim();
  if (!intentId) {
    copyStatus.textContent = "Enter intentId first.";
    return;
  }
  const cmd =
    `curl -sS -X POST http://127.0.0.1:8787/api/payfi/v1/intents/${intentId}/funding/tx ` +
    `-H "Content-Type: application/json" ` +
    `-d '{"txHash":"0x<PASTE_64_HEX_DIGITS>"}'`;
  await writeBufferAndCopy(cmd, copyStatus, "Shown below + copied funding curl.");
});
