import Fastify from "fastify";
import cors from "@fastify/cors";
import "dotenv/config";
import crypto from "node:crypto";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {verifyTelegramInitData} from "./telegram.js";
import {db} from "./db.js";
import {adminAuthorized} from "./admin.js";

const app=Fastify({logger:true});
await app.register(cors,{origin:true});
const token=process.env.TELEGRAM_BOT_TOKEN;
const adminSecret=process.env.ADMIN_SECRET;
const adminChatId=process.env.ADMIN_CHAT_ID;
const botUsername=process.env.BOT_USERNAME??"";
const openAiApiKey=process.env.OPENAI_API_KEY??"";
const openAiModel=process.env.OPENAI_MODEL??"gpt-5.6-luna";

const catalog={
  esim:{
    sms:[
      {id:"sms_1",label:"Med SMS · 1 nummer",monthlyPrice:500},
      {id:"sms_2",label:"Med SMS · 2 numre",monthlyPrice:800},
      {id:"sms_3",label:"Med SMS · 3 numre",monthlyPrice:1100}
    ],
    voiceOnly:{status:"pricing_pending",minutePackages:[]},
    delivery:{standardFee:0,expressFee:null,channels:["telegram","email"]}
  },
  verification:{countries:[{code:"DK",dialCode:"+45",name:"Danmark"}],creditPackages:[3,10,25,50,100],creditExpiry:"never"}
};

function auth(req:any){
  if(!token)return null;
  const h=String(req.headers.authorization??"");
  const data=h.startsWith("tma ")?h.slice(4):"";
  return data?verifyTelegramInitData(data,token):null;
}
async function telegramSend(chatId:string,text:string){
  if(!token||!chatId)return false;
  const r=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chat_id:chatId,text,disable_web_page_preview:true})});
  return r.ok;
}
const AI_KNOWLEDGE=`
Du er DANSK eSIMs kundeservice-assistent. Svar på dansk, naturligt, kort og konkret. Du må ikke opfinde priser, leveringstider, betalingsadresser, provider-status, juridiske krav eller funktioner, som ikke står her. Hvis noget ikke er implementeret eller prisen ikke er fastlagt, sig det tydeligt.

DANSK eSIM:
- Telegram-first platform med eSIM, SMS-verifikation, credits, ordrestatus, support og referral.
- Fokus på dataminimering. Vi forsøger at undgå unødvendig persondata i eget flow.
- Provider-, Telegram-, betalings- og lovpligtige opbevaringskrav kan stadig gælde.
- Platformen er ikke selv en bookmaker eller betalingsudbyder.
eSIM:
- Med SMS: 1 nummer 500 kr./md., 2 numre 800 kr./md., 3 numre 1.100 kr./md.
- Første eSIM-køb har aktuelt 50% velkomstrabat i ordreflowet.
- Standard levering har 0 kr. gebyr. Express-gebyr er endnu ikke fastlagt.
- Levering kan vælges via Telegram eller email.
- Uden SMS/minutpakker er endnu ikke prissat og kan ikke bestilles endnu.
- Provider-aktivering er endnu provider-dependent.
VERIFIKATION:
- Appen henter services fra NumberOTP og viser servicekataloget dynamisk.
- Danmark (+45) er den aktive landmulighed. Sverige er planlagt/kommer senere.
- Credits udløber ikke i det nuværende setup.
- Kreditpakker: 3, 10, 25, 50 og 100 credits. Priser er endnu ikke fastlagt.
- Den fulde køb/nummer/SMS-providerintegration er ikke færdigimplementeret endnu; lov ikke brugeren en aktiveret SMS eller et nummer.
ORDRER/BETALING:
- Ordrer får et ordre-ID og starter som pending_payment.
- Betalingsflowet er aktuelt manuel/payment-review-baseret. Ingen automatisk kort/crypto-betaling må loves.
- Betalingsbevis/TXID-flow er UI/scaffold og skal ikke fremstilles som fuld automatisk betaling.
SUPPORT:
- Brugeren kan skrive agent/medarbejder/person for at få sagen sendt videre til support.
- Ordrestatus findes under Mine ordrer/Profil, når brugeren er logget ind i Telegram Mini App.
REFERRAL:
- Referral-link kræver Telegram-login og korrekt BOT_USERNAME-konfiguration.
- Hvis linket ikke er klar, skal du sige at det ikke er konfigureret endnu.
PWA:
- Appen kan installeres som webapp på kompatible enheder.
- Telegram Mini App fungerer bedst åbnet fra Telegram.
`;

