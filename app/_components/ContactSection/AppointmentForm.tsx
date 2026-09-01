'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';
import styles from './index.module.css';
import {
  APPOINTMENT_TIMES,
  MAX_SELECTIONS,
  getAppointmentDays,
  isSlotTooSoon,
  slotId,
  type AppointmentDay,
} from './slots';

const CONSULTATION_OPTIONS = [
  'AIエージェント実装相談',
  '受託開発・SaaS開発相談',
  'AI・IT研修相談（AX Academy）',
  'その他',
];

const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldErrors = {
  name?: string;
  email?: string;
  consultation?: string;
  slots?: string;
};

type Status = 'idle' | 'submitting' | 'success' | 'error';

export default function AppointmentForm() {
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
    setDays(getAppointmentDays());
  }, []);

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
      next.name = 'お名前を入力してください';
    }
    if (!email.trim()) {
      next.email = 'メールアドレスを入力してください';
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      next.email = 'メールアドレスの形式が正しくありません';
    }
    if (!consultation) {
      next.consultation = 'ご相談内容を選択してください';
    }
    if (selected.length === 0) {
      next.slots = '候補日時を1件以上選択してください';
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
      setStatusMessage(
        '送信設定が未完了のため送信できませんでした。お手数ですが時間をおいて再度お試しください。',
      );
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
        setStatusMessage(
          '送信に失敗しました。お手数ですが時間をおいて再度お試しいただくか、直接メールにてご連絡ください。',
        );
      }
    } catch {
      setStatus('error');
      setStatusMessage(
        'ネットワークエラーにより送信できませんでした。通信環境をご確認のうえ再度お試しください。',
      );
    }
  };

  if (status === 'success') {
    return (
      <div className={styles.card}>
        <div className={styles.successPanel} role="status">
          <p className={styles.successTitle}>送信しました。ありがとうございます。</p>
          <p className={styles.successBody}>
            担当者が内容を確認のうえ、いただいたメールアドレス宛に日程のご連絡をいたします。
            通常2〜3営業日以内にご返信します。
          </p>
        </div>
      </div>
    );
  }

  return (
    <form className={styles.card} onSubmit={onSubmit} noValidate>
      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="appt-name">
            お名前<span className={styles.req}>必須</span>
          </label>
          <input
            id="appt-name"
            className={styles.input}
            type="text"
            placeholder="山田 太郎"
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
            メールアドレス<span className={styles.req}>必須</span>
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
          ご相談内容<span className={styles.req}>必須</span>
        </label>
        <select
          id="appt-consultation"
          className={styles.select}
          value={consultation}
          aria-invalid={Boolean(errors.consultation)}
          aria-describedby={errors.consultation ? 'appt-consultation-error' : undefined}
          onChange={(e) => setConsultation(e.target.value)}
        >
          <option value="">選択してください</option>
          {CONSULTATION_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
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
          メッセージ<span className={styles.optional}>任意</span>
        </label>
        <textarea
          id="appt-message"
          className={styles.textarea}
          placeholder="まだぼんやりした内容でも、お気軽にどうぞ。"
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
          Google Meet相談（顔出し不要）の候補日時を選択してください（最大{MAX_SELECTIONS}件）{' '}
          <span className={styles.req}>必須</span>
        </legend>
        <p className={styles.calNote}>直近の営業日から自動で3日分表示しています</p>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col" className={styles.timeHead}>
                  <span className={styles.srOnly}>時間帯</span>
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
                            {tooSoon ? '（受付終了）' : ''}
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
          {selected.length} / {MAX_SELECTIONS}件選択中
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
        この項目は入力しないでください
      </label>

      <button type="submit" className={styles.submit} disabled={status === 'submitting'}>
        {status === 'submitting' ? '送信中…' : '相談内容を送る'}
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
      <p className={styles.submitNote}>
        入力内容と選択した候補日時を、担当者へメールで送信します。
      </p>

      <div aria-live="polite">
        {status === 'error' && (
          <p className={classNames(styles.status, styles.statusError)}>{statusMessage}</p>
        )}
      </div>
    </form>
  );
}
