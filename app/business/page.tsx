import Image from 'next/image';
import styles from './page.module.css';
import ButtonLink from '@/app/_components/ButtonLink';

type Status = '提供中' | '開発中' | '提供準備中';

type RelatedLink = {
  label: string;
  href: string;
};

type Section = {
  status: Status;
  category: string;
  title: string;
  subtitle: string;
  description: string;
  image: string;
  imageAlt: string;
  links: RelatedLink[];
};

const sections: Section[] = [
  {
    status: '提供中',
    category: 'FOR CREATORS',
    title: 'マルチテナント型SaaS開発',
    subtitle: 'まず自分のために作り、多くの人へ届ける',
    description:
      '顧客ごとに一から作り直すのではなく、まず自分自身が最初のユーザーになり、動くものを作った上で、複数の企業に展開できる構造に設計します。自分自身のnote.comのフォロワーデータを分析するアプリとして開発をスタートし、現在は複数アカウントを横断的に分析できる、マルチテナント型のSaaSへと発展させています。',
    image: '/business-saas.png',
    imageAlt: 'マルチテナント型SaaS開発のイメージ',
    links: [],
  },
  {
    status: '提供中',
    category: 'FOR BUSINESS',
    title: '8か国語対応コーポレートサイト・LP制作',
    subtitle: '会社の魅力を、世界に伝わるWebサイトへ',
    description:
      'このAXelWorksのサイト自体が、まさにその実例です。日本語で記事を書くだけで7言語へ自動翻訳される仕組み、3D地球儀のUIでの言語切り替え、音声読み上げ機能まで、すべて自社サイトで実装・運用しています。',
    image: '/business-multilingual.png',
    imageAlt: '8か国語対応コーポレートサイト・LP制作のイメージ',
    links: [],
  },
  {
    status: '提供中',
    category: 'FOR BUSINESS',
    title: '見込み客の囲い込みと、商談予約フォームによる成約時間短縮の仕組み',
    subtitle: '単体でも、どんな媒体に載せても機能する',
    description:
      '候補日時をその場で選んで送信するだけで、アポイントが確定します。メールでの日程調整という時間のかかるやり取りを省略できる仕組みで、コーポレートサイト、サービスサイト、LPなど、あらゆる媒体に組み込むことで、成約までの導線を強化します。このサイトの一番下にある予約フォームも、この仕組みそのものです。',
    image: '/business-booking.png',
    imageAlt: '商談予約フォームの仕組みのイメージ',
    links: [],
  },
  {
    status: '提供中',
    category: 'FOR BUSINESS',
    title: 'AI・IT研修、タッチタイピング研修',
    subtitle: 'AIを、明日から使える仕事の相棒に',
    description:
      '生成AIの基本的な使い方から、業務別のプロンプト活用、安全に使うためのルールまで、専門用語ではなく体験を通じてお伝えします。30年以上にわたる指導実績を持つタッチタイピング研修も、AI時代の入力スキルとしてご提供しています。',
    image: '/business-training.png',
    imageAlt: 'AI・IT研修、タッチタイピング研修のイメージ',
    links: [],
  },
  {
    status: '提供中',
    category: 'FOR BUSINESS',
    title: '保守運用',
    subtitle: '作って終わりにしない',
    description:
      'サイトやシステムは、作って終わりではなく、育てていくものだと考えています。公開後の定期的なメンテナンス、不具合対応、機能追加まで、継続的な保守運用サービスとして提供しています。',
    image: '/business-maintenance.png',
    imageAlt: '保守運用のイメージ',
    links: [],
  },
];

export default function Page() {
  return (
    <>
      <div className={styles.sections}>
        {sections.map((section, i) => {
          const num = String(i + 1).padStart(2, '0');
          return (
            <section key={section.title} className={styles.section}>
              <div className={styles.media}>
                <Image
                  src={section.image}
                  alt={section.imageAlt}
                  fill
                  sizes="(max-width: 640px) calc(100vw - 64px), (max-width: 920px) calc((100vw - 240px) * 0.44), 300px"
                  className={styles.image}
                />
              </div>

              <div className={styles.body}>
                <div className={styles.meta}>
                  <span className={styles.num}>{num}</span>
                  <span className={styles.badge} data-status={section.status}>
                    {section.status}
                  </span>
                  <span className={styles.tag}>{section.category}</span>
                </div>

                <h2 className={styles.title}>{section.title}</h2>
                <p className={styles.subtitle}>{section.subtitle}</p>
                <p className={styles.description}>{section.description}</p>

                {section.links.length > 0 && (
                  <div className={styles.related}>
                    <span className={styles.relatedHeading}>関連記事</span>
                    <ul className={styles.relatedList}>
                      {section.links.map((link) => (
                        <li key={link.label}>
                          <a href={link.href}>{link.label}</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className={styles.footer}>
        <h2 className={styles.message}>We are hiring</h2>
        <p>私たちは共にチャレンジする仲間を募集しています。</p>
        <ButtonLink href="">採用情報へ</ButtonLink>
      </div>
    </>
  );
}
