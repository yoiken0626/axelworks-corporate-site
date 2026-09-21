import { type Lang } from './lang';
import { READ_ALOUD_PAUSE_MARK, READ_ALOUD_LIST_MARK, stripReadAloudMarks } from './read-aloud-marks';

/**
 * ディクテーション練習モード用の「区切り」処理。純粋関数のみで構成し、DOM や
 * React に一切依存しない（単体テストしやすくするため）。
 *
 * 入力は useReadAloud と同じ `segments: string[]`（title, htmlToPlainText済み本文, ...）。
 * htmlToPlainText がブロック要素（p/h1-6/li/blockquote/figcaption/br/tr）の後に '\n' を、
 * 見出し/リスト項目の直前に不可視マーカー（READ_ALOUD_PAUSE_MARK / READ_ALOUD_LIST_MARK）を
 * 埋め込み済みなので、ここではそれを手がかりにブロック境界を復元する。
 */

export type DictationBoundaryMode = 'commaPeriod' | 'sentence';

export type DictationSegment = {
  text: string;
  /** 元の segments 配列での index（0 = タイトル、1以降 = 本文） */
  segIndex: number;
  kind: 'heading' | 'listItem' | 'paragraph';
};

const CJK_LANGS: ReadonlySet<Lang> = new Set<Lang>(['ja', 'zh', 'ko']);
const isCjkLang = (lang: Lang): boolean => CJK_LANGS.has(lang);

// ---- 区切り記号で止めない例外（保護区間）------------------------------------

// 大文字小文字を区別せずマッチ。e.g. / i.e. / a.m. / p.m. / U.S. は内部にもピリオドを
// 持つため、末尾の「.」まで含めて丸ごと1つのパターンにする。
const ABBREVIATIONS = ['Mr', 'Mrs', 'Ms', 'Dr', 'St', 'vs', 'etc', 'e\\.g', 'i\\.e', 'a\\.m', 'p\\.m', 'U\\.S'];
const ABBREV_RE = new RegExp(`\\b(?:${ABBREVIATIONS.join('|')})\\.`, 'gi');

// 数字の桁区切り・小数点（1,000 / 3.5 / 1,000.50 など）
const NUMBER_RE = /\d(?:[.,]\d+)+/g;

// 三点リーダー（半角の連続ピリオド、または…）
const ELLIPSIS_RE = /\.{2,}|…/g;

const URL_RE = /\bhttps?:\/\/\S+/gi;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi;

type Span = [number, number]; // [start, end)

const findProtectedSpans = (text: string): Span[] => {
  const spans: Span[] = [];
  const collect = (re: RegExp) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      spans.push([m.index, m.index + m[0].length]);
    }
  };
  collect(ABBREV_RE);
  collect(NUMBER_RE);
  collect(ELLIPSIS_RE);
  collect(URL_RE);
  collect(EMAIL_RE);

  spans.sort((a, b) => a[0] - b[0]);
  const merged: Span[] = [];
  for (const [s, e] of spans) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) {
      last[1] = Math.max(last[1], e);
    } else {
      merged.push([s, e]);
    }
  }
  return merged;
};

const isProtectedAt = (spans: Span[], index: number): boolean =>
  spans.some(([s, e]) => index >= s && index < e);

// ---- 区切り記号での分割 -------------------------------------------------------

const TERMINAL_CHARS = new Set(['.', '．', '。', '?', '？', '!', '！']);
const COMMA_CHARS = new Set([',', '，', '、']);
// 区切りの直後にあれば、次の区間ではなく直前の区間に含める閉じ引用符・閉じ括弧
const CLOSING_CHARS = new Set(['"', "'", '”', '’', ')', '）', ']', '」', '』', '】', '}', '›', '»']);

/**
 * 区切り記号（カンマ・ピリオド、または文末のみ）で text を分割する。
 * 例外（略語・数字の桁区切り/小数点・三点リーダー・URL・メールアドレス）では
 * 分割しない。区切り記号自体は、その直前の区間の末尾に含める。区切りの直後に
 * 閉じ引用符・閉じ括弧があれば、それも直前の区間に含める。
 */
export const splitByPunctuation = (text: string, mode: DictationBoundaryMode): string[] => {
  if (!text) return [];
  const spans = findProtectedSpans(text);
  const boundaries: number[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const isTerminal = TERMINAL_CHARS.has(ch);
    const isComma = mode === 'commaPeriod' && COMMA_CHARS.has(ch);
    if ((isTerminal || isComma) && !isProtectedAt(spans, i)) {
      let j = i + 1;
      // 連続する区切り記号（例: "?!"）をまとめて1つの境界にする
      while (
        j < text.length &&
        (TERMINAL_CHARS.has(text[j]) || (mode === 'commaPeriod' && COMMA_CHARS.has(text[j]))) &&
        !isProtectedAt(spans, j)
      ) {
        j += 1;
      }
      // 直後の閉じ引用符・閉じ括弧を直前の区間に含める
      while (j < text.length && CLOSING_CHARS.has(text[j])) {
        j += 1;
      }
      boundaries.push(j);
      i = j;
      continue;
    }
    i += 1;
  }

  const pieces: string[] = [];
  let start = 0;
  for (const b of boundaries) {
    pieces.push(text.slice(start, b));
    start = b;
  }
  if (start < text.length) pieces.push(text.slice(start));
  return pieces.map((p) => p.trim()).filter(Boolean);
};

