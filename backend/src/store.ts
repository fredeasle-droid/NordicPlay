type Order={id:string;telegramUserId:string;productId:string;amountDkk:number;status:string;createdAt:string};
const orders:Order[]=[];
export const store={createOrder(o:Order){orders.push(o);return o},byUser(id:string){return orders.filter(x=>x.telegramUserId===id)},get(id:string){return orders.find(x=>x.id===id)}};
