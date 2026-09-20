import { NextRequest, NextResponse } from 'next/server';
import { resolveVoice, synthesizeSpeech, type TtsGender } from '@/app/_libs/google-tts';

// node:crypto で JWT 署名するため Node ランタイム固定
export const runtime = 'nodejs';

// 1リクエストあたりの文字数上限。
// クライアント側（useReadAloud.ts の CHUNK_BYTES=1400）は 1 チャンクを最大 1400 バイトに
// 収めて送ってくる。実際に現行の全ページ（トップ・記事一覧・記事8本、日/英）で計測した
// 最大チャンク長は 1303 文字（英語, dnt_zkefdj-z）で、1400 バイトの上限にほぼ張り付く
// （多バイト言語ではこれより短くなる）。2000 なら現状の最大値に対して十分な余裕を持ちつつ、
// 従来の 5000 よりは大幅に絞れる。
const MAX_CHARS = 2000;

const GENDERS: TtsGender[] = ['FEMALE', 'MALE', 'NEUTRAL'];

// 自サイトのホスト名（本番 + 開発用の localhost）。Vercel のプレビュー環境
// （*.vercel.app）は、他の Vercel プロジェクトとドメインを共有するため意図的に
// 許可しない（Origin を偽装されると区別できない）。
// スキームは見ない（app/_libs/utils.ts の SITE_HOSTNAMES と同じ考え方）。
const ALLOWED_HOSTNAMES = new Set(['axel-works.com', 'www.axel-works.com', 'localhost', '127.0.0.1']);

// Origin ヘッダー（例: "https://axel-works.com"）・Referer（例:
// "https://axel-works.com/news/xxx"）のどちらも URL として解釈できるので、
// hostname だけを取り出して比較する。
const isAllowedOriginString = (value: string): boolean => {
  try {
    return ALLOWED_HOSTNAMES.has(new URL(value).hostname);
  } catch {
    return false;
  }
};

// 呼び出し元が自サイトかどうかの簡易チェック。
// - Origin ヘッダーがあれば、それが自サイトかどうかで判定する。
//   （同一オリジンの fetch/XHR でも、GET/HEAD 以外のメソッドには基本的に Origin が付く）
// - Origin が無いリクエストは、Sec-Fetch-Site: same-origin か、Referer が自サイトの
//   ときだけ通す。どちらも確認できなければ拒否する。
// 注意: ブラウザ以外（curl 等）から Origin/Referer を偽装されることは防げない。
// あくまで外部サイトからの無作為な呼び出しを減らすための対策であり、完全な認証ではない。
const isSameSiteRequest = (request: NextRequest): boolean => {
  const origin = request.headers.get('origin');
  if (origin) {
    return isAllowedOriginString(origin);
  }
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite === 'same-origin') {
    return true;
  }
  const referer = request.headers.get('referer');
  if (referer && isAllowedOriginString(referer)) {
    return true;
  }
  return false;
};

export async function POST(request: NextRequest) {
  if (!isSameSiteRequest(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text : '';
  if (!text.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return NextResponse.json(
      { error: `text is too long (${text.length} characters, max ${MAX_CHARS})` },
      { status: 400 },
    );
  }

  const lang = typeof body.lang === 'string' ? body.lang : undefined;
  const languageCode = typeof body.languageCode === 'string' ? body.languageCode : undefined;
  const voiceName = typeof body.voiceName === 'string' ? body.voiceName : undefined;
  const gender =
    typeof body.gender === 'string' && GENDERS.includes(body.gender as TtsGender)
      ? (body.gender as TtsGender)
      : undefined;
  const speakingRate =
    typeof body.speakingRate === 'number' &&
    body.speakingRate >= 0.25 &&
    body.speakingRate <= 4
      ? body.speakingRate
      : undefined;

  const voice = resolveVoice({ lang, languageCode, voiceName });

  try {
    const audio = await synthesizeSpeech({
      text,
      languageCode: voice.languageCode,
      voiceName: voice.name,
      // ボイス名を確定できている場合は gender 指定は無視される（矛盾を避けて渡さない）
      gender: voice.name ? undefined : gender,
      speakingRate,
    });

    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: {
        'content-type': 'audio/mpeg',
        'content-length': String(audio.length),
        'cache-control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[tts] synthesis failed', error);
    const message = error instanceof Error ? error.message : String(error);
    const notConfigured = /GOOGLE_APPLICATION_CREDENTIALS_JSON/.test(message);
    return NextResponse.json(
      // 設定不備はデプロイ時の診断用に理由もそのまま返す（秘匿情報は含まれない）
      { error: notConfigured ? 'TTS is not configured' : 'TTS synthesis failed', detail: notConfigured ? message : undefined },
      { status: notConfigured ? 503 : 502 },
    );
  }
}
