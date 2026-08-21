import {buildAffiliateUrl} from './affiliate';
import type {Offer, SearchResponse} from './types';
import {mergeOffers} from './searchMerge';

const NAVER_MOBILE_SEARCH = 'https://m.search.naver.com/search.naver';
const USER_AGENT = 'Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

type SupportedProvider = Offer['provider'];

type ParsedShoppingItem = {
  provider: SupportedProvider;
  providerProductId: string;
  mallName: string;
  productName: string;
  productUrl: string;
  imageUrl?: string;
  price: number;
  shippingFee: number;
};

const normalize=(s:string)=>s.toUpperCase().trim().replace(/\s+/g,'').replace(/[‐‑‒–—]/g,'-');
const compact=(s:string)=>normalize(s).replace(/[\-\/_.]/g,'');

function decodeJsString(raw?: string): string | undefined {
  if (raw == null) return undefined;
  try {
    return JSON.parse(`"${raw}"`)
      .replace(/<\/?mark>/gi,'')
      .replace(/&amp;/g,'&')
      .replace(/&quot;/g,'"')
      .replace(/&#39;/g,"'")
      .trim();
  } catch {
    return raw
      .replace(/\\u002F/gi,'/')
      .replace(/\\u003Cmark\\u003E/gi,'')
      .replace(/\\u003C\\u002Fmark\\u003E/gi,'')
      .replace(/&amp;/g,'&')
      .trim();
  }
}

function stringField(block:string,key:string):string|undefined {
  const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const m=block.match(new RegExp(`"${escaped}":"((?:\\\\.|[^"\\\\])*)"`));
  return decodeJsString(m?.[1]);
}
function numberField(block:string,key:string):number|undefined {
  const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const m=block.match(new RegExp(`"${escaped}":(\\d+)`));
  if(!m) return undefined;
  const n=Number(m[1]);
  return Number.isFinite(n)?n:undefined;
}

function providerFor(mallName:string,url:string,mallId?:string):SupportedProvider|null {
  const hay=`${mallName} ${mallId||''} ${url}`.toLowerCase();
  if(/lotteon|롯데on/.test(hay)) return 'lotteon';
  if(/hmall|현대hmall/.test(hay)) return 'hmall';
  if(/gmarket|g마켓|goodsdaq/.test(hay)) return 'gmarket';
  if(/e-himart|himart|하이마트/.test(hay)) return 'himart';
  return null;
}

function providerProductId(provider:SupportedProvider,url:string):string|null {
  try {
    const u=new URL(url);
    if(provider==='gmarket') return u.searchParams.get('goodscode')||u.searchParams.get('item-no')||url.match(/goodscode=(\d+)/i)?.[1]||null;
    if(provider==='lotteon') return url.match(/\/product\/((?:LO|LE)\d+)/i)?.[1]||u.searchParams.get('productNo')||null;
    if(provider==='hmall') return u.searchParams.get('slitmCd')||null;
    if(provider==='himart') return u.searchParams.get('goodsNo')||null;
  } catch {}
  return null;
}

function productUrlFromBlock(block:string):string|undefined {
  const i=block.indexOf('"productUrl":');
  if(i<0) return undefined;
  const sub=block.slice(i,Math.min(block.length,i+2500));
  return stringField(sub,'pcUrl')||stringField(sub,'mobileUrl');
}

function imageUrlFromBlock(block:string):string|undefined {
  const i=block.indexOf('"images":');
  if(i<0) return undefined;
  return stringField(block.slice(i,Math.min(block.length,i+1500)),'imageUrl');
}

function exactCodeMatch(productName:string,variants:string[]):boolean {
  const hay=compact(productName);
  return variants.some(v=>{
    const needle=compact(v);
    return needle.length>=5&&hay.includes(needle);
  });
}

export function parseNaverShoppingHtml(html:string,variants:string[]):Offer[] {
  const starts:number[]=[];
  let pos=0;
  while((pos=html.indexOf('"productName":',pos))>=0){starts.push(pos);pos+=14;}
  const parsed:ParsedShoppingItem[]=[];
  for(let i=0;i<starts.length;i++){
    const start=starts[i];
    const end=starts[i+1]??Math.min(html.length,start+18000);
    const block=html.slice(start,Math.min(end,start+18000));
    const productName=stringField(block,'productName');
    if(!productName||!exactCodeMatch(productName,variants)) continue;
    const productUrl=productUrlFromBlock(block);
    const mallName=stringField(block,'mallName')||'';
    const mallId=stringField(block,'mallId');
    if(!productUrl) continue;
    const provider=providerFor(mallName,productUrl,mallId);
    if(!provider) continue;
    const id=providerProductId(provider,productUrl);
    if(!id) continue;
    const discounted=numberField(block,'discountedSalePrice');
    const sale=numberField(block,'salePrice');
    const low=numberField(block,'lowPrice');
    const high=numberField(block,'highPrice');
    const candidates=[discounted,sale,low,high].filter((n):n is number=>Number.isFinite(n)&&n!>=1000);
    if(!candidates.length) continue;
    const price=Math.min(...candidates);
    const shipping=numberField(block,'deliveryFee')??0;
    parsed.push({provider,providerProductId:id,mallName,productName,productUrl,imageUrl:imageUrlFromBlock(block),price,shippingFee:shipping});
  }

  const checkedAt=new Date().toISOString();
  return mergeOffers(parsed.map(p=>({
    provider:p.provider,
    providerProductId:p.providerProductId,
    productName:p.productName,
    price:p.price,
    shippingFee:p.shippingFee,
    finalPrice:p.price+p.shippingFee,
    productUrl:p.productUrl,
    affiliateUrl:buildAffiliateUrl(p.provider,p.productUrl),
    imageUrl:p.imageUrl,
    inStock:true,
    matchConfidence:.99,
    checkedAt,
    source:'naver-shopping' as const,
  })));
}

function queryVariants(rawCode:string,brand?:string):string[] {
  const base=normalize(rawCode);
  const compacted=compact(base);
  const out=[`${compacted} ${brand||''}`.trim(),`${base} ${brand||''}`.trim()];
  return [...new Set(out.filter(Boolean))].slice(0,2);
}

async function fetchNaver(query:string):Promise<string> {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),6500);
  try{
    const url=`${NAVER_MOBILE_SEARCH}?query=${encodeURIComponent(query)}`;
    const r=await fetch(url,{signal:controller.signal,headers:{
      'User-Agent':USER_AGENT,
      'Accept-Language':'ko-KR,ko;q=0.9,en;q=0.7',
      'Accept':'text/html,application/xhtml+xml,*/*;q=0.8',
    }});
    if(!r.ok) throw new Error(`Naver HTTP ${r.status}`);
    const text=await r.text();
    if(text.length<10_000) throw new Error('Naver search response too small');
    if(/<title>[^<]*(?:접근 제한|오류|error)[^<]*<\/title>/i.test(text)) throw new Error('Naver access challenge');
    return text;
  } finally {clearTimeout(timer);}
}

