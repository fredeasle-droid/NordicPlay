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
function aiReply(q:string){
  if(/agent|medarbejder|person/i.test(q))return "Jeg sender din henvendelse videre til support. En medarbejder kan overtage samtalen her.";
  if(/verif|kyc|no verification/i.test(q))return "Vores flow er bygget med dataminimering. Krav fra den konkrete tjeneste, provider eller betalingsudbyder kan stadig gælde.";
  if(/ordre|order/i.test(q))return "Du kan se ordrestatus under Mine ordrer. Send ordre-ID'et til support, hvis du har brug for hjælp.";
  if(/credit/i.test(q))return "Credits kan købes og bruges til understøttede verifikationer. Credits udløber ikke i det nuværende setup.";
  return "Jeg kan hjælpe med eSIM, verifikation, credits, ordrestatus og betaling. Skriv “agent”, hvis du vil have en medarbejder.";
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
  const replyText=body?.agent||/agent|medarbejder/i.test(message)?"Jeg har sendt din besked til support. En medarbejder kan overtage her.":aiReply(message);
  db.addSupport(user.telegramUserId,body?.agent||/agent|medarbejder/i.test(message)?"ai":"ai",replyText);
  if((body?.agent||/agent|medarbejder/i.test(message))&&adminChatId)await telegramSend(adminChatId,`🆘 DANSK eSIM support\nTelegram bruger: ${user.telegramUserId}\n\n${message}`);
  return {ok:true,reply:replyText,agentRequested:Boolean(body?.agent||/agent|medarbejder/i.test(message))};
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