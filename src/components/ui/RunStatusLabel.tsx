/**
 * RunStatusLabel — run 상태 표시 (아이콘 + 텍스트)
 *
 * 색만으로 구분하지 않는다. 문구는 messages의 `status.<STATUS>`에서 가져온다.
 */

import { useTranslations } from 'next-intl';
import type { Run } from '@/lib/types';

const STYLE: Record<Run['status'], { icon: string; colorClass: string }> = {
  PENDING:   { icon: '○', colorClass: 'text-possessed-muted' },
  RUNNING:   { icon: '…', colorClass: 'text-possessed-muted' },
  COMPLETED: { icon: '✓', colorClass: 'text-possessed-success' },
  FAILED:    { icon: '✗', colorClass: 'text-possessed-alert' },
};

export function RunStatusLabel({ status }: { status: Run['status'] }) {
  const t = useTranslations('status');
  const style = STYLE[status];

  return (
    <span className={`inline-flex items-center gap-1 font-mono text-xs ${style.colorClass}`}>
      <span aria-hidden="true">{style.icon}</span>
      <span>{t(status)}</span>
    </span>
  );
}
