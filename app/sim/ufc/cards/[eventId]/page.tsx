import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ eventId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function toQueryString(params: Record<string, string | string[] | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") search.set(key, value);
    else if (Array.isArray(value)) value.forEach((entry) => search.append(key, entry));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export default async function UfcFightLabCardAlias({ params, searchParams }: PageProps) {
  const { eventId } = await params;
  const query = toQueryString((await searchParams) ?? {});
  redirect(`/sharkfights/ufc/cards/${encodeURIComponent(eventId)}${query}`);
}