function aiReply(q:string){
  const s=String(q||"").toLowerCase();
  if(/agent|medarbejder|person|menneske/i.test(s))return "Jeg sender din henvendelse videre til support. En medarbejder kan overtage samtalen her.";
  if(/pris|koster|500|800|1100/i.test(s)&&/esim|nummer|sms/i.test(s))return "eSIM med SMS koster aktuelt 500 kr./md. for 1 nummer, 800 kr./md. for 2 numre og 1.100 kr./md. for 3 numre.";
  if(/credit|credits|saldo/i.test(s))return "Vi har 3, 10, 25, 50 og 100 credits. Credits udløber ikke i det nuværende setup, men priserne er endnu ikke fastlagt.";
  if(/verif|sms|nummer.*modtag|kode/i.test(s))return "Du kan vælge en tjeneste i App Verifikation. Kataloget hentes dynamisk fra NumberOTP. Danmark (+45) er den aktive landmulighed lige nu.";
  if(/ordre|order|bestilling|status/i.test(s))return "Du kan se dine ordrer under Profil/Mine ordrer. Send gerne dit ordre-ID, hvis du vil have hjælp til en bestemt ordre.";
  if(/betaling|betale|txid|crypto|kort/i.test(s))return "Betalingsflowet er aktuelt manuelt/payment-review-baseret. Jeg vil ikke opfinde en betalingsadresse eller betalingsstatus.";
  if(/privacy|privat|persondata|data|slet/i.test(s))return "DANSK eSIM er bygget med dataminimering som princip. Provider-, Telegram-, betalings- og lovpligtige opbevaringskrav kan stadig gælde.";
  if(/referral|henvis|ven/i.test(s))return "Referral-funktionen kræver, at du er åbnet via Telegram, og at botens username er konfigureret.";
  return "Jeg kan hjælpe med eSIM, verifikation, credits, ordrestatus, betaling, privatliv, referral og support. Skriv dit konkrete spørgsmål, så prøver jeg at svare præcist.";
}
async function aiReplyWithOpenAI(q:string){
  if(!openAiApiKey)return aiReply(q);
  try{
    const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+openAiApiKey},body:JSON.stringify({model:openAiModel,input:[{role:"system",content:AI_KNOWLEDGE},{role:"user",content:String(q||"").slice(0,4000)}],max_output_tokens:350})});
    if(!r.ok)throw new Error("OpenAI request failed: "+r.status);
    const j=await r.json() as any;
    const text=j?.output_text??j?.output?.flatMap((x:any)=>x?.content??[]).map((x:any)=>x?.text??"").join("").trim();
    return text||aiReply(q);
  }catch(error){app.log.warn({error},"AI support fallback");return aiReply(q);}
}

app.get("/",async(_req,reply)=>{
  try{return reply.type("text/html; charset=utf-8").send(await readFile(path.resolve(process.cwd(),"public/index.html"),"utf8"))}
  catch{return reply.code(404).type("text/plain; charset=utf-8").send("DANSK eSIM frontend ikke fundet")}
});
app.get("/manifest.webmanifest",async(_req,reply)=>reply.send(await readFile(path.resolve(process.cwd(),"public/manifest.webmanifest"),"utf8")));
app.get("/sw.js",async(_req,reply)=>reply.type("application/javascript").send(await readFile(path.resolve(process.cwd(),"public/sw.js"),"utf8")));
app.get("/icons/icon.svg",async(_req,reply)=>reply.type("image/svg+xml").send(await readFile(path.resolve(process.cwd(),"public/icons/icon.svg"),"utf8")));

app.get("/health",async()=>({ok:true,service:"dansk-esim-api",version:"0.8.0"}));

let verificationCache:{at:number,services:Array<{code:string,name:string,count?:number}>}|null=null;
async function getNumberOtpServices(){
  if(verificationCache&&Date.now()-verificationCache.at<5*60*1000)return verificationCache.services;
  const r=await fetch("https://api.numberotp.com/v1/public/services",{headers:{accept:"application/json"}});
  if(!r.ok)throw new Error("NumberOTP services request failed: "+r.status);
  const j=await r.json() as any;
  const candidates=[
    j?.data?.services,j?.services,j?.data?.items,j?.data?.results,
    j?.items,j?.results,Array.isArray(j?.data)?j.data:null
  ];
  const raw=candidates.find((x:any)=>Array.isArray(x))??[];
  const services=raw.map((x:any)=>({
    code:String(x?.code??x?.id??x?.service??"").trim(),
    name:String(x?.name??x?.title??x?.service_name??"").trim(),
    count:Number.isFinite(Number(x?.count))?Number(x.count):undefined
  })).filter((x:any)=>x.code&&x.name);
  if(!services.length)throw new Error("NumberOTP services response contained no services");
  verificationCache={at:Date.now(),services}; return services;
}
app.get("/api/catalog",async()=>catalog);
app.get("/api/verification/services",async(_req,reply)=>{
  try{const services=await getNumberOtpServices();return {ok:true,source:"numberotp",updatedAt:new Date(verificationCache!.at).toISOString(),count:services.length,services}}
  catch(error){app.log.error(error);return reply.code(502).send({ok:false,error:"verification_catalog_unavailable"})}
});

