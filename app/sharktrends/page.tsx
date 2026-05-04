import CommandBoardV2Page from "./command-board-v2/page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default function SharkTrendsPage(props: PageProps) {
  return <CommandBoardV2Page {...props} />;
}
