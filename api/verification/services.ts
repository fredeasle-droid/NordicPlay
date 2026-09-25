export default async function handler(req:any,res:any){
  if(req.method!=="GET"){
    res.setHeader("Allow","GET");
    return res.status(405).json({ok:false,error:"method_not_allowed"});
  }

  try{
    const upstream=await fetch("https://api.numberotp.com/v1/public/services",{
      headers:{accept:"application/json"},
      cache:"no-store"
    });

    if(!upstream.ok){
      return res.status(502).json({ok:false,error:"numberotp_unavailable",status:upstream.status});
    }

    const body=await upstream.json() as any;
    const raw=Array.isArray(body?.data?.services)
      ? body.data.services
      : Array.isArray(body?.services)
        ? body.services
        : Array.isArray(body?.data)
          ? body.data
          : [];

    const services=raw.map((x:any)=>({
      code:String(x?.code??x?.id??x?.service??"").trim(),
      name:String(x?.name??x?.title??x?.service_name??"").trim(),
      count:Number.isFinite(Number(x?.count))?Number(x.count):undefined
    })).filter((x:any)=>x.code&&x.name);

    if(!services.length){
      return res.status(502).json({ok:false,error:"numberotp_empty_catalog"});
    }

    res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({
      ok:true,
      source:"numberotp",
      updatedAt:new Date().toISOString(),
      count:services.length,
      services
    });
  }catch(error){
    console.error("NumberOTP catalog error",error);
    return res.status(502).json({ok:false,error:"verification_catalog_unavailable"});
  }
}
