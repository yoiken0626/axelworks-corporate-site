import { load } from 'cheerio';
import type { AnyNode, Element, Text } from 'domhandler';
import { LINK_CARD_ALLOWED_HOSTS } from '@/app/_constants';

// 記事本文中の「リンクだけの段落」を、noteのようなサムネイル付きリンクカードに変換する。
// OGP取得はサーバー側のみで行う（このモジュールは Article コンポーネント経由でしか
// 呼ばれず、クライアントバンドルには含まれない）。

const OGP_FETCH_TIMEOUT_MS = 3000;
const OGP_MAX_CHARS = 200 * 1024; // 先頭200KBまでしか見ない

type OgpData = {
  title: string;
  description: string;
  image: string | null;
  siteName: string | null;
};

const isAllowedHttpsUrl = (url: URL): boolean =>
  url.protocol === 'https:' && LINK_CARD_ALLOWED_HOSTS.includes(url.hostname);

// 許可リストのホスト・httpsのみに絞ってOGPを取得する。取得失敗・空・リダイレクト先が
// 許可リスト外だった場合は null を返し、呼び出し側で「普通のリンクのまま」にフォールバックする。
// Next.js の fetch キャッシュ（1日）に乗るため、同じURLへの重複取得は自動的に避けられる。
const fetchOgp = async (href: string): Promise<OgpData | null> => {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (!isAllowedHttpsUrl(url)) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OGP_FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        accept: 'text/html',
        'user-agent': 'AXelWorks-LinkCardBot/1.0 (+https://axel-works.com)',
      },
      next: { revalidate: 86400 },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    return null;
  }

  // リダイレクトされていた場合、最終的な遷移先も https + 許可リストのドメインであることを確認する
  let finalUrl: URL;
  try {
    finalUrl = new URL(res.url || url.toString());
  } catch {
    return null;
  }
  if (!isAllowedHttpsUrl(finalUrl)) {
    return null;
  }

  let html: string;
  try {
    html = await res.text();
  } catch {
    return null;
  }
  if (html.length > OGP_MAX_CHARS) {
    html = html.slice(0, OGP_MAX_CHARS);
  }

  const $ = load(html);
  const metaContent = (selector: string): string => $(selector).first().attr('content')?.trim() || '';

  const title =
    metaContent('meta[property="og:title"]') ||
    metaContent('meta[name="twitter:title"]') ||
    $('title').first().text().trim();
  const description =
    metaContent('meta[property="og:description"]') || metaContent('meta[name="twitter:description"]');
  const siteName = metaContent('meta[property="og:site_name"]') || null;

  const rawImage = metaContent('meta[property="og:image"]') || metaContent('meta[name="twitter:image"]');
  let image: string | null = null;
  if (rawImage) {
    try {
      const imageUrl = new URL(rawImage, finalUrl);
      if (imageUrl.protocol === 'https:') {
        image = imageUrl.toString();
      }
    } catch {
      image = null;
    }
  }

  if (!title && !description && !image && !siteName) {
    return null;
  }

  return { title, description, image, siteName };
};

// 段落末尾の「(空白のみのノード)*」を除いた、実質的な最後のノードを探す。
const lastMeaningfulIndex = (nodes: AnyNode[]): number => {
  let end = nodes.length;
  while (end > 0) {
    const n = nodes[end - 1];
    if (n.type === 'text' && !n.data.trim()) {
      end--;
      continue;
    }
    break;
  }
  return end;
};

// 末尾が「👉」（前後の空白は無視）で終わるテキストか判定し、末尾がその場合は
// 「👉 とその前後の空白を取り除いた残りの文字列」を返す。末尾に👉が無ければ null。
const EMOJI_TRAILING_RE = /^([\s\S]*?)\s*👉️?\s*$/;
const stripTrailingPointer = (text: string): string | null => {
  const m = text.match(EMOJI_TRAILING_RE);
  return m ? m[1] : null;
};

type TrailingLinkCandidate = {
  href: string;
  // <p> から取り除く末尾のノード（末尾の <a> と、その後ろの空白のみのノード）
  trailingNodesToRemove: AnyNode[];
  // 説明文側に残すテキストノードの更新（👉 とその前後の空白を除去した後の文字列）。
  // 段落が「👉＋リンクのみ」だった場合は null（説明文側に更新対象のテキストが無い）。
  prefixTextUpdate: { node: Text; newData: string } | null;
};

