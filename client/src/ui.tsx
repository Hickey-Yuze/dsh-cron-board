/**
 * 基础控件：按钮/徽章/字段/输入。全部走 --dsh-cb-* 令牌，不引宿主原语
 * （保持 v1 零额外依赖；后续如需对齐原生控件可切 dsh-client-ui-primitives guarded require）。
 */
import type { ReactElement, ReactNode } from 'react';
import { createElement } from 'react';

export function Btn(props: {
  children?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  kind?: 'default' | 'primary' | 'danger' | 'ghost';
  title?: string;
}): ReactElement {
  const cls = ['dsh-cb-btn'];
  if (props.kind === 'primary') cls.push('dsh-cb-primary');
  else if (props.kind === 'danger') cls.push('dsh-cb-danger');
  else if (props.kind === 'ghost') cls.push('dsh-cb-ghost');
  return createElement(
    'button',
    { className: cls.join(' '), onClick: props.onClick, disabled: props.disabled === true, title: props.title, type: 'button' },
    props.children,
  );
}

export function Badge(props: {
  children?: ReactNode;
  tone?: 'default' | 'ok' | 'warn' | 'err' | 'accent';
  title?: string;
}): ReactElement {
  const cls = ['dsh-cb-badge'];
  if (props.tone && props.tone !== 'default') cls.push(`dsh-cb-${props.tone}`);
  return createElement('span', { className: cls.join(' '), title: props.title }, props.children);
}

export function Dot(props: { tone: 'run' | 'ok' | 'err' | 'warn' | 'idle' }): ReactElement {
  return createElement('span', { className: `dot dsh-cb-${props.tone}` });
}

export function Field(props: { label: string; children?: ReactNode; hint?: string }): ReactElement {
  return createElement(
    'div',
    { className: 'dsh-cb-field' },
    createElement('span', { className: 'dsh-cb-label' }, props.label),
    props.children,
    props.hint !== undefined ? createElement('span', { className: 'dsh-cb-hint' }, props.hint) : null,
  );
}

export function TextInput(props: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }): ReactElement {
  return createElement('input', {
    className: 'dsh-cb-input',
    value: props.value,
    placeholder: props.placeholder,
    disabled: props.disabled === true,
    onChange: (e: { target: { value: string } }) => props.onChange(e.target.value),
  });
}

export function TextArea(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}): ReactElement {
  return createElement('textarea', {
    className: 'dsh-cb-textarea',
    value: props.value,
    placeholder: props.placeholder,
    rows: props.rows ?? 6,
    disabled: props.disabled === true,
    onChange: (e: { target: { value: string } }) => props.onChange(e.target.value),
  });
}

export function Select(props: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}): ReactElement {
  return createElement(
    'select',
    {
      className: 'dsh-cb-select',
      value: props.value,
      onChange: (e: { target: { value: string } }) => props.onChange(e.target.value),
    },
    props.options.map((o, i) => createElement('option', { key: `${o.value}-${i}`, value: o.value }, o.label)),
  );
}

export function ErrorBox(props: { children?: ReactNode }): ReactElement {
  return createElement('div', { className: 'dsh-cb-errbox' }, props.children);
}

/** 标签名 → 稳定色相（原版 issue #1521 语义：哈希取色，不存储颜色）。 */
export function tagHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

/** 标签徽章（哈希色调，board/detail 共用；放 ui 层避免 board↔detail 循环导入）。 */
export function TagBadge(props: { tag: { name: string } }): ReactElement {
  const hue = tagHue(props.tag.name);
  return createElement(
    'span',
    {
      className: 'dsh-cb-tagbadge',
      style: {
        color: `hsl(${hue} 65% 62%)`,
        background: `hsl(${hue} 45% 30% / 0.35)`,
        border: `1px solid hsl(${hue} 50% 50% / 0.45)`,
      },
    },
    props.tag.name,
  );
}
