import Fastify from "fastify";
import cors from "@fastify/cors";
import "dotenv/config";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { verifyTelegramInitData } from "./telegram.js";
import { db } from "./db.js";
import { adminAuthorized } from "./admin.js";

const app=Fastify({logger:true}); await app.register(cors,{origin:true});
const token=process.env.TELEGRAM_BOT_TOKEN; const adminSecret=process.env.ADMIN_SECRET;
const catalog={esim:{sms:[{id:"sms_1",label:"Med SMS · 1 nummer",monthlyPrice:500},{id:"sms_2",label:"Med SMS · 2 numre",monthlyPrice:800},{id:"sms_3",label:"Med SMS · 3 numre",monthlyPrice:1100}],voiceOnly:{status:"pricing_pending",minutePackages:[]},delivery:{standardFee:0,expressFee:null,channels:["telegram","email"]}},verification:{services:["WhatsApp","Telegram","Instagram","TikTok","Facebook","Google"],countries:[{code:"DK",dialCode:"+45",name:"Danmark"}],creditPackages:[3,10,25,50,100],creditExpiry:"never"}};
function auth(req:any){if(!token)return null;const h=String(req.headers.authorization??"");const data=h.startsWith("tma ")?h.slice(4):"";return data?verifyTelegramInitData(data,token):null}

app.get("/",async(_req,reply)=>{
  try{
    const html=await readFile(path.resolve(process.cwd(),"../index.html"),"utf8");
    return reply.type("text/html; charset=utf-8").send(html);
  }catch{
    return reply.code(404).type("text/plain; charset=utf-8").send("DANSK eSIM frontend ikke fundet");
  }
});
app.get("/health",async()=>({ok:true,service:"dansk-esim-api",version:"0.5.0"}));
app.get("/api/catalog",async()=>catalog);
app.post("/api/auth/telegram",async(req,reply)=>{if(!token)return reply.code(503).send({ok:false,error:"telegram_token_not_configured"});const body=req.body as {initData?:string};const user=body?.initData?verifyTelegramInitData(body.initData,token):null;if(!user)return reply.code(401).send({ok:false,error:"invalid_telegram_init_data"});return {ok:true,user:db.user(user.telegramUserId)}});
app.get("/api/me",async(req,reply)=>{const user=auth(req);if(!user)return reply.code(401).send({ok:false,error:"unauthorized"});return {ok:true,user:db.user(user.telegramUserId),orders:db.ordersByUser(user.telegramUserId)}});
app.post("/api/orders",async(req,reply)=>{const user=auth(req);if(!user)return reply.code(401).send({ok:false,error:"unauthorized"});const body=req.body as {productId?:string};const p=catalog.esim.sms.find(x=>x.id===body?.productId);if(!p)return reply.code(400).send({ok:false,error:"invalid_product"});const o={id:"DES-"+Date.now()+"-"+crypto.randomBytes(3).toString("hex"),telegramUserId:user.telegramUserId,productId:p.id,amountDkk:p.monthlyPrice,status:"pending_payment",createdAt:new Date().toISOString()};return {ok:true,order:db.saveOrder(o)}});
app.get("/api/orders/:id",async(req,reply)=>{const user=auth(req);if(!user)return reply.code(401).send({ok:false,error:"unauthorized"});const o=db.order((req.params as any).id);if(!o||o.telegramUserId!==user.telegramUserId)return reply.code(404).send({ok:false,error:"not_found"});return {ok:true,order:o}});
app.get("/api/admin/orders",async(req,reply)=>{if(!adminAuthorized(String(req.headers.authorization??""),adminSecret??""))return reply.code(401).send({ok:false,error:"unauthorized"});return {ok:true,orders:db.allOrders()}});
app.post("/api/admin/orders/:id/status",async(req,reply)=>{if(!adminAuthorized(String(req.headers.authorization??""),adminSecret??""))return reply.code(401).send({ok:false,error:"unauthorized"});const body=req.body as {status?:string};const allowed=["pending_payment","payment_review","paid","provisioning","active","failed","cancelled"];if(!body?.status||!allowed.includes(body.status))return reply.code(400).send({ok:false,error:"invalid_status"});const o=db.setOrderStatus((req.params as any).id,body.status);if(!o)return reply.code(404).send({ok:false,error:"not_found"});return {ok:true,order:o}});
app.post("/api/esims/:id/delete",async(req,reply)=>{const user=auth(req);if(!user)return reply.code(401).send({ok:false,error:"unauthorized"});return reply.code(501).send({ok:false,error:"provider_deactivation_not_configured"})});
const port=Number(process.env.PORT??3000);await app.listen({port,host:"0.0.0.0"});
