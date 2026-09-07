import { resolveLang, type Lang } from './lang';

// UI 文言の多言語辞書。ja / en / ko / zh / de を用意する。
// ある言語のキーが無い場合はすべて ja にフォールバックする。
// ニュース記事のタイトル・本文は microCMS の title_*/content_* 側で翻訳するため、ここには含めない。
// メール本文・件名・payload のキーは担当者向けなので日本語のまま（辞書対象外）。
type Localized = {
  ja: string;
  en?: string;
  ko?: string;
  zh?: string;
  de?: string;
};

const UI_STRINGS = {
  // ヒーローの吹き出し
  heroSpeech: {
    ja: '世界を手玉にとるわよ！',
    en: "I'll take the whole world in my hands!",
    ko: '온 세상을 손안에 넣을 거예요!',
    zh: '要把整个世界都掌握在手中！',
    de: 'Ich nehme die ganze Welt in meine Hände!',
  },

  // ヘッダー / フッター共通のナビゲーション
  navNews: { ja: 'ニュース', en: 'News', ko: '뉴스', zh: '新闻', de: 'Aktuelles' },
  navBusiness: {
    ja: '事業内容',
    en: 'Business',
    ko: '사업 내용',
    zh: '业务内容',
    de: 'Geschäftsfelder',
  },
  navMembers: { ja: 'メンバー', en: 'Members', ko: '멤버', zh: '成员', de: 'Team' },
  navCareers: { ja: '採用情報', en: 'Careers', ko: '채용 정보', zh: '招聘信息', de: 'Karriere' },
  navContact: {
    ja: 'お問い合わせ',
    en: 'Contact',
    ko: '문의하기',
    zh: '联系我们',
    de: 'Kontakt',
  },

  // フッター
  footerCopyright: {
    ja: '© AXelWorks. All Rights Reserved 2026',
    en: '© AXelWorks. All Rights Reserved 2026',
    ko: '© AXelWorks. All Rights Reserved 2026',
    zh: '© AXelWorks. All Rights Reserved 2026',
    de: '© AXelWorks. All Rights Reserved 2026',
  },

  // News セクション
  newsHeading: { ja: 'News' },
  seeMore: { ja: 'もっとみる', en: 'See more', ko: '더 보기', zh: '查看更多', de: 'Mehr erfahren' },
  newsListLink: {
    ja: 'ニュース一覧へ',
    en: 'View all news',
    ko: '뉴스 목록 보기',
    zh: '查看全部新闻',
    de: 'Alle News ansehen',
  },

  // 下層ページのヒーローバナー小見出し（news はバナー廃止済み）
  businessPageHeading: {
    ja: '事業内容',
    en: 'Business',
    ko: '사업 내용',
    zh: '业务内容',
    de: 'Geschäftsfelder',
  },
  membersPageHeading: { ja: 'メンバー', en: 'Members', ko: '멤버', zh: '成员', de: 'Team' },

  // ページ読み上げコントロール
  readAloudPlay: {
    ja: 'このページを読み上げる',
    en: 'Read this page aloud',
    ko: '이 페이지 읽어주기',
    zh: '朗读此页面',
    de: 'Diese Seite vorlesen',
  },
  readAloudPause: {
    ja: '読み上げを一時停止',
    en: 'Pause reading',
    ko: '읽기 일시정지',
    zh: '暂停朗读',
    de: 'Vorlesen pausieren',
  },
  readAloudStop: {
    ja: '読み上げを停止',
    en: 'Stop reading',
    ko: '읽기 정지',
    zh: '停止朗读',
    de: 'Vorlesen stoppen',
  },
  readAloudSpeed: { ja: '速度', en: 'Speed', ko: '속도', zh: '速度', de: 'Tempo' },

  // Business セクション
  businessHeading: { ja: 'Business' },
  businessSubtitle: {
    ja: '事業内容',
    en: 'Our business',
    ko: '사업 소개',
    zh: '业务介绍',
    de: 'Unser Angebot',
  },
  businessBody1: {
    ja: '当社は、次世代テクノロジーの研究開発・製造・販売を行う革新的な企業です。',
    en: 'We are an innovative company engaged in the research, development, manufacturing, and sales of next-generation technology.',
    ko: '당사는 차세대 기술의 연구개발·제조·판매를 하는 혁신적인 기업입니다.',
    zh: '我们是一家从事新一代技术研发、制造与销售的创新型企业。',
    de: 'Wir sind ein innovatives Unternehmen für Forschung, Entwicklung, Fertigung und Vertrieb von Technologien der nächsten Generation.',
  },
  businessBody2: {
    ja: 'AI、ロボット工学、自律システムなど、幅広い分野でのソリューション提供を通じて、社会の進化と未来の創造に貢献します。',
    en: 'Through solutions across a wide range of fields — AI, robotics, autonomous systems and more — we contribute to the advancement of society and the creation of the future.',
    ko: 'AI, 로보틱스, 자율 시스템 등 폭넓은 분야에서 솔루션을 제공하며, 사회의 발전과 미래 창조에 기여합니다.',
    zh: '我们通过在人工智能、机器人工程、自主系统等广泛领域提供解决方案，助力社会进步与未来创造。',
    de: 'Mit Lösungen in vielfältigen Bereichen – KI, Robotik, autonome Systeme und mehr – tragen wir zum Fortschritt der Gesellschaft und zur Gestaltung der Zukunft bei.',
  },

  // About Us セクション
  aboutHeading: { ja: 'About Us' },
  aboutSubtitle: {
    ja: '私たちについて',
    en: 'Who we are',
    ko: '회사 소개',
    zh: '关于我们',
    de: 'Über uns',
  },
  aboutMission: {
    ja: '「AIとともに、多言語で世界とつながる」をミッションに掲げ、日々活動をしています。',
    en: 'Our mission is to connect with the world in many languages, together with AI.',
    ko: '‘AI와 함께, 다국어로 세계와 연결된다’를 미션으로 삼아 매일 활동하고 있습니다.',
    zh: '我们以“与 AI 一同，用多种语言连接世界”为使命，每天不断努力。',
    de: 'Unsere Mission: gemeinsam mit KI und in vielen Sprachen die Welt verbinden – daran arbeiten wir jeden Tag.',
  },
  aboutService1: {
    ja: 'AIエージェント実装支援（法人向けコンサルティング）',
    en: 'AI agent implementation support (consulting for businesses)',
    ko: 'AI 에이전트 구축 지원(법인 대상 컨설팅)',
    zh: 'AI 智能体落地支持（面向企业的咨询）',
    de: 'Unterstützung bei der Einführung von KI-Agenten (Beratung für Unternehmen)',
  },
  aboutService2: {
    ja: 'AI・IT研修事業「AX Academy」（個人向け）',
    en: 'AI & IT training — "AX Academy" (for individuals)',
    ko: 'AI·IT 교육 사업 ‘AX Academy’(개인 대상)',
    zh: 'AI·IT 培训业务“AX Academy”（面向个人）',
    de: 'KI- und IT-Schulungen – „AX Academy“ (für Privatpersonen)',
  },
  aboutService3: {
    ja: '受託開発・SaaS開発',
    en: 'Contract development & SaaS development',
    ko: '수탁 개발·SaaS 개발',
    zh: '受托开发·SaaS 开发',
    de: 'Auftragsentwicklung & SaaS-Entwicklung',
  },
  // About Us の会社情報
  aboutInfoCompany: { ja: '社名', en: 'Company', ko: '회사명', zh: '公司名称', de: 'Unternehmen' },
  aboutInfoFounded: { ja: '設立', en: 'Founded', ko: '설립', zh: '成立', de: 'Gegründet' },
  aboutInfoLocation: { ja: '所在地', en: 'Location', ko: '소재지', zh: '所在地', de: 'Standort' },
  aboutInfoRepresentative: {
    ja: '代表者',
    en: 'Representative',
    ko: '대표자',
    zh: '法定代表人',
    de: 'Geschäftsführung',
  },
  aboutInfoCapital: {
    ja: '資本金',
    en: 'Capital',
    ko: '자본금',
    zh: '注册资本',
    de: 'Stammkapital',
  },
  aboutInfoTBD: {
    ja: '準備中',
    en: 'Coming soon',
    ko: '준비 중',
    zh: '准备中',
    de: 'In Vorbereitung',
  },
  aboutRepName: {
    ja: '吉田 健一',
    en: 'Kenichi Yoshida',
    ko: '요시다 겐이치',
    zh: '吉田 健一',
    de: 'Kenichi Yoshida',
  },

  // We are hiring セクション
  hiringHeading: { ja: 'We are hiring' },
  hiringSubtitle: {
    ja: '採用情報',
    en: 'Careers',
    ko: '채용 정보',
    zh: '招聘信息',
    de: 'Karriere',
  },
  hiringBody1: {
    ja: '当社では、チャレンジ精神を持った人材を求めています。',
    en: 'We are looking for people with a spirit of challenge.',
    ko: '당사는 도전 정신을 가진 인재를 찾고 있습니다.',
    zh: '我们正在寻找富有挑战精神的人才。',
    de: 'Wir suchen Menschen mit Mut zur Herausforderung.',
  },
  hiringBody2: {
    ja: '新しいアイデアを出し合い、成長する環境で活躍したい方は、ぜひご応募ください。当社でのキャリアを築きながら、技術の最前線で力を発揮しましょう。',
    en: 'If you want to share new ideas and thrive in an environment where you can grow, we encourage you to apply. Build your career with us and put your skills to work at the forefront of technology.',
    ko: '새로운 아이디어를 함께 나누고 성장하는 환경에서 활약하고 싶은 분은 꼭 지원해 주세요. 당사에서 커리어를 쌓으며 기술의 최전선에서 역량을 발휘해 보세요.',
    zh: '如果你希望与团队共同碰撞新想法、在不断成长的环境中大展身手，欢迎应聘。在这里成就你的职业生涯，在技术最前沿施展才华。',
    de: 'Wenn Sie neue Ideen einbringen und in einem Umfeld wachsen möchten, in dem Sie sich entfalten können, freuen wir uns auf Ihre Bewerbung. Gestalten Sie Ihre Laufbahn bei uns und bringen Sie Ihr Können an vorderster Front der Technologie ein.',
  },
  hiringLink: {
    ja: '採用情報へ',
    en: 'View careers',
    ko: '채용 정보 보기',
    zh: '查看招聘信息',
    de: 'Zu den Stellenangeboten',
  },

  // ----- Contact セクション（左カラム） -----
  contactEyebrow: { ja: 'CONTACT' },
  contactHeadingLead: {
    ja: 'その「ちょっと困った」、',
    en: 'That "I\'m a little stuck" —',
    ko: '그 “조금 곤란한 일”,',
    zh: '你那点“小小的烦恼”，',
    de: 'Ihr „kleines Problem“ –',
  },
  contactHeadingAccent: {
    ja: '聞かせてください。',
    en: "let's talk it through.",
    ko: '들려주세요.',
    zh: '说给我们听听吧。',
    de: 'erzählen Sie es uns.',
  },
  contactLead1: {
    ja: 'まだアイデアが固まっていなくても大丈夫です。',
    en: "It's fine if your idea isn't fully formed yet.",
    ko: '아직 아이디어가 명확하지 않아도 괜찮습니다.',
    zh: '即使想法尚未成型也没关系。',
    de: 'Es macht nichts, wenn Ihre Idee noch nicht ausgereift ist.',
  },
  contactLead2: {
    ja: 'できることから、一緒に考えます。',
    en: "We'll figure out the next step together.",
    ko: '할 수 있는 것부터 함께 고민하겠습니다.',
    zh: '我们会从力所能及之处，与你一起思考。',
    de: 'Wir überlegen gemeinsam den nächsten Schritt.',
  },
  contactService1: {
    ja: 'AIエージェント実装支援（法人向けコンサルティング）',
    en: 'AI agent implementation support (consulting for businesses)',
    ko: 'AI 에이전트 구축 지원(법인 대상 컨설팅)',
    zh: 'AI 智能体落地支持（面向企业的咨询）',
    de: 'Unterstützung bei der Einführung von KI-Agenten (Beratung für Unternehmen)',
  },
  contactService2: {
    ja: '受託開発・SaaS開発',
    en: 'Contract development & SaaS development',
    ko: '수탁 개발·SaaS 개발',
    zh: '受托开发·SaaS 开发',
    de: 'Auftragsentwicklung & SaaS-Entwicklung',
  },
  contactService3: {
    ja: 'AI・IT研修事業「AX Academy」',
    en: 'AI & IT training — "AX Academy"',
    ko: 'AI·IT 교육 사업 ‘AX Academy’',
    zh: 'AI·IT 培训业务“AX Academy”',
    de: 'KI- und IT-Schulungen – „AX Academy“',
  },

  // ----- Contact フォーム -----
  formName: { ja: 'お名前', en: 'Name', ko: '이름', zh: '姓名', de: 'Name' },
  formNamePlaceholder: {
    ja: '山田 太郎',
    en: 'Jane Doe',
    ko: '홍길동',
    zh: '张三',
    de: 'Max Mustermann',
  },
  formEmail: {
    ja: 'メールアドレス',
    en: 'Email',
    ko: '이메일 주소',
    zh: '电子邮箱',
    de: 'E-Mail-Adresse',
  },
  formConsultation: {
    ja: 'ご相談内容',
    en: 'What would you like to discuss?',
    ko: '문의 내용',
    zh: '咨询内容',
    de: 'Worum geht es?',
  },
  formConsultationPlaceholder: {
    ja: '選択してください',
    en: 'Please select',
    ko: '선택해 주세요',
    zh: '请选择',
    de: 'Bitte wählen',
  },
  formMessage: { ja: 'メッセージ', en: 'Message', ko: '메시지', zh: '留言', de: 'Nachricht' },
  formMessagePlaceholder: {
    ja: 'まだぼんやりした内容でも、お気軽にどうぞ。',
    en: 'Even a rough idea is fine — feel free to write.',
    ko: '아직 막연한 내용이라도 편하게 남겨 주세요.',
    zh: '即使还只是模糊的想法，也请随意填写。',
    de: 'Auch eine grobe Idee genügt – schreiben Sie einfach.',
  },
  formRequired: { ja: '必須', en: 'Required', ko: '필수', zh: '必填', de: 'Pflichtfeld' },
  formOptional: { ja: '任意', en: 'Optional', ko: '선택', zh: '选填', de: 'Optional' },
  formCalendarLegend: {
    ja: 'Google Meet相談（顔出し不要）の候補日時を選択してください（最大{max}件）',
    en: 'Choose up to {max} preferred times for a Google Meet call (camera optional)',
    ko: 'Google Meet 상담(얼굴 공개 불필요) 희망 일시를 선택해 주세요(최대 {max}건)',
    zh: '请选择 Google Meet 咨询（无需露脸）的候选日期时间（最多 {max} 个）',
    de: 'Wählen Sie bis zu {max} Wunschtermine für ein Google-Meet-Gespräch (Kamera optional)',
  },
  formCalendarNote: {
    ja: '直近の営業日から自動で3日分表示しています',
    en: 'Showing the next 3 business days automatically',
    ko: '가장 가까운 영업일부터 자동으로 3일치를 표시합니다',
    zh: '自动显示从最近工作日起的 3 天',
    de: 'Es werden automatisch die nächsten 3 Werktage angezeigt',
  },
  formTimeColumn: { ja: '時間帯', en: 'Time', ko: '시간대', zh: '时间段', de: 'Uhrzeit' },
  formSlotClosed: {
    ja: '（受付終了）',
    en: '(closed)',
    ko: '(마감)',
    zh: '（已截止）',
    de: '(geschlossen)',
  },
  formSlotsCounter: {
    ja: '{n} / {max}件選択中',
    en: '{n} of {max} selected',
    ko: '{n} / {max}건 선택 중',
    zh: '已选择 {n} / {max} 个',
    de: '{n} von {max} ausgewählt',
  },
  formSubmit: {
    ja: '相談内容を送る',
    en: 'Send message',
    ko: '상담 내용 보내기',
    zh: '发送咨询内容',
    de: 'Nachricht senden',
  },
  formSubmitting: {
    ja: '送信中…',
    en: 'Sending…',
    ko: '전송 중…',
    zh: '发送中…',
    de: 'Wird gesendet…',
  },
  formSubmitNote: {
    ja: '入力内容と選択した候補日時を、担当者へメールで送信します。',
    en: 'Your details and selected times will be emailed to our team.',
    ko: '입력하신 내용과 선택한 희망 일시를 담당자에게 이메일로 전송합니다.',
    zh: '您填写的内容和所选候选时间将通过邮件发送给我们的负责人。',
    de: 'Ihre Angaben und die gewählten Termine werden per E-Mail an unser Team gesendet.',
  },
  formSuccessTitle: {
    ja: '送信しました。ありがとうございます。',
    en: 'Sent — thank you!',
    ko: '전송되었습니다. 감사합니다.',
    zh: '已发送，谢谢您！',
    de: 'Gesendet – vielen Dank!',
  },
  formSuccessBody: {
    ja: '担当者が内容を確認のうえ、いただいたメールアドレス宛に日程のご連絡をいたします。通常2〜3営業日以内にご返信します。',
    en: 'Our team will review your message and email you to arrange a time, usually within 2–3 business days.',
    ko: '담당자가 내용을 확인한 후, 남겨 주신 이메일 주소로 일정을 안내해 드립니다. 보통 2~3영업일 이내에 답변드립니다.',
    zh: '我们的负责人确认内容后，会通过您提供的邮箱与您联系确定日程。通常在 2～3 个工作日内回复。',
    de: 'Unser Team prüft Ihre Nachricht und meldet sich per E-Mail zur Terminabstimmung – in der Regel innerhalb von 2–3 Werktagen.',
  },

  // ご相談内容の選択肢
  consultAgent: {
    ja: 'AIエージェント実装相談',
    en: 'AI agent implementation',
    ko: 'AI 에이전트 구축 상담',
    zh: 'AI 智能体落地咨询',
    de: 'Einführung von KI-Agenten',
  },
  consultDev: {
    ja: '受託開発・SaaS開発相談',
    en: 'Contract / SaaS development',
    ko: '수탁 개발·SaaS 개발 상담',
    zh: '受托开发·SaaS 开发咨询',
    de: 'Auftrags- / SaaS-Entwicklung',
  },
  consultTraining: {
    ja: 'AI・IT研修相談（AX Academy）',
    en: 'AI & IT training (AX Academy)',
    ko: 'AI·IT 교육 상담(AX Academy)',
    zh: 'AI·IT 培训咨询（AX Academy）',
    de: 'KI- & IT-Schulungen (AX Academy)',
  },
  consultOther: { ja: 'その他', en: 'Other', ko: '기타', zh: '其他', de: 'Sonstiges' },

  // バリデーションエラー
  errNameRequired: {
    ja: 'お名前を入力してください',
    en: 'Please enter your name.',
    ko: '이름을 입력해 주세요',
    zh: '请输入您的姓名',
    de: 'Bitte geben Sie Ihren Namen ein.',
  },
  errEmailRequired: {
    ja: 'メールアドレスを入力してください',
    en: 'Please enter your email address.',
    ko: '이메일 주소를 입력해 주세요',
    zh: '请输入电子邮箱',
    de: 'Bitte geben Sie Ihre E-Mail-Adresse ein.',
  },
  errEmailInvalid: {
    ja: 'メールアドレスの形式が正しくありません',
    en: 'Please enter a valid email address.',
    ko: '이메일 주소 형식이 올바르지 않습니다',
    zh: '电子邮箱格式不正确',
    de: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.',
  },
  errConsultationRequired: {
    ja: 'ご相談内容を選択してください',
    en: 'Please select a topic.',
    ko: '문의 내용을 선택해 주세요',
    zh: '请选择咨询内容',
    de: 'Bitte wählen Sie ein Thema.',
  },
  errSlotsRequired: {
    ja: '候補日時を1件以上選択してください',
    en: 'Please select at least one time slot.',
    ko: '희망 일시를 1건 이상 선택해 주세요',
    zh: '请至少选择一个候选时间',
    de: 'Bitte wählen Sie mindestens einen Termin.',
  },
  errSubmitFailed: {
    ja: '送信に失敗しました。お手数ですが時間をおいて再度お試しいただくか、直接メールにてご連絡ください。',
    en: 'Something went wrong. Please try again later, or contact us directly by email.',
    ko: '전송에 실패했습니다. 번거로우시겠지만 잠시 후 다시 시도하시거나, 이메일로 직접 연락해 주세요.',
    zh: '发送失败。请稍后重试，或直接通过邮件与我们联系。',
    de: 'Etwas ist schiefgelaufen. Bitte versuchen Sie es später erneut oder kontaktieren Sie uns direkt per E-Mail.',
  },
  errNetwork: {
    ja: 'ネットワークエラーにより送信できませんでした。通信環境をご確認のうえ再度お試しください。',
    en: "Couldn't send due to a network error. Please check your connection and try again.",
    ko: '네트워크 오류로 전송하지 못했습니다. 통신 환경을 확인하신 후 다시 시도해 주세요.',
    zh: '因网络错误未能发送。请检查网络连接后重试。',
    de: 'Aufgrund eines Netzwerkfehlers konnte nicht gesendet werden. Bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut.',
  },
  errNotConfigured: {
    ja: '送信設定が未完了のため送信できませんでした。お手数ですが時間をおいて再度お試しください。',
    en: "The form isn't fully configured yet. Please try again later.",
    ko: '전송 설정이 완료되지 않아 전송하지 못했습니다. 번거로우시겠지만 잠시 후 다시 시도해 주세요.',
    zh: '由于发送设置尚未完成，未能发送。请稍后重试。',
    de: 'Das Formular ist noch nicht vollständig konfiguriert. Bitte versuchen Sie es später erneut.',
  },
} satisfies Record<string, Localized>;

export type UiStringKey = keyof typeof UI_STRINGS;

// 指定キーの文言を lang に応じて返す。lang は Cookie / searchParams で解決済みの値を渡す。
// 対象言語のキーが無ければ日本語にフォールバックする。
// {n} / {max} などのプレースホルダを含むキーは呼び出し側で置換する。
export const ui = (key: UiStringKey, lang: Lang | string | undefined): string => {
  const entry: Localized = UI_STRINGS[key];
  const resolved = resolveLang(lang);
  return (resolved !== 'ja' && entry[resolved]) || entry.ja;
};
