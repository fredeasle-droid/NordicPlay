export type User={telegramUserId:string;credits:number;createdAt:string};
export type Order={id:string;telegramUserId:string;productId:string;amountDkk:number;status:string;createdAt:string};
const users=new Map<string,User>(); const orders=new Map<string,Order>();
export const db={
  user(id:string){let u=users.get(id);if(!u){u={telegramUserId:id,credits:0,createdAt:new Date().toISOString()};users.set(id,u)}return u},
  ordersByUser(id:string){return [...orders.values()].filter(o=>o.telegramUserId===id)},
  order(id:string){return orders.get(id)},
  saveOrder(o:Order){orders.set(o.id,o);return o},
  setOrderStatus(id:string,status:string){const o=orders.get(id);if(o)o.status=status;return o}
};