app.post("/api/auth/telegram",async(req,reply)=>{
  if(!token)return reply.code(503).send({ok:false,error:"telegram_token_not_configured"});
  const body=req.body as {initData?:string};const user=body?.initData?verifyTelegramInitData(body.initData,token):null;
  if(!user)return reply.code(401).send({ok:false,error:"invalid_telegram_init_data"});
  return {ok:true,user:db.user(user.telegramUserId),notifications:db.notificationPrefs(user.telegramUserId)};
});
app.get("/api/me",async(req,reply)=>{
  const user=auth(req);if(!user)return reply.code(401).send({ok:false,error:"unauthorized"});
  return {ok:true,user:db.user(user.telegramUserId),orders:db.ordersByUser(user.telegramUserId),favorites:db.favorites(user.telegramUserId),recent:db.recent(user.telegramUserId),notifications:db.notificationPrefs(user.telegramUserId)};
});

app.post("/api/orders",async(req,reply)=>{
  const user=auth(req);if(!user)return reply.code(401).send({ok:false,error:"unauthorized"});
  const body=req.body as {productId?:string};const p=catalog.esim.sms.find(x=>x.id===body?.productId);
  if(!p)return reply.code(400).send({ok:false,error:"invalid_product"});
  const firstPurchase=db.ordersByUser(user.telegramUserId).length===0;
  const amountDkk=firstPurchase?Math.round(p.monthlyPrice*0.5):p.monthlyPrice;
  const o={id:"DES-"+Date.now()+"-"+crypto.randomBytes(3).toString("hex"),telegramUserId:user.telegramUserId,productId:p.id,amountDkk,status:"pending_payment",createdAt:new Date().toISOString()};
  db.saveOrder(o);
  return {ok:true,firstPurchaseDiscount:firstPurchase,order:o};
});
app.get("/api/orders/:id",async(req,reply)=>{
  const user=auth(req);if(!user)return reply.code(401).send({ok:false,error:"unauthorized"});
  const o=db.order((req.params as any).id);if(!o||o.telegramUserId!==user.telegramUserId)return reply.code(404).send({ok:false,error:"not_found"});
  return {ok:true,order:o};
});

app.post("/api/notifications/preferences",async(req,reply)=>{
  const user=auth(req);if(!user)return reply.code(401).send({ok:false,error:"unauthorized"});
  const body=req.body as Partial<{enabled:boolean;offers:boolean;expiry:boolean;renewal:boolean;lowBalance:boolean;orderReady:boolean;support:boolean}>;
  return {ok:true,preferences:db.setNotificationPrefs(user.telegramUserId,body)};
});

app.get("/api/support/history",async(req,reply)=>{
  const user=auth(req);if(!user)return reply.code(401).send({ok:false,error:"unauthorized"});
  return {ok:true,messages:db.supportHistory(user.telegramUserId)};
});
app.post("/api/support/message",async(req,reply)=>{
  const user=auth(req);if(!user)return reply.code(401).send({ok:false,error:"unauthorized"});
  const body=req.body as {message?:string;agent?:boolean};const message=String(body?.message??"").trim();
  if(!message)return reply.code(400).send({ok:false,error:"message_required"});
  db.addSupport(user.telegramUserId,"customer",message);
  const agentRequested=Boolean(body?.agent||/agent|medarbejder|person/i.test(message));
  const replyText=agentRequested?"Jeg har sendt din besked til support. En medarbejder kan overtage her.":await aiReplyWithOpenAI(message);
  db.addSupport(user.telegramUserId,"ai",replyText);
  if(agentRequested&&adminChatId)await telegramSend(adminChatId,`🆘 DANSK eSIM support\nTelegram bruger: ${user.telegramUserId}\n\n${message}`);
  return {ok:true,reply:replyText,agentRequested};
});

