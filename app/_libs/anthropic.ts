const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-5';
const DEFAULT_MAX_TOKENS = 8192;

type TranslationInput = {
  title: string;
  contentHtml: string;
};

type TranslationResult = {
  title_en: string;
  content_en: string;
};

const TRANSLATION_TOOL_NAME = 'submit_translation';

const SYSTEM_PROMPT = `あなたはIT/AI業界のコーポレートサイト記事を日本語から英語に翻訳するプロフェッショナル翻訳者です。
以下のルールを厳守してください。

- 自然で専門的なビジネス英語に翻訳すること。
- IT/AI関連の専門用語、製品名、固有名詞、サービス名は無理に英訳せず、原語（英語表記や一般的に使われる表記）のまま残すこと。
- content_en の入力はHTML文字列です。タグ構造・属性は一切変更せず、タグの中のテキストのみを翻訳すること。タグを追加/削除/並べ替えしないこと。
- 出力は必ず submit_translation ツールを呼び出して構造化データとして返すこと。`;

export const translateArticleToEnglish = async ({
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
            '以下の記事タイトルと本文（HTML）を英語に翻訳してください。',
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
          description: '翻訳結果のタイトルと本文HTMLを送信する',
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
            },
            required: ['title_en', 'content_en'],
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

  if (!result.title_en || !result.content_en) {
    throw new Error('Anthropic API response is missing title_en or content_en');
  }

  return { title_en: result.title_en, content_en: result.content_en };
};
