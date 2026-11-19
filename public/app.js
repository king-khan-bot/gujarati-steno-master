const $ = (id) => document.getElementById(id);
let currentPassage = "";
let currentAudioBlob = null;
let generatedWpm = 80;

function wordCount(text){return (text.trim().match(/\S+/g)||[]).length}
function setStatus(msg){$("status").textContent=msg}
function fillList(id, items){
  const list=$(id); list.innerHTML="";
  (items||[]).slice(0,30).forEach(item=>{
    const li=document.createElement("li");
    if(typeof item==="string") li.textContent=item;
    else li.textContent = `${item.word || ""}${item.meaning ? " — "+item.meaning : ""}`;
    list.appendChild(li);
  });
}
function showPassage(data){
  currentPassage=data.passage||"";
  $("passage").textContent=currentPassage;
  $("resultTitle").textContent=`${$("exam").value} · ${$("minutes").value} MIN · ${$("wpm").value} WPM`;
  $("wordCount").textContent=wordCount(currentPassage);
  $("charCount").textContent=[...currentPassage].length;
  $("targetCount").textContent=Number($("minutes").value)*Number($("wpm").value);
  
  $("result").classList.remove("hidden");
  $("audioControls").classList.add("hidden");
  $("audio").removeAttribute("src");
  currentAudioBlob=null;
}
async function generate(){
  const payload = {
    exam: $("exam").value,
    minutes: Number($("minutes").value),
    wpm: Number($("wpm").value)
  };

  $("generate").disabled = true;
  $("generate").textContent = "Generating…";
  setStatus("Gemini AI ગુજરાતી ફકરો તૈયાર કરી રહ્યું છે…");

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload)
    });

    const raw = await res.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error("Server નો જવાબ યોગ્ય નથી.");
    }

    if (!res.ok) {
      throw new Error(data.error || `Error HTTP ${res.status}`);
    }
if (!data.passage) {
  throw new Error("Passage મળ્યો નથી.");
}

showPassage(data);

setStatus("ગુજરાતી ફકરો તૈયાર થયો. હવે શબ્દભંડોળ તૈયાર થઈ રહ્યું છે...");

const vocabRes = await fetch("/api/vocabulary", {
  method: "POST",
  headers: {"Content-Type": "application/json"},
  body: JSON.stringify({passage: currentPassage})
});

const vocabRaw = await vocabRes.text();
let vocabData = {};

try {
  vocabData = vocabRaw ? JSON.parse(vocabRaw) : {};
} catch {
  throw new Error("શબ્દભંડોળનો જવાબ યોગ્ય નથી.");
}

if (!vocabRes.ok) {
  throw new Error(vocabData.error || "શબ્દભંડોળ તૈયાર થઈ શક્યું નથી.");
}

fillList("easy", vocabData.vocabulary?.easy);
fillList("medium", vocabData.vocabulary?.medium);
fillList("hard", vocabData.vocabulary?.hard);

setStatus("તમારો નવો Dictation Passage અને શબ્દભંડોળ તૈયાર છે.");
$("result").scrollIntoView({behavior:"smooth", block:"start"});

} catch(err) {
  setStatus(err.message);
} finally {
  $("generate").disabled = false;
  $("generate").textContent = "✦ Generate Gujarati Dictation";
}
}
async function audioAtSelectedSpeed(){
  if(!currentAudioBlob) return;
  const rate=Number($("audioSpeed").value);
  if(Math.abs(rate-1)<0.001){
    $("downloadAudio").href=URL.createObjectURL(currentAudioBlob);
    return;
  }
  setStatus("પસંદ કરેલી ઝડપ માટે WAV તૈયાર થઈ રહ્યું છે…");
  const AudioCtx=window.AudioContext||window.webkitAudioContext;
  const ctx=new AudioCtx();
  const bytes=await currentAudioBlob.arrayBuffer();
  const decoded=await ctx.decodeAudioData(bytes);
  const length=Math.ceil(decoded.length/rate);
  const offline=new OfflineAudioContext(decoded.numberOfChannels,length,decoded.sampleRate);
  const source=offline.createBufferSource();
  source.buffer=decoded; source.playbackRate.value=rate; source.connect(offline.destination); source.start(0);
  const rendered=await offline.startRendering();
  const wav=audioBufferToWav(rendered);
  const blob=new Blob([wav],{type:"audio/wav"});
  $("downloadAudio").href=URL.createObjectURL(blob);
  await ctx.close();
  setStatus("પસંદ કરેલી ઝડપનું WAV download માટે તૈયાર છે.");
}
function audioBufferToWav(buffer){
  const channels=buffer.numberOfChannels, rate=buffer.sampleRate, frames=buffer.length;
  const bytesPerSample=2, dataSize=frames*channels*bytesPerSample;
  const out=new ArrayBuffer(44+dataSize), view=new DataView(out);
  const write=(offset,str)=>{for(let i=0;i<str.length;i++)view.setUint8(offset+i,str.charCodeAt(i));};
  write(0,"RIFF");view.setUint32(4,36+dataSize,true);write(8,"WAVE");write(12,"fmt ");
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);
  view.setUint32(24,rate,true);view.setUint32(28,rate*channels*bytesPerSample,true);
  view.setUint16(32,channels*bytesPerSample,true);view.setUint16(34,16,true);write(36,"data");view.setUint32(40,dataSize,true);
  let pos=44;
  for(let i=0;i<frames;i++) for(let c=0;c<channels;c++){
    let sample=Math.max(-1,Math.min(1,buffer.getChannelData(c)[i]));
    view.setInt16(pos,sample<0?sample*0x8000:sample*0x7fff,true);pos+=2;
  }
  return out;
}
$("downloadAudio").addEventListener("click",async e=>{
  const rate=Number($("audioSpeed").value);
  if(Math.abs(rate-1)<0.001) return;
  e.preventDefault();
  try{await audioAtSelectedSpeed();const link=$("downloadAudio");link.click();}
  catch(err){setStatus("Speed-adjusted WAV બનાવી શકાઈ નથી: "+err.message);}
});
$("copy").addEventListener("click",async()=>{
  try{await navigator.clipboard.writeText(currentPassage);setStatus("Passage copied.");}
  catch{setStatus("Copy માટે browser permission જરૂરી છે.");}
});
$("generate").addEventListener("click", generate);
$("newPassage").addEventListener("click", generate);
$("makeAudio").addEventListener("click", makeAudio);