// ---- 短すぎる区間の結合 --------------------------------------------------------

// 閾値はここで一元管理する。
export const MIN_WORDS_LATIN = 3;
export const MIN_CHARS_CJK = 6;

// 記号だけのトークン（例: "...", "-", "!"）は「語」として数えない。文字・数字
// （Unicode の文字/数字カテゴリ）を1つでも含めば1語として数える
// （"e.g." "1,000" "3.5" "Mr." はいずれも1語）。
// \p{L}/\p{N}（Unicode プロパティエスケープ）はロシア語等の非ASCII文字も正しく
// 「文字」と判定できるが、正規表現リテラルに u フラグを付けると tsconfig の
// target(es5) で構文エラーになるため、RegExp コンストラクタ経由で組み立てる
// （実行時の挙動はリテラルと同じ。対応ブラウザは ES2018+ で問題ない）。
const HAS_LETTER_OR_NUMBER_RE = new RegExp('[\\p{L}\\p{N}]', 'u');
const isSymbolOnlyToken = (token: string): boolean => !HAS_LETTER_OR_NUMBER_RE.test(token);

const countWords = (text: string): number =>
  text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !isSymbolOnlyToken(token)).length;

const isShortPiece = (text: string, lang: Lang): boolean => {
  if (isCjkLang(lang)) {
    return text.replace(/\s+/g, '').length < MIN_CHARS_CJK;
  }
  return countWords(text) < MIN_WORDS_LATIN;
};

const joinPieces = (a: string, b: string, lang: Lang): string => (isCjkLang(lang) ? `${a}${b}` : `${a} ${b}`);

/**
 * 短すぎる区間を次の区間に結合する。最後の区間が短すぎる場合は前の区間に結合する。
 */
export const mergeShortPieces = (pieces: string[], lang: Lang): string[] => {
  if (pieces.length <= 1) return pieces.slice();

  const merged: string[] = [];
  let carry: string | null = null;
  for (let i = 0; i < pieces.length; i += 1) {
    const piece: string = carry !== null ? joinPieces(carry, pieces[i], lang) : pieces[i];
    carry = null;
    const isLast = i === pieces.length - 1;
    if (!isLast && isShortPiece(piece, lang)) {
      carry = piece;
    } else {
      merged.push(piece);
    }
  }
  if (carry !== null) merged.push(carry);

  while (merged.length > 1 && isShortPiece(merged[merged.length - 1], lang)) {
    const last = merged.pop() as string;
    merged[merged.length - 1] = joinPieces(merged[merged.length - 1], last, lang);
  }
  return merged;
};

// ---- ブロック（見出し / リスト項目 / 段落）への分解 ----------------------------

type RawBlock = { text: string; kind: DictationSegment['kind']; segIndex: number };

const extractBlocks = (segments: string[]): RawBlock[] => {
  const blocks: RawBlock[] = [];
  segments.forEach((seg, segIndex) => {
    const rawPieces = seg
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const piece of rawPieces) {
      if (piece.startsWith(READ_ALOUD_PAUSE_MARK)) {
        const text = stripReadAloudMarks(piece).trim();
        if (text) blocks.push({ text, kind: 'heading', segIndex });
      } else if (piece.startsWith(READ_ALOUD_LIST_MARK)) {
        const text = stripReadAloudMarks(piece).trim();
        if (text) blocks.push({ text, kind: 'listItem', segIndex });
      } else {
        const text = stripReadAloudMarks(piece).trim();
        if (text) blocks.push({ text, kind: 'paragraph', segIndex });
      }
    }
  });
  return blocks;
};

/**
 * segments（useReadAloud と同じ元データ）から、ディクテーション練習用の区間一覧を作る。
 * - 見出しはそれぞれ1つの区間にする（分割しない）。
 * - リスト項目は項目ごとに独立して区切る（項目間はまたがない）。
 * - それ以外（段落）は、連続する段落ブロックをまとめてから区切る（段落の境界はまたいでよい）。
 * - 短すぎる区間の結合は、見出し・リスト項目の境界をまたがない
 *   （グルーピングの単位が既にそれらの境界で区切られているため、自然に満たされる）。
 */
export const buildDictationSegments = (
  segments: string[],
  mode: DictationBoundaryMode,
  lang: Lang,
): DictationSegment[] => {
  const blocks = extractBlocks(segments);
  const result: DictationSegment[] = [];

  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];

    if (block.kind === 'heading') {
      result.push({ text: block.text, segIndex: block.segIndex, kind: 'heading' });
      i += 1;
      continue;
    }

    if (block.kind === 'listItem') {
      const pieces = mergeShortPieces(splitByPunctuation(block.text, mode), lang);
      for (const text of pieces) result.push({ text, segIndex: block.segIndex, kind: 'listItem' });
      i += 1;
      continue;
    }

    // 段落: 同じ segIndex 内で連続する段落ブロックをまとめて処理する
    let j = i;
    const runTexts: string[] = [];
    while (j < blocks.length && blocks[j].kind === 'paragraph' && blocks[j].segIndex === block.segIndex) {
      runTexts.push(blocks[j].text);
      j += 1;
    }
    const runText = runTexts.join(' ');
    const pieces = mergeShortPieces(splitByPunctuation(runText, mode), lang);
    for (const text of pieces) result.push({ text, segIndex: block.segIndex, kind: 'paragraph' });
    i = j;
  }

  return result;
};
