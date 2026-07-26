import { redirect } from "next/navigation";

export default async function ReportRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/projects/${id}?tab=report`);
}
