const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-5';
// 1回の応答で英語・韓国語のタイトル＋本文HTML（計4フィールド）を返すため多めに確保する
const DEFAULT_MAX_TOKENS = 16384;

type TranslationInput = {
  title: string;
  contentHtml: string;
};

export type TranslationResult = {
  title_en: string;
  content_en: string;
  title_ko: string;
  content_ko: string;
};

const TRANSLATION_TOOL_NAME = 'submit_translation';

const SYSTEM_PROMPT = `あなたはIT/AI業界のコーポレートサイト記事を、日本語から英語と韓国語に翻訳するプロフェッショナル翻訳者です。
以下のルールを厳守してください。

- 英語は自然で専門的なビジネス英語に、韓国語は自然で丁寧なビジネス韓国語（하십시오体/합니다体ベース）に翻訳すること。
- IT/AI関連の専門用語、製品名、固有名詞、サービス名は無理に訳さず、原語（一般的に使われる表記）のまま残すこと。
- content_en / content_ko の入力はHTML文字列です。タグ構造・属性は一切変更せず、タグの中のテキストのみを翻訳すること。タグを追加/削除/並べ替えしないこと。
- 出力は必ず submit_translation ツールを呼び出して構造化データとして返すこと。英語(title_en/content_en)と韓国語(title_ko/content_ko)の4フィールドすべてを埋めること。`;

export const translateArticle = async ({
  title,
  contentHtml,
}: TranslationInput): Promise<TranslationResult> => {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required');
  }

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
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            '以下の記事タイトルと本文（HTML）を、英語と韓国語の両方に翻訳してください。',
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
          description: '翻訳結果（英語・韓国語のタイトルと本文HTML）を送信する',
          input_schema: {
            type: 'object',
            properties: {
              title_en: {
                type: 'string',
                description: '英訳された記事タイトル',
              },
              content_en: {
                type: 'string',
                description: '入力と同じHTMLタグ構造を保ったまま、テキスト部分のみ英訳した本文',
              },
              title_ko: {
                type: 'string',
                description: '韓国語訳された記事タイトル',
              },
              content_ko: {
                type: 'string',
                description: '入力と同じHTMLタグ構造を保ったまま、テキスト部分のみ韓国語訳した本文',
              },
            },
            required: ['title_en', 'content_en', 'title_ko', 'content_ko'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: TRANSLATION_TOOL_NAME },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API request failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const toolUseBlock = (data.content as Array<Record<string, unknown>>)?.find(
    (block) => block.type === 'tool_use' && block.name === TRANSLATION_TOOL_NAME,
  );

  if (!toolUseBlock) {
    throw new Error('Anthropic API response did not include the expected tool_use block');
  }

  const result = toolUseBlock.input as Partial<TranslationResult>;

  if (!result.title_en || !result.content_en || !result.title_ko || !result.content_ko) {
    throw new Error('Anthropic API response is missing one of title/content for en or ko');
  }

  return {
    title_en: result.title_en,
    content_en: result.content_en,
    title_ko: result.title_ko,
    content_ko: result.content_ko,
  };
};
