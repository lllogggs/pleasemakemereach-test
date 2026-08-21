import type {Offer, SearchResponse} from './types';

type ProviderId = Offer['provider'];
type ProviderConfig = {
  id: ProviderId;
  base: string;
  searchUrl: (q:string)=>string;
  hrefPatterns: RegExp[];
  productId: (url:string)=>string|null;
  affiliate: {domain:string;m:string;lCd1:string;lCd2:string};
};

import {buildAffiliateUrl} from './affiliate';
import {mergeOffers} from './searchMerge';
import {naverDiscoverySearch} from './naverDiscovery';
const PROVIDERS: ProviderConfig[] = [
  {
    id:'gmarket', base:'https://www.gmarket.co.kr',
    searchUrl:q=>`https://www.gmarket.co.kr/n/search?keyword=${encodeURIComponent(q)}`,
    hrefPatterns:[/gmarket\.co\.kr\/(?:Item|vi\/product)/i,/goodscode=/i],
    productId:url=>safeUrl(url)?.searchParams.get('goodscode')||url.match(/product\/(\d+)/i)?.[1]||null,
    affiliate:{domain:'https://click.linkprice.com/click.php',m:'gmarket',lCd1:'D',lCd2:'H'},
  },
  {
    id:'lotteon', base:'https://www.lotteon.com',
    searchUrl:q=>`https://www.lotteon.com/csearch/search/search?mallId=2&render=search&platform=m&q=${encodeURIComponent(q)}`,
    hrefPatterns:[/lotteon\.com\/(?:p|m)\/product\/(?:LO|LE)\d+/i,/productNo=(?:LO|LE)\d+/i],
    productId:url=>url.match(/\/product\/((?:LO|LE)\d+)/i)?.[1]||safeUrl(url)?.searchParams.get('productNo')||null,
    affiliate:{domain:'https://click.linkprice.com/click.php',m:'lotteon',lCd1:'D',lCd2:'H'},
  },
  {
    id:'hmall', base:'https://wwwca.hmall.com',
    searchUrl:q=>`https://wwwca.hmall.com/?tagxrayQuery=${encodeURIComponent(q)}`,
    hrefPatterns:[/hmall\.com\/md\/pda\/itemPtc/i,/slitmCd=/i],
    productId:url=>safeUrl(url)?.searchParams.get('slitmCd')||null,
    affiliate:{domain:'https://lase.kr/click.php',m:'hmall',lCd1:'3',lCd2:'0'},
  },
  {
    id:'himart', base:'https://www.e-himart.co.kr',
    searchUrl:q=>`https://www.e-himart.co.kr/?tagxrayQuery=${encodeURIComponent(q)}`,
    hrefPatterns:[/e-himart\.co\.kr\/app\/goods\/goodsDetail/i,/goodsNo=/i],
    productId:url=>safeUrl(url)?.searchParams.get('goodsNo')||null,
    affiliate:{domain:'https://click.linkprice.com/click.php',m:'himart',lCd1:'D',lCd2:'H'},
  },
];

