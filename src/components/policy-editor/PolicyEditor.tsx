'use client';

/**
 * PolicyEditor — 이 요청에서 각 도구가 허용되는지 편집하는 컨트롤드 컴포넌트
 *
 * - 도구 이름과 권한 코드(ALLOWED 등)는 번역하지 않고 그대로 보여준다. 설명 문구만 번역한다.
 * - REQUIRES_APPROVAL의 승인은 테스트용 Mock이다. 실제 승인 시스템이 아니라는 안내를 항상 함께 보인다.
 * - 기본값에서 바뀐 규칙은 색이 아니라 "수정됨" 텍스트(+ 아이콘)로 표시한다.
 */

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { isPolicyModified, isRuleModified, type PolicyEditorRule } from '@/lib/experiment-form';
import { TOOL_PERMISSIONS } from '@/lib/constants';
import type { ToolPermission } from '@/lib/types';

interface PolicyEditorProps {
  rules: PolicyEditorRule[];
  /** 비교 기준이 되는 시나리오 기본 규칙 */
  defaultRules: PolicyEditorRule[];
  onChange: (rules: PolicyEditorRule[]) => void;
  disabled?: boolean;
}

const PERMISSION_KEY = {
  ALLOWED: 'allowed',
  DENIED: 'denied',
  REQUIRES_APPROVAL: 'requiresApproval',
} as const satisfies Record<ToolPermission, 'allowed' | 'denied' | 'requiresApproval'>;

const controlClass =
  'rounded-md border border-possessed-border bg-possessed-bg px-2 py-1.5 text-sm text-possessed-text ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-possessed-alert ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

export function PolicyEditor({ rules, defaultRules, onChange, disabled = false }: PolicyEditorProps) {
  const t = useTranslations('policy');
  const noticeId = useId();

  const modified = isPolicyModified(defaultRules, rules);
  const hasApprovalRule = rules.some((r) => r.permission === 'REQUIRES_APPROVAL');

  const update = (toolName: string, patch: Partial<PolicyEditorRule>) =>
    onChange(rules.map((r) => (r.toolName === toolName ? { ...r, ...patch } : r)));

  return (
    <fieldset className="rounded-lg border border-possessed-border bg-possessed-surface p-4" disabled={disabled}>
      <legend className="px-1 text-base font-semibold text-possessed-text">{t('title')}</legend>
      <p className="mb-3 text-sm text-possessed-muted">{t('intro')}</p>

      <ul className="space-y-3">
        {rules.map((rule) => {
          const changed = isRuleModified(
            defaultRules.find((d) => d.toolName === rule.toolName),
            rule
          );

          return (
            <li key={rule.toolName} className="rounded-md border border-possessed-border/60 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <code className="min-w-44 font-mono text-sm text-possessed-text">{rule.toolName}</code>

                <select
                  aria-label={`${t('permission')}: ${rule.toolName}`}
                  className={controlClass}
                  value={rule.permission}
                  onChange={(e) => update(rule.toolName, { permission: e.target.value as ToolPermission })}
                >
                  {TOOL_PERMISSIONS.map((permission) => (
                    <option key={permission} value={permission}>
                      {t(PERMISSION_KEY[permission])} — {permission}
                    </option>
                  ))}
                </select>

                {changed && (
                  <span className="inline-flex items-center gap-1 font-mono text-xs text-possessed-alert">
                    <span aria-hidden="true">●</span>
                    <span>{t('modified')}</span>
                  </span>
                )}
              </div>

              {rule.permission === 'REQUIRES_APPROVAL' && (
                <label className="mt-2 flex items-center gap-2 text-sm text-possessed-text">
                  <input
                    type="checkbox"
                    className="size-4 accent-possessed-crimson"
                    checked={rule.approvalGranted}
                    aria-describedby={noticeId}
                    onChange={(e) => update(rule.toolName, { approvalGranted: e.target.checked })}
                  />
                  {t('mockApprovalGranted')}
                </label>
              )}
            </li>
          );
        })}
      </ul>

      {hasApprovalRule && (
        <p id={noticeId} role="note" className="mt-3 text-xs text-possessed-muted">
          {t('mockApprovalNotice')}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-possessed-border pt-3">
        <p className="text-xs text-possessed-muted">{modified ? t('customPolicy') : t('usingDefault')}</p>
        {modified && (
          <button
            type="button"
            onClick={() => onChange(defaultRules)}
            className="rounded-md border border-possessed-border px-3 py-1 text-xs text-possessed-text hover:bg-possessed-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-possessed-alert"
          >
            {t('resetToDefault')}
          </button>
        )}
      </div>
    </fieldset>
  );
}
