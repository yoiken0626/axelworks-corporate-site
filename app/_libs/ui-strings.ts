import { resolveLang, type Lang } from './lang';

// UI 文言の多言語辞書。ja / en / ko を用意する。
// ある言語のキーが無い場合はすべて ja にフォールバックする。
// ニュース記事のタイトル・本文は microCMS の title_en/ko・content_en/ko 側で翻訳するため、ここには含めない。
// メール本文・件名・payload のキーは担当者向けなので日本語のまま（辞書対象外）。
type Localized = {
  ja: string;
  en?: string;
  ko?: string;
};

const UI_STRINGS = {
  // ヒーローの吹き出し
  heroSpeech: {
    ja: '世界を手玉にとるわよ！',
    en: "I'll take the whole world in my hands!",
    ko: '온 세상을 손안에 넣을 거예요!',
  },

  // ヘッダー / フッター共通のナビゲーション
  navNews: { ja: 'ニュース', en: 'News', ko: '뉴스' },
  navBusiness: { ja: '事業内容', en: 'Business', ko: '사업 내용' },
  navMembers: { ja: 'メンバー', en: 'Members', ko: '멤버' },
  navCareers: { ja: '採用情報', en: 'Careers', ko: '채용 정보' },
  navContact: { ja: 'お問い合わせ', en: 'Contact', ko: '문의하기' },

  // フッター
  footerCopyright: {
    ja: '© AXelWorks. All Rights Reserved 2026',
    en: '© AXelWorks. All Rights Reserved 2026',
    ko: '© AXelWorks. All Rights Reserved 2026',
  },

  // News セクション
  newsHeading: { ja: 'News' },
  seeMore: { ja: 'もっとみる', en: 'See more', ko: '더 보기' },
  newsListLink: { ja: 'ニュース一覧へ', en: 'View all news', ko: '뉴스 목록 보기' },

  // 下層ページのヒーローバナー小見出し（news はバナー廃止済み）
  businessPageHeading: { ja: '事業内容', en: 'Business', ko: '사업 내용' },
  membersPageHeading: { ja: 'メンバー', en: 'Members', ko: '멤버' },

  // ページ読み上げコントロール
  readAloudPlay: {
    ja: 'このページを読み上げる',
    en: 'Read this page aloud',
    ko: '이 페이지 읽어주기',
  },
  readAloudPause: { ja: '読み上げを一時停止', en: 'Pause reading', ko: '읽기 일시정지' },
  readAloudStop: { ja: '読み上げを停止', en: 'Stop reading', ko: '읽기 정지' },
  readAloudSpeed: { ja: '速度', en: 'Speed', ko: '속도' },

  // Business セクション
  businessHeading: { ja: 'Business' },
  businessSubtitle: { ja: '事業内容', en: 'Our business', ko: '사업 소개' },
  businessBody1: {
    ja: '当社は、次世代テクノロジーの研究開発・製造・販売を行う革新的な企業です。',
    en: 'We are an innovative company engaged in the research, development, manufacturing, and sales of next-generation technology.',
    ko: '당사는 차세대 기술의 연구개발·제조·판매를 하는 혁신적인 기업입니다.',
  },
  businessBody2: {
    ja: 'AI、ロボット工学、自律システムなど、幅広い分野でのソリューション提供を通じて、社会の進化と未来の創造に貢献します。',
    en: 'Through solutions across a wide range of fields — AI, robotics, autonomous systems and more — we contribute to the advancement of society and the creation of the future.',
    ko: 'AI, 로보틱스, 자율 시스템 등 폭넓은 분야에서 솔루션을 제공하며, 사회의 발전과 미래 창조에 기여합니다.',
  },

  // About Us セクション
  aboutHeading: { ja: 'About Us' },
  aboutSubtitle: { ja: '私たちについて', en: 'Who we are', ko: '회사 소개' },
  aboutMission: {
    ja: '「AIとともに、多言語で世界とつながる」をミッションに掲げ、日々活動をしています。',
    en: 'Our mission is to connect with the world in many languages, together with AI.',
    ko: '‘AI와 함께, 다국어로 세계와 연결된다’를 미션으로 삼아 매일 활동하고 있습니다.',
  },
  aboutService1: {
    ja: 'AIエージェント実装支援（法人向けコンサルティング）',
    en: 'AI agent implementation support (consulting for businesses)',
    ko: 'AI 에이전트 구축 지원(법인 대상 컨설팅)',
  },
  aboutService2: {
    ja: 'AI・IT研修事業「AX Academy」（個人向け）',
    en: 'AI & IT training — "AX Academy" (for individuals)',
    ko: 'AI·IT 교육 사업 ‘AX Academy’(개인 대상)',
  },
  aboutService3: {
    ja: '受託開発・SaaS開発',
    en: 'Contract development & SaaS development',
    ko: '수탁 개발·SaaS 개발',
  },
  // About Us の会社情報
  aboutInfoCompany: { ja: '社名', en: 'Company', ko: '회사명' },
  aboutInfoFounded: { ja: '設立', en: 'Founded', ko: '설립' },
  aboutInfoLocation: { ja: '所在地', en: 'Location', ko: '소재지' },
  aboutInfoRepresentative: { ja: '代表者', en: 'Representative', ko: '대표자' },
  aboutInfoCapital: { ja: '資本金', en: 'Capital', ko: '자본금' },
  aboutInfoTBD: { ja: '準備中', en: 'Coming soon', ko: '준비 중' },
  aboutRepName: { ja: '吉田 健一', en: 'Kenichi Yoshida', ko: '요시다 겐이치' },

  // We are hiring セクション
  hiringHeading: { ja: 'We are hiring' },
  hiringSubtitle: { ja: '採用情報', en: 'Careers', ko: '채용 정보' },
  hiringBody1: {
    ja: '当社では、チャレンジ精神を持った人材を求めています。',
    en: 'We are looking for people with a spirit of challenge.',
    ko: '당사는 도전 정신을 가진 인재를 찾고 있습니다.',
  },
  hiringBody2: {
    ja: '新しいアイデアを出し合い、成長する環境で活躍したい方は、ぜひご応募ください。当社でのキャリアを築きながら、技術の最前線で力を発揮しましょう。',
    en: 'If you want to share new ideas and thrive in an environment where you can grow, we encourage you to apply. Build your career with us and put your skills to work at the forefront of technology.',
    ko: '새로운 아이디어를 함께 나누고 성장하는 환경에서 활약하고 싶은 분은 꼭 지원해 주세요. 당사에서 커리어를 쌓으며 기술의 최전선에서 역량을 발휘해 보세요.',
  },
  hiringLink: { ja: '採用情報へ', en: 'View careers', ko: '채용 정보 보기' },

  // ----- Contact セクション（左カラム） -----
  contactEyebrow: { ja: 'CONTACT' },
  contactHeadingLead: {
    ja: 'その「ちょっと困った」、',
    en: 'That "I\'m a little stuck" —',
    ko: '그 “조금 곤란한 일”,',
  },
  contactHeadingAccent: {
    ja: '聞かせてください。',
    en: "let's talk it through.",
    ko: '들려주세요.',
  },
  contactLead1: {
    ja: 'まだアイデアが固まっていなくても大丈夫です。',
    en: "It's fine if your idea isn't fully formed yet.",
    ko: '아직 아이디어가 명확하지 않아도 괜찮습니다.',
  },
  contactLead2: {
    ja: 'できることから、一緒に考えます。',
    en: "We'll figure out the next step together.",
    ko: '할 수 있는 것부터 함께 고민하겠습니다.',
  },
  contactService1: {
    ja: 'AIエージェント実装支援（法人向けコンサルティング）',
    en: 'AI agent implementation support (consulting for businesses)',
    ko: 'AI 에이전트 구축 지원(법인 대상 컨설팅)',
  },
  contactService2: {
    ja: '受託開発・SaaS開発',
    en: 'Contract development & SaaS development',
    ko: '수탁 개발·SaaS 개발',
  },
  contactService3: {
    ja: 'AI・IT研修事業「AX Academy」',
    en: 'AI & IT training — "AX Academy"',
    ko: 'AI·IT 교육 사업 ‘AX Academy’',
  },

  // ----- Contact フォーム -----
  formName: { ja: 'お名前', en: 'Name', ko: '이름' },
  formNamePlaceholder: { ja: '山田 太郎', en: 'Jane Doe', ko: '홍길동' },
  formEmail: { ja: 'メールアドレス', en: 'Email', ko: '이메일 주소' },
  formConsultation: {
    ja: 'ご相談内容',
    en: 'What would you like to discuss?',
    ko: '문의 내용',
  },
  formConsultationPlaceholder: { ja: '選択してください', en: 'Please select', ko: '선택해 주세요' },
  formMessage: { ja: 'メッセージ', en: 'Message', ko: '메시지' },
  formMessagePlaceholder: {
    ja: 'まだぼんやりした内容でも、お気軽にどうぞ。',
    en: 'Even a rough idea is fine — feel free to write.',
    ko: '아직 막연한 내용이라도 편하게 남겨 주세요.',
  },
  formRequired: { ja: '必須', en: 'Required', ko: '필수' },
  formOptional: { ja: '任意', en: 'Optional', ko: '선택' },
  formCalendarLegend: {
    ja: 'Google Meet相談（顔出し不要）の候補日時を選択してください（最大{max}件）',
    en: 'Choose up to {max} preferred times for a Google Meet call (camera optional)',
    ko: 'Google Meet 상담(얼굴 공개 불필요) 희망 일시를 선택해 주세요(최대 {max}건)',
  },
  formCalendarNote: {
    ja: '直近の営業日から自動で3日分表示しています',
    en: 'Showing the next 3 business days automatically',
    ko: '가장 가까운 영업일부터 자동으로 3일치를 표시합니다',
  },
  formTimeColumn: { ja: '時間帯', en: 'Time', ko: '시간대' },
  formSlotClosed: { ja: '（受付終了）', en: '(closed)', ko: '(마감)' },
  formSlotsCounter: {
    ja: '{n} / {max}件選択中',
    en: '{n} of {max} selected',
    ko: '{n} / {max}건 선택 중',
  },
  formSubmit: { ja: '相談内容を送る', en: 'Send message', ko: '상담 내용 보내기' },
  formSubmitting: { ja: '送信中…', en: 'Sending…', ko: '전송 중…' },
  formSubmitNote: {
    ja: '入力内容と選択した候補日時を、担当者へメールで送信します。',
    en: 'Your details and selected times will be emailed to our team.',
    ko: '입력하신 내용과 선택한 희망 일시를 담당자에게 이메일로 전송합니다.',
  },
  formSuccessTitle: {
    ja: '送信しました。ありがとうございます。',
    en: 'Sent — thank you!',
    ko: '전송되었습니다. 감사합니다.',
  },
  formSuccessBody: {
    ja: '担当者が内容を確認のうえ、いただいたメールアドレス宛に日程のご連絡をいたします。通常2〜3営業日以内にご返信します。',
    en: 'Our team will review your message and email you to arrange a time, usually within 2–3 business days.',
    ko: '담당자가 내용을 확인한 후, 남겨 주신 이메일 주소로 일정을 안내해 드립니다. 보통 2~3영업일 이내에 답변드립니다.',
  },

  // ご相談内容の選択肢
  consultAgent: {
    ja: 'AIエージェント実装相談',
    en: 'AI agent implementation',
    ko: 'AI 에이전트 구축 상담',
  },
  consultDev: {
    ja: '受託開発・SaaS開発相談',
    en: 'Contract / SaaS development',
    ko: '수탁 개발·SaaS 개발 상담',
  },
  consultTraining: {
    ja: 'AI・IT研修相談（AX Academy）',
    en: 'AI & IT training (AX Academy)',
    ko: 'AI·IT 교육 상담(AX Academy)',
  },
  consultOther: { ja: 'その他', en: 'Other', ko: '기타' },

  // バリデーションエラー
  errNameRequired: {
    ja: 'お名前を入力してください',
    en: 'Please enter your name.',
    ko: '이름을 입력해 주세요',
  },
  errEmailRequired: {
    ja: 'メールアドレスを入力してください',
    en: 'Please enter your email address.',
    ko: '이메일 주소를 입력해 주세요',
  },
  errEmailInvalid: {
    ja: 'メールアドレスの形式が正しくありません',
    en: 'Please enter a valid email address.',
    ko: '이메일 주소 형식이 올바르지 않습니다',
  },
  errConsultationRequired: {
    ja: 'ご相談内容を選択してください',
    en: 'Please select a topic.',
    ko: '문의 내용을 선택해 주세요',
  },
  errSlotsRequired: {
    ja: '候補日時を1件以上選択してください',
    en: 'Please select at least one time slot.',
    ko: '희망 일시를 1건 이상 선택해 주세요',
  },
  errSubmitFailed: {
    ja: '送信に失敗しました。お手数ですが時間をおいて再度お試しいただくか、直接メールにてご連絡ください。',
    en: 'Something went wrong. Please try again later, or contact us directly by email.',
    ko: '전송에 실패했습니다. 번거로우시겠지만 잠시 후 다시 시도하시거나, 이메일로 직접 연락해 주세요.',
  },
  errNetwork: {
    ja: 'ネットワークエラーにより送信できませんでした。通信環境をご確認のうえ再度お試しください。',
    en: "Couldn't send due to a network error. Please check your connection and try again.",
    ko: '네트워크 오류로 전송하지 못했습니다. 통신 환경을 확인하신 후 다시 시도해 주세요.',
  },
  errNotConfigured: {
    ja: '送信設定が未完了のため送信できませんでした。お手数ですが時間をおいて再度お試しください。',
    en: "The form isn't fully configured yet. Please try again later.",
    ko: '전송 설정이 완료되지 않아 전송하지 못했습니다. 번거로우시겠지만 잠시 후 다시 시도해 주세요.',
  },
} satisfies Record<string, Localized>;

export type UiStringKey = keyof typeof UI_STRINGS;

// 指定キーの文言を lang に応じて返す。lang は Cookie / searchParams で解決済みの値を渡す。
// 対象言語のキーが無ければ日本語にフォールバックする。
// {n} / {max} などのプレースホルダを含むキーは呼び出し側で置換する。
export const ui = (key: UiStringKey, lang: Lang | string | undefined): string => {
  const entry: Localized = UI_STRINGS[key];
  const resolved = resolveLang(lang);
  return (resolved === 'en' && entry.en) || (resolved === 'ko' && entry.ko) || entry.ja;
};