const normalize=(s:string)=>s.toUpperCase().trim().replace(/\s+/g,'').replace(/[‐‑‒–—]/g,'-');
const compact=(s:string)=>normalize(s).replace(/[\-\/_.]/g,'');
const strip=(s:string)=>decodeEntities(s.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
const safeUrl=(u:string)=>{try{return new URL(u);}catch{return null;}};
const absolute=(base:string,href:string)=>{try{return new URL(decodeEntities(href),base).toString();}catch{return null;}};
function decodeEntities(s:string){return s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');}

export function searchVariants(raw:string){
  const base=normalize(raw), chars=[...base]; const out:string[]=[]; const seen=new Set<string>();
  const add=(v:string)=>{const c=compact(v);if(c.length>=5&&!seen.has(c)){seen.add(c);out.push(v);}};
  add(base);
  const map:Record<string,string>={'0':'O','O':'0','1':'I','I':'1','5':'S','S':'5','8':'B','B':'8'};
  const idx=chars.map((_,i)=>i).filter(i=>map[chars[i]]).sort((a,b)=>{
    const score=(i:number)=>(/[A-Z]/.test(chars[i-1]||'')||/[A-Z]/.test(chars[i+1]||'')?10:0)+(i>=2?2:0)-(i<2?5:0);
    return score(b)-score(a);
  });
  for(const i of idx){add(base.slice(0,i)+map[chars[i]]+base.slice(i+1));if(out.length>=6)break;}
  return out;
}

function parsePrice(text:string){
  const values=[...text.matchAll(/(?:₩|KRW\s*)?\s*([0-9]{1,3}(?:,[0-9]{3})+)\s*(?:원)?/gi)]
    .map(m=>Number(m[1].replace(/,/g,''))).filter(n=>n>=1000&&n<=100_000_000);
  return values.length?Math.min(...values):null;
}

function parseHtml(cfg:ProviderConfig,html:string,allVariants:string[]):Offer[]{
  const result:Offer[]=[]; const seen=new Set<string>();
  const hrefRe=/href\s*=\s*["']([^"']+)["']/gi; let m:RegExpExecArray|null;
  while((m=hrefRe.exec(html))){
    const url=absolute(cfg.base,m[1]); if(!url||!cfg.hrefPatterns.some(r=>r.test(url))||seen.has(url))continue;
    const id=cfg.productId(url); if(!id)continue;
    const from=Math.max(0,m.index-1800),to=Math.min(html.length,hrefRe.lastIndex+2600); const segment=strip(html.slice(from,to)); const hay=compact(segment);
    const matched=allVariants.some(v=>{const c=compact(v);return c.length>=5&&hay.includes(c);}); if(!matched)continue;
    const price=parsePrice(segment); if(!price)continue;
    seen.add(url);
    const title=(segment.match(/.{0,80}(?:[A-Z0-9][A-Z0-9\-\/]{4,20}).{0,80}/i)?.[0]||segment.slice(0,150)).trim();
    result.push({provider:cfg.id,providerProductId:id,productName:title,price,finalPrice:price,productUrl:url,affiliateUrl:buildAffiliateUrl(cfg.id,url),inStock:!/품절|sold\s*out|판매종료/i.test(segment),matchConfidence:.96,checkedAt:new Date().toISOString(),source:'retailer-page'});
    if(result.length>=8)break;
  }
  return result.filter(x=>x.inStock).sort((a,b)=>a.finalPrice-b.finalPrice);
}

async function searchProvider(cfg:ProviderConfig,rawCode:string,brand?:string){
  const vs=searchVariants(rawCode); let lastError='';
  for(const v of vs.slice(0,3)){
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),3200);
    try{
      const q=[brand,v].filter(Boolean).join(' ');
      const res=await fetch(cfg.searchUrl(q),{signal:controller.signal,headers:{'Accept-Language':'ko-KR,ko;q=0.9,en;q=0.6','Accept':'text/html,application/xhtml+xml,*/*;q=0.8'}});
      if(!res.ok){lastError=`HTTP ${res.status}`;continue;}
      const html=await res.text();
      if(/captcha|access denied|비정상적인 접근|자동입력 방지|로봇이 아닙니다/i.test(html)){lastError='접근 제한';break;}
      const offers=parseHtml(cfg,html,vs); if(offers.length)return offers;
    }catch(e){lastError=e instanceof Error?e.message:String(e);}finally{clearTimeout(timer);}
  }
  if(lastError) throw new Error(`${cfg.id}: ${lastError}`);
  return [] as Offer[];
}

async function retailerFallback(input:{rawCode:string;brand?:string;barcode?:string;storePrice?:number}, upstreamFailures:string[]=[]):Promise<SearchResponse>{
  const settled=await Promise.allSettled(PROVIDERS.map(p=>searchProvider(p,input.rawCode,input.brand)));
  const failures=[...upstreamFailures]; const offers:Offer[]=[];
  settled.forEach((r,i)=>{if(r.status==='fulfilled')offers.push(...r.value);else failures.push(`${PROVIDERS[i].id}: ${r.reason instanceof Error?r.reason.message:String(r.reason)}`);});
  const mergedOffers=mergeOffers(offers);
  const lowest=mergedOffers[0]||null; const storePrice=input.storePrice??null; const saving=lowest&&storePrice!=null?storePrice-lowest.finalPrice:null;
  return {
    query:{rawCode:input.rawCode,normalizedCode:normalize(input.rawCode),variants:searchVariants(input.rawCode),brand:input.brand},
    offers:mergedOffers,
    failures,
    discovery:{source:'retailer-direct',status:mergedOffers.length?'ok':failures.length?'failed':'no_exact_match',checkedAt:new Date().toISOString(),candidateCount:mergedOffers.length},
    summary:{lowestOnlinePrice:lowest?.finalPrice??null,lowestProvider:lowest?.provider??null,storePrice,savingAmount:saving,recommendation:!lowest?'NO_ONLINE_STOCK':storePrice==null?'ONLINE_FOUND':saving!>0?'ONLINE_WIN':saving!<0?'STORE_WIN':'SAME_PRICE'},
  };
}

export async function directSearch(input:{rawCode:string;brand?:string;barcode?:string;storePrice?:number}):Promise<SearchResponse>{
  const variants=searchVariants(input.rawCode);
  const discovery=await naverDiscoverySearch(input,variants);
  if(discovery.offers.length) return discovery;
  return retailerFallback(input,discovery.failures);
}