app.post("/api/favorites/toggle",async(req,reply)=>{
  const user=auth(req);if(!user)return reply.code(401).send({ok:false,error:"unauthorized"});
  const b=req.body as {code?:string;name?:string};if(!b.code||!b.name)return reply.code(400).send({ok:false,error:"service_required"});
  return {ok:true,favorites:db.toggleFavorite(user.telegramUserId,b.code,b.name)};
});
app.get("/api/favorites",async(req,reply)=>{const u=auth(req);if(!u)return reply.code(401).send({ok:false,error:"unauthorized"});return {ok:true,favorites:db.favorites(u.telegramUserId)}});
app.post("/api/recent",async(req,reply)=>{const u=auth(req);if(!u)return reply.code(401).send({ok:false,error:"unauthorized"});const b=req.body as {code?:string;name?:string};if(!b.code||!b.name)return reply.code(400).send({ok:false,error:"service_required"});return {ok:true,recent:db.addRecent(u.telegramUserId,b.code,b.name)}});
app.get("/api/recent",async(req,reply)=>{const u=auth(req);if(!u)return reply.code(401).send({ok:false,error:"unauthorized"});return {ok:true,recent:db.recent(u.telegramUserId)}});

app.get("/api/credits/history",async(req,reply)=>{const u=auth(req);if(!u)return reply.code(401).send({ok:false,error:"unauthorized"});return {ok:true,balance:db.user(u.telegramUserId).credits,history:db.creditHistory(u.telegramUserId)}});
app.get("/api/service-status",async()=>({ok:true,status:"operational",components:{platform:"operational",telegram:"operational",verification:"provider-dependent",esim:"provider-dependent",payments:"manual-review"}}));
app.get("/api/privacy",async()=>({ok:true,principles:["Dataminimering","Ingen unødvendig ID-upload i eget flow","Ingen rich identity profiling","Kunde kan anmode om deaktivering/sletning af aktiv platformdata"],note:"Provider-, betalings-, Telegram- og lovpligtige opbevaringskrav kan stadig gælde."}));
app.get("/api/how-it-works",async()=>({ok:true,steps:["Vælg produkt","Betal","Ordren godkendes","Provider leverer eller aktiverer tjenesten","Se status i Mini App"]}));
app.get("/api/referral",async(req,reply)=>{
  const u=auth(req);if(!u)return reply.code(401).send({ok:false,error:"unauthorized"});
  const code=crypto.createHash("sha256").update(u.telegramUserId+String(process.env.REFERRAL_SALT??"dansk-esim")).digest("hex").slice(0,10);
  return {ok:true,code,link:botUsername?"https://t.me/"+botUsername+"?start=ref_"+code:null};
});

app.get("/api/admin/orders",async(req,reply)=>{
  if(!adminAuthorized(String(req.headers.authorization??""),adminSecret??""))return reply.code(401).send({ok:false,error:"unauthorized"});
  return {ok:true,orders:db.allOrders()};
});
app.post("/api/admin/orders/:id/status",async(req,reply)=>{
  if(!adminAuthorized(String(req.headers.authorization??""),adminSecret??""))return reply.code(401).send({ok:false,error:"unauthorized"});
  const body=req.body as {status?:string};const allowed=["pending_payment","payment_review","paid","provisioning","active","failed","cancelled"];
  if(!body?.status||!allowed.includes(body.status))return reply.code(400).send({ok:false,error:"invalid_status"});
  const o=db.setOrderStatus((req.params as any).id,body.status);if(!o)return reply.code(404).send({ok:false,error:"not_found"});
  if(o.status==="active"){const p=db.notificationPrefs(o.telegramUserId);if(p.enabled&&p.orderReady)await telegramSend(o.telegramUserId,`✅ Din DANSK eSIM-ordre ${o.id} er klar.`)}
  return {ok:true,order:o};
});
app.post("/api/admin/notify",async(req,reply)=>{
  if(!adminAuthorized(String(req.headers.authorization??""),adminSecret??""))return reply.code(401).send({ok:false,error:"unauthorized"});
  const b=req.body as {telegramUserId?:string;message?:string;kind?:"offer"|"expiry"|"renewal"|"lowBalance"|"orderReady"|"support"};
  if(!b.telegramUserId||!b.message)return reply.code(400).send({ok:false,error:"recipient_and_message_required"});
  const p=db.notificationPrefs(b.telegramUserId);if(!p.enabled)return {ok:true,sent:false,reason:"disabled"};
  const allowed=b.kind?({offer:p.offers,expiry:p.expiry,renewal:p.renewal,lowBalance:p.lowBalance,orderReady:p.orderReady,support:p.support}[b.kind]??true):true;
  if(!allowed)return {ok:true,sent:false,reason:"category_disabled"};
  return {ok:true,sent:await telegramSend(b.telegramUserId,b.message)};
});
app.post("/api/esims/:id/delete",async(req,reply)=>{
  const user=auth(req);if(!user)return reply.code(401).send({ok:false,error:"unauthorized"});
  return reply.code(501).send({ok:false,error:"provider_deactivation_not_configured"});
});

const port=Number(process.env.PORT??3000);
await app.listen({port,host:"0.0.0.0"});