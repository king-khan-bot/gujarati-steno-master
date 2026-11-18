
const MODEL = "gemini-3.8-flash";
const allowedExams = ["GSSSB", "GPSC", "GCC", "HIGH COURT"];

export async function onRequestPost({ request, env }) {
  try {
    if (!env.GEMINI_API_KEY) return json({error:"Cloudflare માં GEMINI_API_KEY secret સેટ કરો."},500);
    const body = await request.json();
    const exam = String(body.exam || "");
    const minutes = Number(body.minutes);
    const wpm = Number(body.wpm);
    if (!allowedExams.includes(exam) || ![2,4,5].includes(minutes) || ![60,80,90,110].includes(wpm))
      return json({error:"પસંદગી માન્ય નથી."},400);

    const targetWords = minutes * wpm;
    const examGuidance = exam === "HIGH COURT"
      ? "ગુજરાત હાઈકોર્ટ અને ન્યાયિક વહીવટને અનુરૂપ કાનૂની વિષયો: ચુકાદાઓના સામાન્ય સિદ્ધાંતો, બંધારણીય જોગવાઈઓ, ન્યાયિક પ્રક્રિયા, નાગરિક અધિકારો અને કોર્ટ વહીવટ. કોઈ બનાવટી કેસ નંબર, બનાવટી ચુકાદો અથવા ખોટો કાનૂની ઉદ્ધરણ ન આપવો."
      : ({
        GSSSB:"ગુજરાત રાજ્યની વિવિધ સરકારી ભરતી પરીક્ષાઓને અનુરૂપ સામાન્ય જ્ઞાન, વહીવટ, પંચાયતી રાજ, નાગરિક સેવાઓ અને સામાજિક વિષયો.",
        GPSC:"GPSC સ્તરને અનુરૂપ ગુજરાતનો ઇતિહાસ, ભૂગોળ, બંધારણ, જાહેર વહીવટ, અર્થતંત્ર, વિજ્ઞાન અને સમકાલીન જાહેર મુદ્દાઓ.",
        GCC:"GCC ગુજરાતી કમ્પ્યુટર/ટાઇપિંગ-સ્ટેનોગ્રાફી અભ્યાસને અનુરૂપ સરકારી કચેરી, વહીવટી પત્રવ્યવહાર, જાહેર સેવા અને સામાન્ય જ્ઞાન."
      })[exam];

    const prompt = `તમે ગુજરાતી ભાષાના અનુભવી પરીક્ષા-પ્રશ્નલેખક અને ભાષા સંપાદક છો.
પસંદ કરેલી પરીક્ષા: ${exam}
વિષય માર્ગદર્શન: ${examGuidance}
સમય: ${minutes} મિનિટ. ઝડપ: ${wpm} શબ્દ પ્રતિ મિનિટ. લક્ષ્ય આશરે ${targetWords} ગુજરાતી શબ્દો.
એક જ સતત, સ્વાભાવિક અને પરીક્ષા-ઉપયોગી ગુજરાતી ગદ્ય ફકરો લખો. વ્યાકરણ, જોડણી, વાક્યરચના અને વિરામચિહ્નો શુદ્ધ હોવા જોઈએ. ગુજરાતી લિપિ વાપરો. અપ્રમાણિત આંકડા, ખોટા કાયદાકીય દાવા અથવા બનાવટી ચુકાદા ન લખો. શબ્દ સંખ્યા લક્ષ્યની નજીક રાખો.
આ જ ફકરામાંથી 30 સરળ, 30 મધ્યમ અને 30 અઘરા ગુજરાતી શબ્દો પસંદ કરો. દરેક માટે ટૂંકો સરળ ગુજરાતી અર્થ આપો. પુનરાવર્તન ટાળો.
માત્ર નીચેના JSON સ્વરૂપમાં જવાબ આપો:
{"passage":"...","vocabulary":{"easy":[{"word":"...","meaning":"..."}],"medium":[{"word":"...","meaning":"..."}],"hard":[{"word":"...","meaning":"..."}]}}
દરેક યાદીમાં બરાબર 30 વસ્તુઓ હોવી જોઈએ.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,{
      method:"POST",
      headers:{"Content-Type":"application/json","x-goog-api-key":env.GEMINI_API_KEY},
      body:JSON.stringify({
        contents:[{role:"user",parts:[{text:prompt}]}],
        generationConfig:{responseMimeType:"application/json",temperature:0.65}
      })
    });
    const result = await response.json();
    if(!response.ok) return json({error:result.error?.message || "Gemini API error"},response.status);
    const raw=result.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("");
    if(!raw) return json({error:"Gemini તરફથી ખાલી જવાબ મળ્યો."},502);
    const parsed=JSON.parse(raw);
    if(!parsed.passage || !parsed.vocabulary) return json({error:"AI response format યોગ્ય નથી. ફરી પ્રયાસ કરો."},502);
    for(const level of ["easy","medium","hard"]){
      parsed.vocabulary[level]=(parsed.vocabulary[level]||[]).slice(0,30);
    }
    return json(parsed);
  } catch(e) {
    return json({error:e.message || "Server error"},500);
  }
}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}})}
