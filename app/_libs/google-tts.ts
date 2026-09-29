import 'server-only';
import crypto from 'node:crypto';
import { type Lang, SUPPORTED_LANGS } from './lang-registry';
import { VOICE_BY_LANG } from './tts-voices.server';

// Google Cloud Text-to-Speech を「サービスアカウントJSON → 自前でJWT署名 →
// OAuth2 アクセストークン交換 → REST 呼び出し」の最小構成で使う。
// 追加の npm 依存（google-auth-library / @google-cloud/text-to-speech）は入れない。

const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';
// Gemini TTS（Preview）専用。voice.modelName / input.prompt は v1 では
// 「Unknown name」で 400 になるため、Gemini TTS を使う言語（ne 等）だけ v1beta1 を使う。
const TTS_ENDPOINT_GEMINI = 'https://texttospeech.googleapis.com/v1beta1/text:synthesize';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

let credentialsCache: ServiceAccount | null = null;

const loadCredentials = (): ServiceAccount => {
  if (credentialsCache) {
    return credentialsCache;
  }
  const rawEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!rawEnv || !rawEnv.trim()) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON is not set');
  }

  let raw = rawEnv.trim();
  // 管理画面（Vercel 等）で .env の値をクォートごと貼り付けてしまったケースを救済する。
  // 例: '{"type":...}' や "{"type":...}" → 外側のクォートを外す
  if (raw.length > 1 && (raw[0] === "'" || raw[0] === '"') && raw[raw.length - 1] === raw[0]) {
    const inner = raw.slice(1, -1).trim();
    if (inner.startsWith('{')) {
      raw = inner;
    }
  }

  let parsed: ServiceAccount;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON');
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON is missing client_email / private_key');
  }
  // 環境変数経由で \n がエスケープされたまま渡ってくるケースに備えて復元する
  parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  credentialsCache = parsed;
  return parsed;
};

let tokenCache: { token: string; exp: number } | null = null;

const base64url = (value: object): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

const getAccessToken = async (): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  // 期限の60秒前までは使い回す（チャンク分割で1リクエストにつき複数回叩くため）
  if (tokenCache && tokenCache.exp - 60 > now) {
    return tokenCache.token;
  }

  const { client_email, private_key, token_uri } = loadCredentials();
  const aud = token_uri || TOKEN_URI;

  const unsigned = `${base64url({ alg: 'RS256', typ: 'JWT' })}.${base64url({
    iss: client_email,
    scope: SCOPE,
    aud,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsigned)
    .sign(private_key)
    .toString('base64url');
  const assertion = `${unsigned}.${signature}`;

  const res = await fetch(aud, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: data.access_token, exp: now + (data.expires_in || 3600) };
  return data.access_token;
};

export type TtsGender = 'FEMALE' | 'MALE' | 'NEUTRAL';

// 表示言語ごとの自然な女性ボイス（言語コード + 音声名）は VOICE_BY_LANG
// （app/_libs/tts-voices.server.ts、server-only）に集約されている。

const isLang = (value: string | undefined): value is Lang =>
  !!value && (SUPPORTED_LANGS as string[]).includes(value);

/**
 * リクエストパラメータからボイスを決定する。
 * 優先順位:
 *  1. voiceName が明示されていればそれを使う（languageCode も必須）
 *  2. lang（ja / en / ko / zh / de / fr / es / ru）から上記マップで自動選択
 *  3. languageCode のみ指定 → 名前なし（Google 側が gender で自動選択）
 */
export const resolveVoice = (opts: {
  lang?: string;
  languageCode?: string;
  voiceName?: string;
}): { languageCode: string; name?: string; geminiModelName?: string; geminiPrompt?: string } => {
  if (opts.voiceName) {
    return {
      languageCode:
        opts.languageCode || VOICE_BY_LANG[isLang(opts.lang) ? opts.lang : 'ja'].languageCode,
      name: opts.voiceName,
    };
  }
  if (isLang(opts.lang)) {
    return VOICE_BY_LANG[opts.lang];
  }
  if (opts.languageCode) {
    return { languageCode: opts.languageCode };
  }
  return VOICE_BY_LANG.ja;
};

/**
 * テキストを合成して MP3 バイナリ（Buffer）を返す。
 *
 * geminiModelName が指定された言語（現状 ne のみ。VOICE_BY_LANG 参照）は、
 * 通常の Standard/Neural2/WaveNet とはリクエスト形式が異なる Gemini TTS（Preview）で
 * 合成する: v1beta1 エンドポイント・voice.modelName・input.prompt（自然な発話指示、
 * 英語）を使う。v1 エンドポイントに modelName や input.prompt を送ると
 * 「Unknown name」で 400 になるため、この分岐でエンドポイント自体を切り替える。
 * 他の言語には一切影響しない。
 */
export const synthesizeSpeech = async (params: {
  text: string;
  languageCode: string;
  voiceName?: string;
  gender?: TtsGender;
  speakingRate?: number;
  geminiModelName?: string;
  geminiPrompt?: string;
}): Promise<Buffer> => {
  const token = await getAccessToken();

  const endpoint = params.geminiModelName ? TTS_ENDPOINT_GEMINI : TTS_ENDPOINT;
  const body = params.geminiModelName
    ? {
        input: { text: params.text, ...(params.geminiPrompt ? { prompt: params.geminiPrompt } : {}) },
        voice: {
          languageCode: params.languageCode,
          ...(params.voiceName ? { name: params.voiceName } : {}),
          modelName: params.geminiModelName,
        },
        audioConfig: { audioEncoding: 'MP3' },
      }
    : {
        input: { text: params.text },
        voice: {
          languageCode: params.languageCode,
          ...(params.voiceName ? { name: params.voiceName } : {}),
          ...(params.gender ? { ssmlGender: params.gender } : {}),
        },
        audioConfig: {
          audioEncoding: 'MP3',
          ...(params.speakingRate ? { speakingRate: params.speakingRate } : {}),
        },
      };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Google TTS request failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { audioContent?: string };
  if (!data.audioContent) {
    throw new Error('Google TTS response did not include audioContent');
  }
  return Buffer.from(data.audioContent, 'base64');
};
