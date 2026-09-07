import { NextRequest, NextResponse } from 'next/server';
import { resolveVoice, synthesizeSpeech, type TtsGender } from '@/app/_libs/google-tts';

// node:crypto で JWT 署名するため Node ランタイム固定
export const runtime = 'nodejs';

// 1リクエストあたりの文字数上限。Google TTS の実上限は 5000 バイトだが、
// クライアント側で十分小さくチャンク分割して送る前提で、単純な文字数チェックにする。
const MAX_CHARS = 5000;

const GENDERS: TtsGender[] = ['FEMALE', 'MALE', 'NEUTRAL'];

export async function POST(request: NextRequest) {
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
      { status: 413 },
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
