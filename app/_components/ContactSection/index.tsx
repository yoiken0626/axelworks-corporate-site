import styles from './index.module.css';
import AppointmentForm from './AppointmentForm';

const SERVICES = [
  {
    label: 'AIエージェント実装支援（法人向けコンサルティング）',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M8 6 3 12l5 6M16 6l5 6-5 6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: '受託開発・SaaS開発',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="m12 3 8.5 4.9v8.2L12 21l-8.5-4.9V7.9L12 3Zm0 0v9m0 0 8.5-4.9M12 12l-8.5-4.9"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    label: 'AI・IT研修事業「AX Academy」',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 4 2 9l10 5 10-5-10-5ZM6 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

export default function ContactSection() {
  return (
    <section id="contact-form" className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>CONTACT</p>
          <h2 className={styles.heading}>
            その「ちょっと困った」、
            <br />
            <span className={styles.headingAccent}>聞かせてください。</span>
          </h2>
          <p className={styles.lead}>
            まだアイデアが固まっていなくても大丈夫です。
            <br />
            できることから、一緒に考えます。
          </p>
          <ul className={styles.services}>
            {SERVICES.map((s) => (
              <li key={s.label} className={styles.serviceItem}>
                <span className={styles.serviceIcon}>{s.icon}</span>
                {s.label}
              </li>
            ))}
          </ul>
        </div>

        <AppointmentForm />
      </div>
    </section>
  );
}