export async function naverDiscoverySearch(input:{rawCode:string;brand?:string;storePrice?:number},variants:string[]):Promise<SearchResponse> {
  const failures:string[]=[];
  let offers:Offer[]=[];
  let fetched=false;
  for(const query of queryVariants(input.rawCode,input.brand)){
    try{
      const html=await fetchNaver(query);
      fetched=true;
      offers=mergeOffers(offers,parseNaverShoppingHtml(html,variants));
      if(offers.length>=3) break;
    }catch(e){failures.push(`naver-web: ${e instanceof Error?e.message:String(e)}`);}
  }
  const lowest=offers[0]||null;
  const storePrice=input.storePrice??null;
  const saving=lowest&&storePrice!=null?storePrice-lowest.finalPrice:null;
  return {
    query:{rawCode:input.rawCode,normalizedCode:normalize(input.rawCode),variants,brand:input.brand},
    offers,
    failures,
    discovery:{source:'naver-web',status:fetched?(offers.length?'ok':'no_exact_match'):'failed',checkedAt:new Date().toISOString(),candidateCount:offers.length},
    summary:{
      lowestOnlinePrice:lowest?.finalPrice??null,
      lowestProvider:lowest?.provider??null,
      storePrice,
      savingAmount:saving,
      recommendation:!lowest?'NO_ONLINE_STOCK':storePrice==null?'ONLINE_FOUND':saving!>0?'ONLINE_WIN':saving!<0?'STORE_WIN':'SAME_PRICE',
    },
  };
}
