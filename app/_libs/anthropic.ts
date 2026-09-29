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

const buildSystemPrompt = (targetLang: TranslationSuffix): string => {
  const lang = getLanguageByTranslationField(targetLang);
  return `あなたはIT/AI業界のコーポレートサイト記事を、日本語から${lang.translationNameJa}に翻訳するプロフェッショナル翻訳者です。
以下のルールを厳守してください。

- ${lang.translationInstruction}翻訳すること。
- IT/AI関連の専門用語、製品名、固有名詞、サービス名は無理に訳さず、原語（一般的に使われる表記）のまま残すこと。
- content の入力はHTML文字列です。タグ構造・属性は一切変更せず、タグの中のテキストのみを翻訳すること。タグを追加/削除/並べ替えしないこと。
- 出力は必ず submit_translation ツールを呼び出して構造化データとして返すこと。title・content の両方のフィールドを埋めること。`;
};

/**
 * 記事タイトル・本文（HTML）を、指定した1言語だけに翻訳する。
 * 言語ごとに独立した1回のAPI呼び出しにすることで、（1）出力トークン上限に
 * 対象言語数が影響しない、（2）1言語の失敗が他言語に波及しない、（3）失敗した
 * 言語だけを再試行できる、という3つを同時に満たす（呼び出し側 = translate-article
 * route.ts が、未翻訳の言語ごとにこの関数を呼ぶ）。
 */
export const translateArticleLang = async (
  { title, contentHtml }: TranslationInput,
  targetLang: TranslationSuffix,
): Promise<LangTranslation> => {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required');
  }

  const lang = getLanguageByTranslationField(targetLang);

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
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
    throw new Error(`Anthropic API request failed for ${targetLang} (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const toolUseBlock = (data.content as Array<Record<string, unknown>>)?.find(
    (block) => block.type === 'tool_use' && block.name === TRANSLATION_TOOL_NAME,
  );

  if (!toolUseBlock) {
    throw new Error(`Anthropic API response for ${targetLang} did not include the expected tool_use block`);
  }

  const result = toolUseBlock.input as Partial<LangTranslation>;
  if (!result.title || !result.content) {
    throw new Error(`Anthropic API response is missing title/content for ${targetLang}`);
  }

  return { title: result.title, content: result.content };
};
