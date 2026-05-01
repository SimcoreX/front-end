import { SessionReplayPage } from "@/components/content/SessionReplayPage";

type SessionPageProps = {
  params: Promise<{ sessionId: string }>;
};

export default async function SessionPage({ params }: SessionPageProps) {
  const resolvedParams = await params;
  return <SessionReplayPage sessionId={resolvedParams.sessionId} />;
}
