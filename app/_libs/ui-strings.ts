import { resolveLang, type Lang } from './lang';

// UI 文言の多言語辞書。
// 記事翻訳と同様、まずは ja / en のみ用意する。
// en が無いキー・未対応言語（韓中独西仏露）はすべて ja にフォールバックする。
// ニュース記事のタイトル・本文は microCMS の title_en / content_en 側で翻訳するため、ここには含めない。
// メール本文・件名・payload のキーは担当者向けなので日本語のまま（辞書対象外）。
type Localized = {
  ja: string;
  en?: string;
};

const UI_STRINGS = {
  // ヒーローの吹き出し
  heroSpeech: {
    ja: '世界を手玉にとるわよ！',
    en: "I'll take the whole world in my hands!",
  },

  // ヘッダー / フッター共通のナビゲーション
  navNews: { ja: 'ニュース', en: 'News' },
  navBusiness: { ja: '事業内容', en: 'Business' },
  navMembers: { ja: 'メンバー', en: 'Members' },
  navCareers: { ja: '採用情報', en: 'Careers' },
  navContact: { ja: 'お問い合わせ', en: 'Contact' },

  // フッター
  footerCopyright: {
    ja: '© AXelWorks. All Rights Reserved 2026',
    en: '© AXelWorks. All Rights Reserved 2026',
  },

  // News セクション
  newsHeading: { ja: 'News' },
  seeMore: { ja: 'もっとみる', en: 'See more' },

  // Business セクション
  businessHeading: { ja: 'Business' },
  businessSubtitle: { ja: '事業内容', en: 'Our business' },
  businessBody1: {
    ja: '当社は、次世代テクノロジーの研究開発・製造・販売を行う革新的な企業です。',
    en: 'We are an innovative company engaged in the research, development, manufacturing, and sales of next-generation technology.',
  },
  businessBody2: {
    ja: 'AI、ロボット工学、自律システムなど、幅広い分野でのソリューション提供を通じて、社会の進化と未来の創造に貢献します。',
    en: 'Through solutions across a wide range of fields — AI, robotics, autonomous systems and more — we contribute to the advancement of society and the creation of the future.',
  },

  // About Us セクション
  aboutHeading: { ja: 'About Us' },
  aboutSubtitle: { ja: '私たちについて', en: 'Who we are' },
  aboutMission: {
    ja: '「AIとともに、多言語で世界とつながる」をミッションに掲げ、日々活動をしています。',
    en: 'Our mission is to connect with the world in many languages, together with AI.',
  },
  aboutService1: {
    ja: 'AIエージェント実装支援（法人向けコンサルティング）',
    en: 'AI agent implementation support (consulting for businesses)',
  },
  aboutService2: {
    ja: 'AI・IT研修事業「AX Academy」（個人向け）',
    en: 'AI & IT training — "AX Academy" (for individuals)',
  },
  aboutService3: {
    ja: '受託開発・SaaS開発',
    en: 'Contract development & SaaS development',
  },
  // About Us の会社情報
  aboutInfoCompany: { ja: '社名', en: 'Company' },
  aboutInfoFounded: { ja: '設立', en: 'Founded' },
  aboutInfoLocation: { ja: '所在地', en: 'Location' },
  aboutInfoRepresentative: { ja: '代表者', en: 'Representative' },
  aboutInfoCapital: { ja: '資本金', en: 'Capital' },
  aboutInfoTBD: { ja: '準備中', en: 'Coming soon' },
  aboutRepName: { ja: '吉田 健一', en: 'Kenichi Yoshida' },

  // We are hiring セクション
  hiringHeading: { ja: 'We are hiring' },
  hiringSubtitle: { ja: '採用情報', en: 'Careers' },
  hiringBody1: {
    ja: '当社では、チャレンジ精神を持った人材を求めています。',
    en: 'We are looking for people with a spirit of challenge.',
  },
  hiringBody2: {
    ja: '新しいアイデアを出し合い、成長する環境で活躍したい方は、ぜひご応募ください。当社でのキャリアを築きながら、技術の最前線で力を発揮しましょう。',
    en: 'If you want to share new ideas and thrive in an environment where you can grow, we encourage you to apply. Build your career with us and put your skills to work at the forefront of technology.',
  },
  hiringLink: { ja: '採用情報へ', en: 'View careers' },

  // ----- Contact セクション（左カラム） -----
  contactEyebrow: { ja: 'CONTACT' },
  contactHeadingLead: { ja: 'その「ちょっと困った」、', en: 'That "I\'m a little stuck" —' },
  contactHeadingAccent: { ja: '聞かせてください。', en: "let's talk it through." },
  contactLead1: {
    ja: 'まだアイデアが固まっていなくても大丈夫です。',
    en: "It's fine if your idea isn't fully formed yet.",
  },
  contactLead2: {
    ja: 'できることから、一緒に考えます。',
    en: "We'll figure out the next step together.",
  },
  contactService1: {
    ja: 'AIエージェント実装支援（法人向けコンサルティング）',
    en: 'AI agent implementation support (consulting for businesses)',
  },
  contactService2: {
    ja: '受託開発・SaaS開発',
    en: 'Contract development & SaaS development',
  },
  contactService3: {
    ja: 'AI・IT研修事業「AX Academy」',
    en: 'AI & IT training — "AX Academy"',
  },

  // ----- Contact フォーム -----
  formName: { ja: 'お名前', en: 'Name' },
  formNamePlaceholder: { ja: '山田 太郎', en: 'Jane Doe' },
  formEmail: { ja: 'メールアドレス', en: 'Email' },
  formConsultation: { ja: 'ご相談内容', en: 'What would you like to discuss?' },
  formConsultationPlaceholder: { ja: '選択してください', en: 'Please select' },
  formMessage: { ja: 'メッセージ', en: 'Message' },
  formMessagePlaceholder: {
    ja: 'まだぼんやりした内容でも、お気軽にどうぞ。',
    en: 'Even a rough idea is fine — feel free to write.',
  },
  formRequired: { ja: '必須', en: 'Required' },
  formOptional: { ja: '任意', en: 'Optional' },
  formCalendarLegend: {
    ja: 'Google Meet相談（顔出し不要）の候補日時を選択してください（最大{max}件）',
    en: 'Choose up to {max} preferred times for a Google Meet call (camera optional)',
  },
  formCalendarNote: {
    ja: '直近の営業日から自動で3日分表示しています',
    en: 'Showing the next 3 business days automatically',
  },
  formTimeColumn: { ja: '時間帯', en: 'Time' },
  formSlotClosed: { ja: '（受付終了）', en: '(closed)' },
  formSlotsCounter: { ja: '{n} / {max}件選択中', en: '{n} of {max} selected' },
  formSubmit: { ja: '相談内容を送る', en: 'Send message' },
  formSubmitting: { ja: '送信中…', en: 'Sending…' },
  formSubmitNote: {
    ja: '入力内容と選択した候補日時を、担当者へメールで送信します。',
    en: 'Your details and selected times will be emailed to our team.',
  },
  formSuccessTitle: { ja: '送信しました。ありがとうございます。', en: 'Sent — thank you!' },
  formSuccessBody: {
    ja: '担当者が内容を確認のうえ、いただいたメールアドレス宛に日程のご連絡をいたします。通常2〜3営業日以内にご返信します。',
    en: 'Our team will review your message and email you to arrange a time, usually within 2–3 business days.',
  },

  // ご相談内容の選択肢
  consultAgent: { ja: 'AIエージェント実装相談', en: 'AI agent implementation' },
  consultDev: { ja: '受託開発・SaaS開発相談', en: 'Contract / SaaS development' },
  consultTraining: { ja: 'AI・IT研修相談（AX Academy）', en: 'AI & IT training (AX Academy)' },
  consultOther: { ja: 'その他', en: 'Other' },

  // バリデーションエラー
  errNameRequired: { ja: 'お名前を入力してください', en: 'Please enter your name.' },
  errEmailRequired: {
    ja: 'メールアドレスを入力してください',
    en: 'Please enter your email address.',
  },
  errEmailInvalid: {
    ja: 'メールアドレスの形式が正しくありません',
    en: 'Please enter a valid email address.',
  },
  errConsultationRequired: { ja: 'ご相談内容を選択してください', en: 'Please select a topic.' },
  errSlotsRequired: {
    ja: '候補日時を1件以上選択してください',
    en: 'Please select at least one time slot.',
  },
  errSubmitFailed: {
    ja: '送信に失敗しました。お手数ですが時間をおいて再度お試しいただくか、直接メールにてご連絡ください。',
    en: 'Something went wrong. Please try again later, or contact us directly by email.',
  },
  errNetwork: {
    ja: 'ネットワークエラーにより送信できませんでした。通信環境をご確認のうえ再度お試しください。',
    en: "Couldn't send due to a network error. Please check your connection and try again.",
  },
  errNotConfigured: {
    ja: '送信設定が未完了のため送信できませんでした。お手数ですが時間をおいて再度お試しください。',
    en: "The form isn't fully configured yet. Please try again later.",
  },
} satisfies Record<string, Localized>;

export type UiStringKey = keyof typeof UI_STRINGS;

// 指定キーの文言を lang に応じて返す。lang は Cookie / searchParams で解決済みの値を渡す。
// {n} / {max} などのプレースホルダを含むキーは呼び出し側で置換する。
export const ui = (key: UiStringKey, lang: Lang | string | undefined): string => {
  const entry: Localized = UI_STRINGS[key];
  return (resolveLang(lang) === 'en' && entry.en) || entry.ja;
};
