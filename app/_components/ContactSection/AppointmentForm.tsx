'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import { ui } from '@/app/_libs/ui-strings';
import { type Lang } from '@/app/_libs/lang';
import styles from './index.module.css';
import {
  APPOINTMENT_TIMES,
  MAX_SELECTIONS,
  getAppointmentDays,
  isSlotTooSoon,
  slotId,
  type AppointmentDay,
} from './slots';

// value はメール本文に載る正規表記（担当者向けに日本語で固定）。表示ラベルは lang に応じて出し分ける。
const CONSULTATION_OPTIONS = [
  { key: 'consultAgent', value: 'AIエージェント実装相談' },
  { key: 'consultDev', value: '受託開発・SaaS開発相談' },
  { key: 'consultTraining', value: 'AI・IT研修相談（AX Academy）' },
  { key: 'consultOther', value: 'その他' },
] as const;

const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = {
  name?: string;
  email?: string;
  consultation?: string;
  slots?: string;
};

type Status = 'idle' | 'submitting' | 'success' | 'error';

type Props = {
  lang: Lang;
};

export default function AppointmentForm({ lang }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [consultation, setConsultation] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [botcheck, setBotcheck] = useState(false);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  // 候補日時はクライアントでのみ算出する（サーバー時刻とのズレによる hydration 不一致を避ける）。
  // now はページを開いた瞬間の時刻。各候補日時まで2時間を切っているかの判定に使う。
  const [days, setDays] = useState<AppointmentDay[] | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    setDays(getAppointmentDays(MAX_SELECTIONS, lang));
  }, [lang]);

  const atLimit = selected.length >= MAX_SELECTIONS;

  const toggleSlot = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) {
        return prev.filter((s) => s !== id);
      }
      if (prev.length >= MAX_SELECTIONS) {
        return prev;
      }
      return [...prev, id];
    });
  };

  // メール本文に載せる候補日時（選択順ではなく日時順で整形）
  const selectedLabels = useMemo(() => {
    if (!days) {
      return [];
    }
    const labels: string[] = [];
    for (const day of days) {
      for (const time of APPOINTMENT_TIMES) {
        if (selected.includes(slotId(day.key, time))) {
          labels.push(`${day.full} ${time}`);
        }
      }
    }
    return labels;
  }, [days, selected]);

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!name.trim()) {
      next.name = ui('errNameRequired', lang);
    }
    if (!email.trim()) {
      next.email = ui('errEmailRequired', lang);
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      next.email = ui('errEmailInvalid', lang);
    }
    if (!consultation) {
      next.consultation = ui('errConsultationRequired', lang);
    }
    if (selected.length === 0) {
      next.slots = ui('errSlotsRequired', lang);
    }
    return next;
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (status === 'submitting') {
      return;
    }
    setStatus('idle');
    setStatusMessage('');

    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      const firstKey = Object.keys(nextErrors)[0];
      document.getElementById(`appt-${firstKey}`)?.focus();
      return;
    }

    const accessKey = process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY;
    if (!accessKey) {
      // eslint-disable-next-line no-console
      console.error('NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY is not set');
      setStatus('error');
      setStatusMessage(ui('errNotConfigured', lang));
      return;
    }

    const slotsText = selectedLabels.map((label, i) => `第${i + 1}希望: ${label}`).join('\n');

    setStatus('submitting');
    try {
      const res = await fetch(WEB3FORMS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: accessKey,
          subject: `【商談予約】${name.trim()} 様`,
          from_name: 'AXelWorks 商談予約フォーム',
          replyto: email.trim(),
          botcheck,
          お名前: name.trim(),
          メールアドレス: email.trim(),
          ご相談内容: consultation,
          メッセージ: message.trim() || '（記載なし）',
          候補日時: slotsText,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus('success');
      } else {
        setStatus('error');
        setStatusMessage(ui('errSubmitFailed', lang));
      }
    } catch {
      setStatus('error');
      setStatusMessage(ui('errNetwork', lang));
    }
  };

  if (status === 'success') {
    return (
      <div className={styles.card}>
        <div className={styles.successPanel} role="status">
          <p className={styles.successTitle}>{ui('formSuccessTitle', lang)}</p>
          <p className={styles.successBody}>{ui('formSuccessBody', lang)}</p>
        </div>
      </div>
    );
  }

  const requiredBadge = <span className={styles.req}>{ui('formRequired', lang)}</span>;

  return (
    <form className={styles.card} onSubmit={onSubmit} noValidate>
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="appt-name">
            {ui('formName', lang)}
            {requiredBadge}
          </label>
          <input
            id="appt-name"
            className={styles.input}
            type="text"
            placeholder={ui('formNamePlaceholder', lang)}
            value={name}
            autoComplete="name"
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'appt-name-error' : undefined}
            onChange={(e) => setName(e.target.value)}
          />
          {errors.name && (
            <p id="appt-name-error" className={styles.fieldError}>
              {errors.name}
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="appt-email">
            {ui('formEmail', lang)}
            {requiredBadge}
          </label>
          <input
            id="appt-email"
            className={styles.input}
            type="email"
            placeholder="you@example.com"
            value={email}
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'appt-email-error' : undefined}
            onChange={(e) => setEmail(e.target.value)}
          />
          {errors.email && (
            <p id="appt-email-error" className={styles.fieldError}>
              {errors.email}
            </p>
          )}
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="appt-consultation">
          {ui('formConsultation', lang)}
          {requiredBadge}
        </label>
        <select
          id="appt-consultation"
          className={styles.select}
          value={consultation}
          aria-invalid={Boolean(errors.consultation)}
          aria-describedby={errors.consultation ? 'appt-consultation-error' : undefined}
          onChange={(e) => setConsultation(e.target.value)}
        >
          <option value="">{ui('formConsultationPlaceholder', lang)}</option>
          {CONSULTATION_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.value}>
              {ui(opt.key, lang)}
            </option>
          ))}
        </select>
        {errors.consultation && (
          <p id="appt-consultation-error" className={styles.fieldError}>
            {errors.consultation}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="appt-message">
          {ui('formMessage', lang)}
          <span className={styles.optional}>{ui('formOptional', lang)}</span>
        </label>
        <textarea
          id="appt-message"
          className={styles.textarea}
          placeholder={ui('formMessagePlaceholder', lang)}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      <fieldset
        id="appt-slots"
        className={styles.calendar}
        tabIndex={-1}
        aria-invalid={Boolean(errors.slots)}
        aria-describedby={errors.slots ? 'appt-slots-error' : undefined}
      >
        <legend className={styles.calHeading}>
          {ui('formCalendarLegend', lang).replace('{max}', String(MAX_SELECTIONS))} {requiredBadge}
        </legend>
        <p className={styles.calNote}>{ui('formCalendarNote', lang)}</p>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col" className={styles.timeHead}>
                  <span className={styles.srOnly}>{ui('formTimeColumn', lang)}</span>
                </th>
                {(days ?? [null, null, null]).map((day, i) => (
                  <th key={day?.key ?? i} scope="col">
                    {day ? day.label : '—'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {APPOINTMENT_TIMES.map((time) => (
                <tr key={time}>
                  <th scope="row" className={styles.timeHead}>
                    {time}
                  </th>
                  {(days ?? [null, null, null]).map((day, i) => {
                    if (!day) {
                      return (
                        <td key={i} className={styles.slotCell}>
                          <input type="checkbox" className={styles.slotCheckbox} disabled />
                        </td>
                      );
                    }
                    const id = slotId(day.key, time);
                    const checked = selected.includes(id);
                    // その日時まで2時間を切っている、または選択上限に達している場合は選択不可
                    const tooSoon = isSlotTooSoon(day.key, time, now);
                    const disabled = tooSoon || (!checked && atLimit);
                    return (
                      <td
                        key={id}
                        className={styles.slotCell}
                        data-disabled={disabled || undefined}
                      >
                        <label className={styles.slotLabel}>
                          <input
                            type="checkbox"
                            className={styles.slotCheckbox}
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleSlot(id)}
                          />
                          <span className={styles.srOnly}>
                            {day.label} {time}
                            {tooSoon ? ui('formSlotClosed', lang) : ''}
                          </span>
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className={styles.counter} aria-live="polite">
          {ui('formSlotsCounter', lang)
            .replace('{n}', String(selected.length))
            .replace('{max}', String(MAX_SELECTIONS))}
        </p>
        {errors.slots && (
          <p id="appt-slots-error" className={styles.fieldError}>
            {errors.slots}
          </p>
        )}
      </fieldset>

      {/* スパム対策のハニーポット（人間には見えない） */}
      <label className={styles.honeypot} aria-hidden="true">
        <input
          type="checkbox"
          tabIndex={-1}
          autoComplete="off"
          checked={botcheck}
          onChange={(e) => setBotcheck(e.target.checked)}
        />
        Do not fill this field
      </label>

      <button type="submit" className={styles.submit} disabled={status === 'submitting'}>
        {status === 'submitting' ? ui('formSubmitting', lang) : ui('formSubmit', lang)}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <p className={styles.submitNote}>{ui('formSubmitNote', lang)}</p>

      <div aria-live="polite">
        {status === 'error' && (
          <p className={classNames(styles.status, styles.statusError)}>{statusMessage}</p>
        )}
      </div>
    </form>
  );
}
