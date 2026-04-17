import { Badge } from '@/components/ui/badge';

export function UfcRankBadge({ championStatus, ranking }: { championStatus: string | null; ranking: number | null }) {
  if (championStatus === 'champion') {
    return <Badge tone="premium">Champion</Badge>;
  }
  if (typeof ranking === 'number') {
    return <Badge tone="brand">#{ranking}</Badge>;
  }
  return <Badge tone="muted">Unranked</Badge>;
}
