import { getLanguageByTranslationField, type TranslationSuffix } from './lang-registry';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-5';
// 1言語ぶんのタイトル＋本文HTMLを1回の応答で返すための上限。
// 以前は全対象言語をまとめて1回で返していたため大きな値（49152）が必要だったが、
// 言語ごとに呼び出しを分割した（translateArticleLang）ことで、1回の応答は
// 1記事1言語ぶんで済むようになった。
const DEFAULT_MAX_TOKENS = 16384;

type TranslationInput = {
  title: string;
  contentHtml: string;
};

export type LangTranslation = {
  title: string;
  content: string;
};

const TRANSLATION_TOOL_NAME = 'submit_translation';

/**
 * 言語ごとの翻訳失敗を、原因の種類が一目で分かる形で呼び出し側（translate-pipeline.ts）に
 * 伝えるためのエラー型。ログに「どの言語が」「何が原因で」失敗したかを1行で残せるように、
 * targetLang・kind・httpStatus を構造化して持たせる（メッセージ文字列の目視・パースに頼らない）。
 */
export type TranslationErrorKind =
  | 'missing_api_key'
  | 'timeout'
  | 'http_error'
  | 'invalid_response'
  | 'network_error';

export class TranslationError extends Error {
  readonly targetLang: TranslationSuffix;
  readonly kind: TranslationErrorKind;
  readonly httpStatus?: number;

  constructor(
    message: string,
    options: { targetLang: TranslationSuffix; kind: TranslationErrorKind; httpStatus?: number },
  ) {
    super(message);
    this.name = 'TranslationError';
    this.targetLang = options.targetLang;
    this.kind = options.kind;
    this.httpStatus = options.httpStatus;
  }
}

const buildSystemPrompt = (targetLang: TranslationSuffix): string => {
  const lang = getLanguageByTranslationField(targetLang);
  return `あなたはIT/AI業界のコーポレートサイト記事を、日本語から${lang.translationNameJa}に翻訳するプロフェッショナル翻訳者です。
以下のルールを厳守してください。

- ${lang.translationInstruction}翻訳すること。
- IT/AI関連の専門用語、製品名、固有名詞、サービス名は無理に訳さず、原語（一般的に使われる表記）のまま残すこと。
- content の入力はHTML文字列です。タグ構造・属性は一切変更せず、タグの中のテキストのみを翻訳すること。タグを追加/削除/並べ替えしないこと。
- 出力は必ず submit_translation ツールを呼び出して構造化データとして返すこと。title・content の両方のフィールドを埋めること。`;
};

// 1言語ぶんの翻訳リクエストに与えるデフォルトのタイムアウト。呼び出し側
// （translate-pipeline.ts）が全体の実行時間予算に応じて上書きできる。
const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * 記事タイトル・本文（HTML）を、指定した1言語だけに翻訳する。
 * 言語ごとに独立した1回のAPI呼び出しにすることで、（1）出力トークン上限に
 * 対象言語数が影響しない、（2）1言語の失敗が他言語に波及しない、（3）失敗した
 * 言語だけを再試行できる、という3つを同時に満たす（呼び出し側 = translate-pipeline.ts
 * が、未翻訳の言語ごとにこの関数を呼ぶ）。
 *
 * timeoutMs でリクエストを打ち切る。ハングしたリクエストが呼び出し側の実行時間予算
 * （Vercelのmaxduration）を食いつぶし、他の言語の翻訳結果の保存まで巻き込んで失われる
 * のを防ぐため。
 */
export const translateArticleLang = async (
  { title, contentHtml }: TranslationInput,
  targetLang: TranslationSuffix,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<LangTranslation> => {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new TranslationError('ANTHROPIC_API_KEY is required', {
      targetLang,
      kind: 'missing_api_key',
    });
  }

  const lang = getLanguageByTranslationField(targetLang);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
        max_tokens: Number(process.env.ANTHROPIC_MAX_TOKENS) || DEFAULT_MAX_TOKENS,
        system: buildSystemPrompt(targetLang),
        messages: [
          {
            role: 'user',
            content: [
              `以下の記事タイトルと本文（HTML）を${lang.translationNameJa}に翻訳してください。`,
              '',
              '## title',
              title,
              '',
              '## content (HTML)',
              contentHtml,
            ].join('\n'),
          },
        ],
        tools: [
          {
            name: TRANSLATION_TOOL_NAME,
            description: `翻訳結果（${lang.translationNameJa}のタイトルと本文HTML）を送信する`,
            input_schema: {
              type: 'object',
              properties: {
                title: { type: 'string', description: `${lang.translationNameJa}に翻訳された記事タイトル` },
                content: {
                  type: 'string',
                  description: '入力と同じHTMLタグ構造を保ったまま、テキスト部分のみ翻訳した本文',
                },
              },
              required: ['title', 'content'],
            },
          },
        ],
        tool_choice: { type: 'tool', name: TRANSLATION_TOOL_NAME },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new TranslationError(
        `Anthropic API request failed for ${targetLang} (${response.status}): ${errorText}`,
        { targetLang, kind: 'http_error', httpStatus: response.status },
      );
    }

    const data = await response.json();
    const toolUseBlock = (data.content as Array<Record<string, unknown>>)?.find(
      (block) => block.type === 'tool_use' && block.name === TRANSLATION_TOOL_NAME,
    );

    if (!toolUseBlock) {
      throw new TranslationError(
        `Anthropic API response for ${targetLang} did not include the expected tool_use block`,
        { targetLang, kind: 'invalid_response' },
      );
    }

    const result = toolUseBlock.input as Partial<LangTranslation>;
    if (!result.title || !result.content) {
      throw new TranslationError(`Anthropic API response is missing title/content for ${targetLang}`, {
        targetLang,
        kind: 'invalid_response',
      });
    }

    return { title: result.title, content: result.content };
  } catch (error) {
    if (error instanceof TranslationError) {
      throw error;
    }
    if (controller.signal.aborted) {
      throw new TranslationError(`Anthropic API request timed out for ${targetLang} after ${timeoutMs}ms`, {
        targetLang,
        kind: 'timeout',
      });
    }
    throw new TranslationError(
      `Anthropic API request errored for ${targetLang}: ${error instanceof Error ? error.message : String(error)}`,
      { targetLang, kind: 'network_error' },
    );
  } finally {
    clearTimeout(timeout);
  }
};
