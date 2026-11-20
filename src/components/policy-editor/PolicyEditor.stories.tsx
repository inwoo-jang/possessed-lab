import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { PolicyEditor } from './PolicyEditor';
import type { PolicyEditorRule } from '@/lib/experiment-form';

/** 시나리오 기본 정책과 같은 구성 (서버 모듈을 Storybook에 끌어오지 않도록 직접 정의) */
const defaults: PolicyEditorRule[] = [
  { toolName: 'search_rule', permission: 'ALLOWED', approvalGranted: false },
  { toolName: 'read_terms', permission: 'ALLOWED', approvalGranted: false },
  { toolName: 'draft_report', permission: 'ALLOWED', approvalGranted: false },
  { toolName: 'update_ad', permission: 'DENIED', approvalGranted: false },
  {
    toolName: 'approve_ad',
    permission: 'REQUIRES_APPROVAL',
    approvalGranted: false,
    approvalMeta: { grantedBy: 'mock-approver', scope: 'none (mock)' },
  },
  { toolName: 'send_external_message', permission: 'DENIED', approvalGranted: false },
];

const meta = {
  title: 'POSSESSED/PolicyEditor/PolicyEditor',
  component: PolicyEditor,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
이 요청에서 각 도구가 허용되는지 편집하는 컨트롤드 컴포넌트. 툴바의 Locale로 한/영을 전환해 확인한다.

- 도구 이름과 권한 코드(\`ALLOWED\`, \`DENIED\`, \`REQUIRES_APPROVAL\`)는 번역하지 않는다. 설명 문구만 번역한다.
- 기본값에서 바뀐 규칙은 **색이 아니라 "수정됨" 텍스트(+ 아이콘)** 로 표시한다.
- \`REQUIRES_APPROVAL\`의 승인은 **테스트용 Mock**이다. 실제 승인 시스템이 아니라는 안내를 항상 함께 보인다.
- 스토리의 컨트롤은 실제로 조작할 수 있다 (상태를 가진 래퍼로 감싸 두었다).
        `,
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="w-[640px]">
        <Story />
      </div>
    ),
  ],
  args: {
    rules: defaults,
    defaultRules: defaults,
    onChange: () => {},
  },
} satisfies Meta<typeof PolicyEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 상태를 가진 래퍼: 스토리에서 실제로 조작해 볼 수 있다 */
function Stateful({ initial, disabled }: { initial: PolicyEditorRule[]; disabled?: boolean }) {
  const [rules, setRules] = useState(initial);
  return <PolicyEditor rules={rules} defaultRules={defaults} onChange={setRules} disabled={disabled} />;
}

/** 시나리오 기본 정책 그대로 — "수정됨" 표시도 되돌리기 버튼도 없다 */
export const Default: Story = {
  render: () => <Stateful initial={defaults} />,
};

/** update_ad를 허용으로 바꾸고 Mock 승인을 켠 상태 */
export const Modified: Story = {
  render: () => (
    <Stateful
      initial={defaults.map((r) =>
        r.toolName === 'update_ad'
          ? { ...r, permission: 'ALLOWED' as const }
          : r.toolName === 'approve_ad'
            ? { ...r, approvalGranted: true }
            : r
      )}
    />
  ),
};

/** 승인이 필요한 규칙이 없으면 Mock 승인 체크박스도 안내도 나오지 않는다 */
export const NoApprovalRule: Story = {
  render: () => (
    <Stateful initial={defaults.map((r) => (r.toolName === 'approve_ad' ? { ...r, permission: 'DENIED' as const } : r))} />
  ),
};

/** 제출 중에는 편집할 수 없다 */
export const Disabled: Story = {
  render: () => <Stateful initial={defaults} disabled />,
};