// 段落の末尾が「(任意の説明文) (👉 の場合のみ) <a href=許可リストのURL>」で終わっているか判定する。
// ・段落全体が <a> だけ（前に説明文が無い）→ 👉 は無くてもよい（従来どおり）
// ・前に説明文がある → その直後のテキストが「...👉」で終わっている必要がある
// ・段落内に複数リンクがあっても、末尾の1つだけを対象にする（前の部分はそのまま）
const findTrailingLinkCandidate = (
  $: ReturnType<typeof load>,
  pElm: Element,
): TrailingLinkCandidate | null => {
  const nodes = $(pElm).contents().toArray();
  const end = lastMeaningfulIndex(nodes);
  if (end === 0) {
    return null;
  }
  const lastNode = nodes[end - 1];
  if (lastNode.type !== 'tag' || lastNode.name !== 'a') {
    return null;
  }

  const href = $(lastNode).attr('href');
  if (!href) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (!LINK_CARD_ALLOWED_HOSTS.includes(url.hostname)) {
    return null;
  }

  const trailingNodesToRemove = nodes.slice(end - 1); // <a> ＋ その後ろの空白のみのノード
  const prefixNodes = nodes.slice(0, end - 1);

  if (prefixNodes.length === 0) {
    return { href, trailingNodesToRemove, prefixTextUpdate: null };
  }

  const lastPrefixNode = prefixNodes[prefixNodes.length - 1];
  if (lastPrefixNode.type !== 'text') {
    return null;
  }
  const newData = stripTrailingPointer(lastPrefixNode.data);
  if (newData === null) {
    return null; // 説明文があるのに👉で終わっていない → 対象外（普通のリンクのまま）
  }

  return {
    href,
    trailingNodesToRemove,
    prefixTextUpdate: { node: lastPrefixNode, newData },
  };
};

// カードのDOMを組み立てる。text()/attr() 経由で値を入れるため、
// エスケープはcheerio（domhandler）のシリアライズ時に自動で行われる。
const buildLinkCardEl = ($: ReturnType<typeof load>, href: string, ogp: OgpData) => {
  const $wrapper = $('<div>').attr('data-link-card', 'true').attr('data-read-aloud-skip', 'true');
  const $link = $('<a>').attr('href', href);

  if (ogp.image) {
    $('<img>')
      .attr('src', ogp.image)
      .attr('alt', '')
      .attr('loading', 'lazy')
      .attr('referrerpolicy', 'no-referrer')
      .attr('data-link-card-image', 'true')
      .appendTo($link);
  }

  const $body = $('<div>').attr('data-link-card-body', 'true').appendTo($link);
  if (ogp.title) {
    $('<div>').attr('data-link-card-title', 'true').text(ogp.title).appendTo($body);
  }
  if (ogp.description) {
    $('<div>').attr('data-link-card-description', 'true').text(ogp.description).appendTo($body);
  }
  if (ogp.siteName) {
    $('<div>').attr('data-link-card-sitename', 'true').text(ogp.siteName).appendTo($body);
  }

  $link.appendTo($wrapper);
  return $wrapper;
};

// $ 内の対象段落を「説明文（あれば、そのまま）＋カード（独立ブロック）」に変換する。
// target="_blank" 等の外部リンク属性は、この後に実行される既存の addExternalLinkAttrs が、
// カードの <a> にも通常のリンクと同じロジックで付与する（ここでは付けない）。
export const convertLinkCards = async ($: ReturnType<typeof load>): Promise<void> => {
  const found: ({ pElm: Element } & TrailingLinkCandidate)[] = [];
  $('p').each((_, elm) => {
    if (elm.type !== 'tag') {
      return;
    }
    const candidate = findTrailingLinkCandidate($, elm);
    if (candidate) {
      found.push({ pElm: elm, ...candidate });
    }
  });
  if (found.length === 0) {
    return;
  }

  const ogpResults = await Promise.all(found.map((c) => fetchOgp(c.href)));

  found.forEach((c, i) => {
    const ogp = ogpResults[i];
    if (!ogp) {
      return; // 取得失敗・空・許可外リダイレクト → 段落は一切変更しない（普通のリンクのまま）
    }

    const $card = buildLinkCardEl($, c.href, ogp);

    // 「👉」とその前後の空白を説明文側から取り除く
    if (c.prefixTextUpdate) {
      c.prefixTextUpdate.node.data = c.prefixTextUpdate.newData;
    }
    // 末尾の <a>（＋その後ろの空白のみのノード）を段落から取り除く
    c.trailingNodesToRemove.forEach((n) => $(n).remove());

    const $p = $(c.pElm);
    if ($p.text().trim() === '') {
      // 説明文が残らない（＝元々リンクだけの段落だった） → 段落ごとカードに置き換える
      $p.replaceWith($card);
    } else {
      // 説明文はそのまま残し、カードはその下に独立したブロックとして追加する
      $p.after($card);
    }
  });
};
