export type User={telegramUserId:string;credits:number;createdAt:string;welcomeUsed?:boolean};
export type Order={id:string;telegramUserId:string;productId:string;amountDkk:number;status:string;createdAt:string};
export type NotificationPrefs={telegramUserId:string;enabled:boolean;offers:boolean;expiry:boolean;renewal:boolean;lowBalance:boolean;orderReady:boolean;support:boolean;updatedAt:string};
export type SupportMessage={id:string;telegramUserId:string;role:"customer"|"ai"|"agent";message:string;createdAt:string};
export type Favorite={telegramUserId:string;serviceCode:string;serviceName:string;createdAt:string};
export type Recent={telegramUserId:string;serviceCode:string;serviceName:string;usedAt:string};
export type CreditEvent={id:string;telegramUserId:string;type:"purchase"|"use"|"refund"|"bonus";amount:number;note:string;createdAt:string};

const users=new Map<string,User>();
const orders=new Map<string,Order>();
const prefs=new Map<string,NotificationPrefs>();
const support=new Map<string,SupportMessage[]>();
const favorites=new Map<string,Map<string,Favorite>>();
const recent=new Map<string,Recent[]>();
const creditHistory=new Map<string,CreditEvent[]>();

export const db={
  user(id:string){let u=users.get(id);if(!u){u={telegramUserId:id,credits:0,createdAt:new Date().toISOString()};users.set(id,u)}return u},
  ordersByUser(id:string){return [...orders.values()].filter(o=>o.telegramUserId===id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))},
  allOrders(){return [...orders.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))},
  order(id:string){return orders.get(id)},
  saveOrder(o:Order){orders.set(o.id,o);return o},
  setOrderStatus(id:string,status:string){const o=orders.get(id);if(o)o.status=status;return o},
  notificationPrefs(id:string){
    let p=prefs.get(id);
    if(!p){p={telegramUserId:id,enabled:true,offers:true,expiry:true,renewal:true,lowBalance:true,orderReady:true,support:true,updatedAt:new Date().toISOString()};prefs.set(id,p)}
    return p;
  },
  setNotificationPrefs(id:string,patch:Partial<Omit<NotificationPrefs,"telegramUserId"|"updatedAt">>){const p={...this.notificationPrefs(id),...patch,updatedAt:new Date().toISOString()};prefs.set(id,p);return p},
  addSupport(id:string,role:SupportMessage["role"],message:string){const m:SupportMessage={id:"SUP-"+Date.now()+"-"+Math.random().toString(16).slice(2,8),telegramUserId:id,role,message,createdAt:new Date().toISOString()};const a=support.get(id)||[];a.push(m);support.set(id,a.slice(-100));return m},
  supportHistory(id:string){return support.get(id)||[]},
  toggleFavorite(id:string,serviceCode:string,serviceName:string){const m=favorites.get(id)||new Map<string,Favorite>();if(m.has(serviceCode))m.delete(serviceCode);else m.set(serviceCode,{telegramUserId:id,serviceCode,serviceName,createdAt:new Date().toISOString()});favorites.set(id,m);return [...m.values()]},
  favorites(id:string){return [...(favorites.get(id)||new Map()).values()]},
  addRecent(id:string,serviceCode:string,serviceName:string){const a=(recent.get(id)||[]).filter(x=>x.serviceCode!==serviceCode);a.unshift({telegramUserId:id,serviceCode,serviceName,usedAt:new Date().toISOString()});recent.set(id,a.slice(0,10));return recent.get(id)!},
  recent(id:string){return recent.get(id)||[]},
  addCreditEvent(id:string,type:CreditEvent["type"],amount:number,note:string){const e:CreditEvent={id:"CR-"+Date.now()+"-"+Math.random().toString(16).slice(2,8),telegramUserId:id,type,amount,note,createdAt:new Date().toISOString()};const a=creditHistory.get(id)||[];a.unshift(e);creditHistory.set(id,a.slice(0,100));return e},
  creditHistory(id:string){return creditHistory.get(id)||[]}
};