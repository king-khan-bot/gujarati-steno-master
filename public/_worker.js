const TEXT_MODEL = "gemini-3.8-flash";
const TEXT_BACKUP_MODEL = "gemini-3.5-flash-lite";
const TTS_MODEL = "gemini-3.8-flash-tts";
const ALLOWED_EXAMS = ["GSSSB", "GPSC", "GCC", "HIGH COURT"];
const ALLOWED_WPM = [60, 80, 90, 110];
const ALLOWED_MINUTES = [2, 4, 5];
const ALLOWED_VOICES = ["Kore", "Charon"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/test") {
      return new Response("Functions working!", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    if (url.pathname === "/api/generate") return handleGenerate(request, env);
    if (url.pathname === "/api/audio") return handleAudio(request, env);
    return env.ASSETS.fetch(request);
  }
};

async function handleGenerate(request, env) {
  if (request.method !== "POST") return json({ error: "POST method જરૂરી છે." }, 405);
  if (!env.GEMINI_API_KEY) return json({ error: "Cloudflare Secret GEMINI_API_KEY સેટ નથી." }, 500);
  try {
    const body = await request.json();
    const exam = String(body.exam || "");
    const minutes = Number(body.minutes);
    const wpm = Number(body.wpm);
    if (!ALLOWED_EXAMS.includes(exam) || !ALLOWED_MINUTES.includes(minutes) || !ALLOWED_WPM.includes(wpm)) {
      return json({ error: "પરીક્ષા, સમય અથવા ઝડપની પસંદગી માન્ય નથી." }, 400);
    }
    const targetWords = minutes * wpm;
    const guidance = exam === "HIGH COURT"
      ? "ગુજરાત હાઈકોર્ટ અને ન્યાયિક વહીવટને અનુરૂપ સામાન્ય કાનૂની વિષયો, બંધારણીય જોગવાઈઓ, ન્યાયિક પ્રક્રિયા, નાગરિક અધિકારો અને કોર્ટ વહીવટ. બનાવટી કેસ નંબર, ચુકાદા અથવા કાનૂની ઉદ્ધરણ ન આપો."
      : {
          GSSSB: "ગુજરાત રાજ્યની સરકારી ભરતી પરીક્ષાને અનુરૂપ સામાન્ય જ્ઞાન, વહીવટ, પંચાયતી રાજ, નાગરિક સેવાઓ અને સામાજિક વિષયો.",
          GPSC: "GPSC સ્તરને અનુરૂપ ગુજરાતનો ઇતિહાસ, ભૂગોળ, બંધારણ, જાહેર વહીવટ, અર્થતંત્ર, વિજ્ઞાન અને જાહેર મુદ્દાઓ.",
          GCC: "ગુજરાતી કચેરીય વહીવટ, સરકારી પત્રવ્યવહાર, જાહેર સેવા અને સામાન્ય જ્ઞાનને અનુરૂપ વિષયો."
        }[exam];
    const prompt = `તમે ગુજરાતી ભાષાના અનુભવી પરીક્ષા-પ્રશ્નલેખક અને ભાષા સંપાદક છો.
પરીક્ષા: ${exam}
વિષય માર્ગદર્શન: ${guidance}
સમય: ${minutes} મિનિટ. ઝડપ: ${wpm} શબ્દ પ્રતિ મિનિટ. લક્ષ્ય આશરે ${targetWords} શબ્દો.
એક સતત, સ્વાભાવિક અને પરીક્ષા-ઉપયોગી ગુજરાતી ગદ્ય ફકરો લખો. શુદ્ધ ગુજરાતી જોડણી, વ્યાકરણ અને વિરામચિહ્નો વાપરો. શબ્દસંખ્યા લક્ષ્યની નજીક રાખો.
ફકરામાંથી બરાબર 30 સરળ, 30 મધ્યમ અને 30 અઘરા શબ્દો પસંદ કરો. દરેક શબ્દનો ટૂંકો સરળ ગુજરાતી અર્થ આપો. ત્રણ યાદીઓમાં પુનરાવર્તિત શબ્દ ન હોવો જોઈએ. શબ્દો ફકરામાંથી જ લેવા.
માત્ર માન્ય JSON આપો, Markdown નહીં:
{"passage":"...","vocabulary":{"easy":[{"word":"...","meaning":"..."}],"medium":[{"word":"...","meaning":"..."}],"hard":[{"word":"...","meaning":"..."}]}}
દરેક યાદીમાં બરાબર 30 entries હોવી જરૂરી છે.`;

    const requestBody = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.55, maxOutputTokens: 12000 }
    };
    // Primary model first; use the lighter backup when the primary is overloaded.
    let apiRes = await fetchTextModel(TEXT_MODEL, requestBody, env.GEMINI_API_KEY);
    let usedModel = TEXT_MODEL;
    if ([429, 500, 502, 503, 504].includes(apiRes.status)) {
      apiRes = await fetchTextModel(TEXT_BACKUP_MODEL, requestBody, env.GEMINI_API_KEY);
      usedModel = TEXT_BACKUP_MODEL;
    }
    const result = await safeJson(apiRes);
    if (!apiRes.ok) return json({ error: result?.error?.message || `Gemini text API error (HTTP ${apiRes.status}).`, model: usedModel }, apiRes.status);
    const raw = result?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("").trim();
    if (!raw) return json({ error: "Gemini તરફથી ખાલી જવાબ મળ્યો. ફરી પ્રયાસ કરો." }, 502);
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { return json({ error: "Gemini એ યોગ્ય JSON આપ્યું નથી. ફરી Generate કરો." }, 502); }
    if (typeof parsed.passage !== "string" || !parsed.passage.trim() || !parsed.vocabulary) {
      return json({ error: "AI response માં passage અથવા vocabulary ગાયબ છે." }, 502);
    }
    for (const level of ["easy", "medium", "hard"]) {
      if (!Array.isArray(parsed.vocabulary[level]) || parsed.vocabulary[level].length < 30) {
        return json({ error: `AI એ ${level} vocabulary માં 30 શબ્દ આપ્યા નથી. ફરી Generate કરો.` }, 502);
      }
      parsed.vocabulary[level] = parsed.vocabulary[level].slice(0, 30);
    }
    return json({ passage: parsed.passage, vocabulary: parsed.vocabulary });
  } catch (error) {
    return json({ error: error?.message || "Generate server error." }, 500);
  }
}

