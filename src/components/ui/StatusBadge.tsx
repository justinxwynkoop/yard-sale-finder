import { SaleStatus } from '../../types';
import { Badge } from './Badge';

export function StatusBadge({ status }: { status: SaleStatus }) {
  if (status === 'active') {
    return (
      <Badge tone="live" dot>
        Live
      </Badge>
    );
  }
  if (status === 'winding_down') {
    return (
      <Badge tone="winding" dot>
        Ending soon
      </Badge>
    );
  }
  return <Badge tone="ended">Ended</Badge>;
}
