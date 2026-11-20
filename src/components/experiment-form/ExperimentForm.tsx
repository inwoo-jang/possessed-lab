'use client';

/**
 * ExperimentForm — 실험 생성 + run 시작 폼
 *
 * 로직(요청 본문 구성, 검증, 제출 순서)은 lib/experiment-form.ts의 순수 함수에 있고,
 * 이 컴포넌트는 입력 상태와 표시만 맡는다.
 *
 * 설계 결정:
 *   - REPLAY_DEMO는 선택지에 없다 (사전 기록은 /demo에서만 만들어진다)
 *   - 시나리오마다 정책 편집 내용을 따로 기억한다 (시나리오를 오가도 편집이 사라지지 않음)
 *   - 모호한 문구(requiresPolicyReview)를 고르면 정책 확인 체크가 있어야 제출된다
 *   - 브라우저 기본 검증은 끈다 (그 메시지는 페이지 언어가 아니라 브라우저 언어를 따른다)
 *   - 성공하면 방금 시작한 run의 trace 화면으로 이동한다 (진행 상황이 거기서 폴링으로 갱신된다)
 */

import { useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { PolicyEditor } from '@/components/policy-editor/PolicyEditor';
import { useRouter } from '@/i18n/navigation';
import {
  MAX_NAME_LENGTH,
  getScenario,
  selectedVariant,
  submitErrorKey,
  submitExperiment,
  validateForm,
  type CreatedExperiment,
  type FormError,
  type FormRunMode,
  type FormState,
  type PolicyEditorRule,
  type ScenarioOption,
} from '@/lib/experiment-form';
import type { Locale } from '@/lib/types';

interface ExperimentFormProps {
  scenarios: ScenarioOption[];
  /** 서버에 LLM API 키가 설정되어 있는지 (키 값이 아니라 존재 여부만 받는다) */
  liveAvailable: boolean;
  initialRunMode: FormRunMode;
}

interface SubmitFailure {
  code: string;
  issues?: Array<{ path: string; message: string }>;
  /** 실험은 만들어졌고 run 시작만 실패한 경우 */
  experimentCreated: boolean;
}

const RUN_MODES: FormRunMode[] = ['DETERMINISTIC_TEST', 'LIVE_EXPERIMENT'];
const RUN_LOCALES: Locale[] = ['en', 'ko'];

const inputClass =
  'w-full rounded-md border border-possessed-border bg-possessed-bg px-3 py-2 text-sm text-possessed-text ' +
  'placeholder:text-possessed-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-possessed-alert ' +
  'aria-[invalid=true]:border-possessed-alert';

const legendClass = 'mb-2 text-base font-semibold text-possessed-text';

export function ExperimentForm({ scenarios, liveAvailable, initialRunMode }: ExperimentFormProps) {
  const t = useTranslations('experiment');
  const tErrors = useTranslations('experiment.errors');
  const tRun = useTranslations('runMode');
  const tLocale = useTranslations('locale');
  const uiLocale = useLocale() as Locale;
  const router = useRouter();
  const ids = useId();

  const [name, setName] = useState('');
  const [scenarioId, setScenarioId] = useState(scenarios[0].id);
  const [runMode, setRunMode] = useState<FormRunMode>(
    initialRunMode === 'LIVE_EXPERIMENT' && liveAvailable ? 'LIVE_EXPERIMENT' : 'DETERMINISTIC_TEST'
  );
  const [runLocale, setRunLocale] = useState<Locale>(uiLocale);
  const [variantId, setVariantId] = useState('');
  const [policyReviewConfirmed, setPolicyReviewConfirmed] = useState(false);
  const [rulesByScenario, setRulesByScenario] = useState<Record<string, PolicyEditorRule[]>>({});

  const [errors, setErrors] = useState<FormError[]>([]);
  const [failure, setFailure] = useState<SubmitFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const created = useRef<CreatedExperiment | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);

  const scenario = getScenario(scenarios, scenarioId) ?? scenarios[0];
  const rules = rulesByScenario[scenario.id] ?? scenario.defaultRules;
  const state: FormState = { name, scenarioId: scenario.id, runMode, runLocale, variantId, policyReviewConfirmed, rules };

  const variant = selectedVariant(scenario, state);
  const requestText = variant ? variant.request[runLocale] : scenario.baseRequest[runLocale];
  const isLive = runMode === 'LIVE_EXPERIMENT';
  const needsReview = isLive && variant?.requiresPolicyReview === true;

  const errorFor = (field: FormError['field']) => errors.find((e) => e.field === field);
  const nameError = errorFor('name');
  const reviewError = errorFor('policyReview');

  // 오류가 생기면 요약으로 포커스를 옮겨 스크린리더와 키보드 사용자가 바로 알 수 있게 한다
  useEffect(() => {
    if (errors.length > 0 || failure) alertRef.current?.focus();
  }, [errors, failure]);

  const onScenarioChange = (id: string) => {
    setScenarioId(id);
    setVariantId(''); // 변형은 시나리오에 속한다
    setPolicyReviewConfirmed(false);
  };

  const onVariantChange = (id: string) => {
    setVariantId(id);
    setPolicyReviewConfirmed(false); // 다른 문구에 대한 확인을 이어받지 않는다
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const found = validateForm(state, scenario, { liveAvailable });
    setErrors(found);
    setFailure(null);
    if (found.length > 0) return;

    setSubmitting(true);
    const result = await submitExperiment(state, scenario, { previous: created.current });

    if (result.ok) {
      router.push(`/experiments/${result.experimentId}/runs/${result.runId}/trace`);
      return; // 이동이 끝날 때까지 제출 상태를 유지해 중복 제출을 막는다
    }

    created.current = result.created ?? created.current;
    setFailure({ code: result.code, issues: result.issues, experimentCreated: Boolean(result.created) });
    setSubmitting(false);
  };

  const failureKey = failure ? submitErrorKey(failure.code) : null;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {(errors.length > 0 || failure) && (
        <div
          ref={alertRef}
          role="alert"
          tabIndex={-1}
          className="rounded-lg border border-possessed-crimson bg-possessed-surface p-4 text-sm focus-visible:outline-2 focus-visible:outline-possessed-alert"
        >
          {errors.length > 0 && (
            <>
              <p className="font-semibold text-possessed-alert">{tErrors('summary')}</p>
              <ul className="mt-1 list-disc pl-5 text-possessed-text">
                {errors.map((e) => (
                  <li key={e.code}>{tErrors(e.code)}</li>
                ))}
              </ul>
            </>
          )}

          {failure && failureKey && (
            <div className="text-possessed-text">
              <p className="font-semibold text-possessed-alert">{tErrors(failureKey)}</p>
              {failure.experimentCreated && <p className="mt-1">{tErrors('runStartFailed')}</p>}
              {failure.issues && failure.issues.length > 0 && (
                <ul className="mt-1 list-disc pl-5 font-mono text-xs text-possessed-muted">
                  {failure.issues.map((i) => (
                    <li key={`${i.path}:${i.message}`}>
                      {i.path}: {i.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {/* 이름 */}
      <div>
        <label htmlFor={`${ids}-name`} className="mb-1 block text-base font-semibold text-possessed-text">
          {t('nameLabel')}
        </label>
        <input
          id={`${ids}-name`}
          type="text"
          value={name}
          maxLength={MAX_NAME_LENGTH}
          placeholder={t('namePlaceholder')}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? `${ids}-name-error` : undefined}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
        {nameError && (
          <p id={`${ids}-name-error`} className="mt-1 text-sm text-possessed-alert">
            {tErrors(nameError.code)}
          </p>
        )}
      </div>

      {/* 시나리오 */}
      <fieldset>
        <legend className={legendClass}>{t('scenarioLabel')}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {scenarios.map((s) => {
            const selected = s.id === scenario.id;
            return (
              <label
                key={s.id}
                className={[
                  'cursor-pointer rounded-lg border p-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-possessed-alert',
                  selected ? 'border-possessed-crimson bg-possessed-surface' : 'border-possessed-border',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name={`${ids}-scenario`}
                  value={s.id}
                  checked={selected}
                  onChange={() => onScenarioChange(s.id)}
                  className="sr-only"
                />
                <span className="flex items-center gap-1.5 font-semibold text-possessed-text">
                  <span aria-hidden="true">{selected ? '◉' : '○'}</span>
                  {s.name[uiLocale]}
                </span>
                <span className="mt-1 block text-xs text-possessed-muted">{s.description[uiLocale]}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* 실행 유형 */}
      <fieldset>
        <legend className={legendClass}>{t('runModeLabel')}</legend>
        <div className="space-y-2">
          {RUN_MODES.map((mode) => {
            const unavailable = mode === 'LIVE_EXPERIMENT' && !liveAvailable;
            const selected = runMode === mode;
            return (
              <label
                key={mode}
                className={[
                  'flex items-start gap-3 rounded-lg border p-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-possessed-alert',
                  unavailable ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                  selected ? 'border-possessed-crimson bg-possessed-surface' : 'border-possessed-border',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name={`${ids}-runmode`}
                  value={mode}
                  checked={selected}
                  disabled={unavailable}
                  aria-describedby={`${ids}-${mode}-help`}
                  onChange={() => {
                    setRunMode(mode);
                    setPolicyReviewConfirmed(false);
                  }}
                  className="mt-1 size-4 accent-possessed-crimson"
                />
                <span>
                  <span className="block font-semibold text-possessed-text">
                    {tRun(`${mode}.label`)} <span className="font-mono text-xs text-possessed-muted">{mode}</span>
                  </span>
                  <span id={`${ids}-${mode}-help`} className="mt-1 block text-xs text-possessed-muted">
                    {mode === 'LIVE_EXPERIMENT' ? t('runModeLiveHelp') : t('runModeDeterministicHelp')}
                    {unavailable && <span className="mt-1 block text-possessed-alert">{t('liveUnavailable')}</span>}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* 요청 문구 — 라이브 실행에서만 의미가 있다 */}
      {isLive && (
        <fieldset className="space-y-3 rounded-lg border border-possessed-border p-4">
          <legend className={`${legendClass} px-1`}>{t('variantLabel')}</legend>

          <div>
            <p className="mb-1 text-sm font-medium text-possessed-text">{t('languageLabel')}</p>
            <div className="flex gap-4">
              {RUN_LOCALES.map((l) => (
                <label key={l} className="flex cursor-pointer items-center gap-2 text-sm text-possessed-text">
                  <input
                    type="radio"
                    name={`${ids}-runlocale`}
                    value={l}
                    checked={runLocale === l}
                    onChange={() => setRunLocale(l)}
                    className="size-4 accent-possessed-crimson"
                  />
                  <span lang={l}>{tLocale(l)}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor={`${ids}-variant`} className="mb-1 block text-sm font-medium text-possessed-text">
              {t('variantLabel')}
            </label>
            <select
              id={`${ids}-variant`}
              value={variantId}
              onChange={(e) => onVariantChange(e.target.value)}
              className={inputClass}
            >
              <option value="">{t('baseRequest')}</option>
              {scenario.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.request[runLocale]}
                </option>
              ))}
            </select>
            {variant && <p className="mt-1 text-xs text-possessed-muted">{variant.note[uiLocale]}</p>}
          </div>

          <div>
            <p className="mb-1 text-sm font-medium text-possessed-text">{t('requestPreview')}</p>
            <blockquote lang={runLocale} className="rounded-md border-l-4 border-possessed-border bg-possessed-surface p-3 text-sm text-possessed-text">
              {requestText}
            </blockquote>
          </div>

          {needsReview && (
            <div role="note" className="rounded-md border border-amber-700/50 bg-amber-900/20 p-3 text-sm">
              <p className="flex items-start gap-2 text-amber-300">
                <span aria-hidden="true">⚠</span>
                <span>{t('policyReviewRequired')}</span>
              </p>
              <label className="mt-2 flex items-center gap-2 text-possessed-text">
                <input
                  type="checkbox"
                  checked={policyReviewConfirmed}
                  aria-invalid={reviewError ? true : undefined}
                  aria-describedby={reviewError ? `${ids}-review-error` : undefined}
                  onChange={(e) => setPolicyReviewConfirmed(e.target.checked)}
                  className="size-4 accent-possessed-crimson"
                />
                {t('policyReviewConfirm')}
              </label>
              {reviewError && (
                <p id={`${ids}-review-error`} className="mt-1 text-possessed-alert">
                  {tErrors(reviewError.code)}
                </p>
              )}
            </div>
          )}
        </fieldset>
      )}

      {/* 정책 */}
      <PolicyEditor
        rules={rules}
        defaultRules={scenario.defaultRules}
        disabled={submitting}
        onChange={(next) => setRulesByScenario((prev) => ({ ...prev, [scenario.id]: next }))}
      />

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center rounded-md bg-possessed-crimson px-5 py-2.5 text-sm font-medium text-possessed-text hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-possessed-alert disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? t('starting') : t('start')}
        </button>
      </div>
    </form>
  );
}
