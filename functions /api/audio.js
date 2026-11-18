const TTS_MODEL = "gemini-3.8-flash-tts";
const voices = ["Kore","Charon"];

export async function onRequestPost({ request, env }) {
  try {
    if (!env.GEMINI_API_KEY) return json({error:"Cloudflare માં GEMINI_API_KEY secret સેટ કરો."},500);
    const {text,voice,wpm}=await request.json();
    if(typeof text!=="string" || !text.trim() || text.length>12000) return json({error:"Audio text ખાલી છે અથવા ખૂબ લાંબો છે."},400);
    if(!voices.includes(voice)) return json({error:"Voice selection માન્ય નથી."},400);
    if(![60,80,90,110].includes(Number(wpm))) return json({error:"WPM selection માન્ય નથી."},400);

    const style = `Speak in clear, natural standard Gujarati (India), as a professional stenography dictation instructor. Read the Gujarati text verbatim, with crisp pronunciation, steady neutral delivery, and short natural pauses at punctuation. Avoid dramatic emotion. Target a deliberate dictation pace suitable for approximately ${wpm} words per minute. Do not translate or add words.`;
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${TTS_MODEL}:generateContent`,{
      method:"POST",
      headers:{"Content-Type":"application/json","x-goog-api-key":env.GEMINI_API_KEY},
      body:JSON.stringify({
        contents:[{role:"user",parts:[{text:text,speech_metadata:{style}}]}],
        generationConfig:{responseModalities:["AUDIO"],speechConfig:{voiceConfig:{voice}}}
      })
    });
    const data=await response.json();
    if(!response.ok) return json({error:data.error?.message || "Gemini TTS error"},response.status);
    const audio=data.candidates?.[0]?.content?.parts?.find(p=>p.inlineData?.data)?.inlineData;
    if(!audio?.data) return json({error:"Gemini TTS એ audio પરત આપ્યો નથી."},502);
    const bytes=Uint8Array.from(atob(audio.data),c=>c.charCodeAt(0));
    return new Response(bytes,{headers:{"Content-Type":audio.mimeType||"audio/wav","Content-Disposition":'attachment; filename="gujarati-dictation.wav"',"Cache-Control":"no-store"}});
  } catch(e) {
    return json({error:e.message || "Audio server error"},500);
  }
}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}})}