async function handleAudio(request, env) {
  if (request.method !== "POST") return json({ error: "POST method જરૂરી છે." }, 405);
  if (!env.GEMINI_API_KEY) return json({ error: "Cloudflare Secret GEMINI_API_KEY સેટ નથી." }, 500);
  try {
    const body = await request.json();
    const text = body.text;
    const voice = String(body.voice || "");
    const wpm = Number(body.wpm);
    if (typeof text !== "string" || !text.trim() || text.length > 14000) return json({ error: "Audio text ખાલી છે અથવા ખૂબ લાંબો છે." }, 400);
    if (!ALLOWED_VOICES.includes(voice)) return json({ error: "Voice પસંદગી માન્ય નથી." }, 400);
    if (!ALLOWED_WPM.includes(wpm)) return json({ error: "WPM પસંદગી માન્ય નથી." }, 400);
    const style = `Speak in clear, natural standard Gujarati (India), suitable for stenography dictation. Read the supplied Gujarati text verbatim. Use crisp pronunciation, steady neutral delivery, and brief natural pauses at punctuation. Target approximately ${wpm} words per minute. Do not translate, summarize, or add words.`;
    const apiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text, speechMetadata: { style } }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
        }
      })
    });
    const result = await safeJson(apiRes);
    if (!apiRes.ok) return json({ error: result?.error?.message || `Gemini TTS API error (HTTP ${apiRes.status}).` }, apiRes.status);
    const part = result?.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
    if (!part?.inlineData?.data) {
      const finish = result?.candidates?.[0]?.finishReason;
      return json({ error: `Gemini એ audio આપ્યો નથી${finish ? ` (finishReason: ${finish})` : ""}. ફરી પ્રયાસ કરો.` }, 502);
    }
    const inline = part.inlineData;
    const bytes = Uint8Array.from(atob(inline.data), c => c.charCodeAt(0));
    const mime = String(inline.mimeType || "").toLowerCase();
    let wavBytes = bytes;
    if (!mime.includes("wav") && !hasWavHeader(bytes)) wavBytes = pcmToWav(bytes, 24000, 1, 16);
    return new Response(wavBytes, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Disposition": 'attachment; filename="gujarati-dictation.wav"',
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return json({ error: error?.message || "Audio server error." }, 500);
  }
}

async function fetchTextModel(model, requestBody, apiKey) {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(requestBody)
  });
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { error: text.slice(0, 500) }; }
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
  });
}
function hasWavHeader(bytes) {
  return bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WAVE";
}
function pcmToWav(pcm, sampleRate, channels, bitsPerSample) {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const write = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  const dataSize = pcm.length;
  write(0, "RIFF"); view.setUint32(4, 36 + dataSize, true); write(8, "WAVE"); write(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  const blockAlign = channels * bitsPerSample / 8;
  view.setUint32(28, sampleRate * blockAlign, true); view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true); write(36, "data"); view.setUint32(40, dataSize, true);
  const output = new Uint8Array(44 + dataSize); output.set(new Uint8Array(header), 0); output.set(pcm, 44);
  return output;
}
