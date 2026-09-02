import { ui } from '@/app/_libs/ui-strings';
import { type Lang } from '@/app/_libs/lang';
import styles from './index.module.css';
import AppointmentForm from './AppointmentForm';

const iconProps = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  'aria-hidden': true,
} as const;
const pathProps = {
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const SERVICES = [
  {
    key: 'contactService1',
    icon: (
      <svg {...iconProps}>
        <path d="M8 6 3 12l5 6M16 6l5 6-5 6" {...pathProps} strokeWidth={2} />
      </svg>
    ),
  },
  {
    key: 'contactService2',
    icon: (
      <svg {...iconProps}>
        <path
          d="m12 3 8.5 4.9v8.2L12 21l-8.5-4.9V7.9L12 3Zm0 0v9m0 0 8.5-4.9M12 12l-8.5-4.9"
          {...pathProps}
        />
      </svg>
    ),
  },
  {
    key: 'contactService3',
    icon: (
      <svg {...iconProps}>
        <path d="M12 4 2 9l10 5 10-5-10-5ZM6 11v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" {...pathProps} />
      </svg>
    ),
  },
] as const;

type Props = {
  lang: Lang;
};

export default function ContactSection({ lang }: Props) {
  return (
    <section id="contact-form" className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>{ui('contactEyebrow', lang)}</p>
          <h2 className={styles.heading}>
            {ui('contactHeadingLead', lang)}
            <br />
            <span className={styles.headingAccent}>{ui('contactHeadingAccent', lang)}</span>
          </h2>
          <p className={styles.lead}>
            {ui('contactLead1', lang)}
            <br />
            {ui('contactLead2', lang)}
          </p>
          <ul className={styles.services}>
            {SERVICES.map((s) => (
              <li key={s.key} className={styles.serviceItem}>
                <span className={styles.serviceIcon}>{s.icon}</span>
                {ui(s.key, lang)}
              </li>
            ))}
          </ul>
        </div>

        <AppointmentForm lang={lang} />
      </div>
    </section>
  );
}
