import IntentDetail from "@/components/intent/intent-detail";

export default async function IntentDetailPage({
  params,
}: {
  params: Promise<{ intentId: string }>;
}) {
  const { intentId } = await params;
  return <IntentDetail intentId={intentId} />;
}
