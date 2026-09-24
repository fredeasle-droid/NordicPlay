import Fastify from "fastify";
import cors from "@fastify/cors";
import "dotenv/config";
import crypto from "node:crypto";
import { verifyTelegramInitData } from "./telegram.js";
import { store } from "./store.js";

const app=Fastify({logger:true});
await app.register(cors,{origin:true});
const token=process.env.TELEGRAM_BOT_TOKEN;
const catalog={esim:{sms:[{id:"sms_1",label:"Med SMS · 1 nummer",monthlyPrice:500},{id:"sms_2",label:"Med SMS · 2 numre",monthlyPrice:800},{id:"sms_3",label:"Med SMS · 3 numre",monthlyPrice:1100}],voiceOnly:{status:"pricing_pending",minutePackages:[]},delivery:{standardFee:0,expressFee:null,channels:["telegram","email"]}},verification:{services:["WhatsApp","Telegram","Instagram","TikTok","Facebook","Google"],countries:[{code:"DK",dialCode:"+45",name:"Danmark"}],creditPackages:[3,10,25,50,100],creditExpiry:"never"}};
function auth(req:any){if(!token)return null;const h=String(req.headers.authorization??"");const data=h.startsWith("tma ")?h.slice(4):"";return data?verifyTelegramInitData(data,token):null}
app.get("/health",async()=>({ok:true,service:"dansk-esim-api",version:"0.2.0"}));
app.get("/api/catalog",async()=>catalog);
app.post("/api/auth/telegram",async(req,reply)=>{if(!token)return reply.code(503).send({ok:false,error:"telegram_token_not_configured"});const body=req.body as {initData?:string};const user=body?.initData?verifyTelegramInitData(body.initData,token):null;if(!user)return reply.code(401).send({ok:false,error:"invalid_telegram_init_data"});return {ok:true,user}});
app.get("/api/me",async(req,reply)=>{const user=auth(req);if(!user)return reply.code(401).send({ok:false,error:"unauthorized"});return {ok:true,user,orders:store.byUser(user.telegramUserId)}});
app.post("/api/orders",async(req,reply)=>{const user=auth(req);if(!user)return reply.code(401).send({ok:false,error:"unauthorized"});const body=req.body as {productId?:string};const product=catalog.esim.sms.find(x=>x.id===body?.productId);if(!product)return reply.code(400).send({ok:false,error:"invalid_product"});const order={id:"DES-"+Date.now()+"-"+crypto.randomBytes(3).toString("hex"),telegramUserId:user.telegramUserId,productId:product.id,amountDkk:product.monthlyPrice,status:"pending_payment",createdAt:new Date().toISOString()};return {ok:true,order:store.createOrder(order)}});
app.get("/api/orders/:id",async(req,reply)=>{const user=auth(req);if(!user)return reply.code(401).send({ok:false,error:"unauthorized"});const order=store.get((req.params as any).id);if(!order||order.telegramUserId!==user.telegramUserId)return reply.code(404).send({ok:false,error:"not_found"});return {ok:true,order}});
app.post("/api/esims/:id/delete",async(req,reply)=>{const user=auth(req);if(!user)return reply.code(401).send({ok:false,error:"unauthorized"});return reply.code(501).send({ok:false,error:"provider_deactivation_not_configured",message:"Provider-deaktivering skal gennemføres før lokal sletning."})});
const port=Number(process.env.PORT??3000);await app.listen({port,host:"0.0.0.0"});
