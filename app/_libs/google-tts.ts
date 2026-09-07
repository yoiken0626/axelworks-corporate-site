import crypto from 'node:crypto';

// Google Cloud Text-to-Speech を「サービスアカウントJSON → 自前でJWT署名 →
// OAuth2 アクセストークン交換 → REST 呼び出し」の最小構成で使う。
// 追加の npm 依存（google-auth-library / @google-cloud/text-to-speech）は入れない。

const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const TTS_ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';
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
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON is not set');
  }

  let parsed: ServiceAccount;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON');
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(
      'GOOGLE_APPLICATION_CREDENTIALS_JSON is missing client_email / private_key',
    );
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

// 日本語・英語・韓国語それぞれの自然な女性ボイス。
// いずれも Neural2（WaveNet 後継の高品質ニューラル音声）。
//  - ja-JP-Neural2-B … 落ち着いた女性。ニュース読み上げに向く
//  - en-US-Neural2-F … 明瞭で自然な女性
//  - ko-KR-Neural2-A … 標準的で聞き取りやすい女性
const VOICE_BY_LANG: Record<'ja' | 'en' | 'ko', { languageCode: string; name: string }> = {
  ja: { languageCode: 'ja-JP', name: 'ja-JP-Neural2-B' },
  en: { languageCode: 'en-US', name: 'en-US-Neural2-F' },
  ko: { languageCode: 'ko-KR', name: 'ko-KR-Neural2-A' },
};

const isLang = (value: string | undefined): value is 'ja' | 'en' | 'ko' =>
  value === 'ja' || value === 'en' || value === 'ko';

/**
 * リクエストパラメータからボイスを決定する。
 * 優先順位:
 *  1. voiceName が明示されていればそれを使う（languageCode も必須）
 *  2. lang（ja / en / ko）から上記マップで自動選択
 *  3. languageCode のみ指定 → 名前なし（Google 側が gender で自動選択）
 */
export const resolveVoice = (opts: {
  lang?: string;
  languageCode?: string;
  voiceName?: string;
}): { languageCode: string; name?: string } => {
  if (opts.voiceName) {
    return {
      languageCode: opts.languageCode || VOICE_BY_LANG[isLang(opts.lang) ? opts.lang : 'ja'].languageCode,
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
 */
export const synthesizeSpeech = async (params: {
  text: string;
  languageCode: string;
  voiceName?: string;
  gender?: TtsGender;
  speakingRate?: number;
}): Promise<Buffer> => {
  const token = await getAccessToken();

  const res = await fetch(TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
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
    }),
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
