import { redirect } from "next/navigation";

/** The Heizung opens with the first SIA 108 checklist. */
export default async function HeatingPage({ params }: PageProps<"/projekte/[id]/heizung">) {
  redirect(`/projekte/${(await params).id}/heizung/31`);
}
