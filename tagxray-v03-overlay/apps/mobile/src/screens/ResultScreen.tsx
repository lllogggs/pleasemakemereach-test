import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,Linking,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,View} from 'react-native';
import {searchProducts} from '../api';
import type {Offer,SearchResponse} from '../types';
import {money,PrimaryButton,providerName,Section} from '../components';
import {saveScan,toggleFavorite} from '../db';
import {theme} from '../theme';
import {RetailerWebSearch} from '../RetailerWebSearch';
import {mergeOffers,withOffers} from '../searchMerge';
import {searchVariants} from '../directSearch';

export function ResultScreen({route}:{route:any}) {
  const args=route.params;
  const [base,setBase]=useState<SearchResponse>();
  const [webOffers,setWebOffers]=useState<Offer[]>([]);
  const [doneProviders,setDoneProviders]=useState<Set<Offer['provider']>>(new Set());
  const [err,setErr]=useState('');
  const [scanId,setScanId]=useState<number>();
  const [favorite,setFavorite]=useState(false);
  const [timedOut,setTimedOut]=useState(false);
  const [session,setSession]=useState(0);
  const savedRef=useRef(false);
  const localVariants=useMemo(()=>searchVariants(args.rawCode),[args.rawCode]);
  const data=useMemo(()=>base?withOffers(base,webOffers):undefined,[base,webOffers]);

  const run=async()=>{
    setErr(''); setBase(undefined); setWebOffers([]); setDoneProviders(new Set()); setFavorite(false); setScanId(undefined); setTimedOut(false); savedRef.current=false; setSession(x=>x+1);
    try{setBase(await searchProducts(args));}catch(e){setErr(e instanceof Error?e.message:'검색 실패');}
  };
  useEffect(()=>{void run();},[]);
  useEffect(()=>{const t=setTimeout(()=>setTimedOut(true),30000);return()=>clearTimeout(t);},[session]);

  const onWebResult=(provider:Offer['provider'],offers:Offer[])=>{
    setWebOffers(prev=>mergeOffers(prev,offers));
  };
  const onWebDone=(provider:Offer['provider'])=>setDoneProviders(prev=>{const n=new Set(prev);n.add(provider);return n;});
  const needsRetailerFallback=!!base && base.offers.length===0;
  const allRetailersDone=!needsRetailerFallback||doneProviders.size>=4||timedOut;

  useEffect(()=>{
    if(!data||!allRetailersDone||savedRef.current)return;
    savedRef.current=true;
    void saveScan({...args,result:data,capturedAt:args.capturedAt||new Date().toISOString()}).then(saved=>{setScanId(saved.id);setFavorite(saved.favorite);});
  },[data,allRetailersDone]);

  const setFav=async()=>{
    if(!scanId)return;
    const next=!favorite; setFavorite(next); await toggleFavorite(scanId,next);
  };

  const probe=needsRetailerFallback?<RetailerWebSearch key={session} rawCode={args.rawCode} variants={localVariants} brand={args.brand} onResult={onWebResult} onProviderDone={onWebDone}/>:null;

  if(!base&&!err)return <><SafeAreaView style={s.center}><ActivityIndicator/><Text style={s.loading}>웹 전체에서 같은 품번을 찾고 있어요</Text><Text style={s.loadingSmall}>네이버 검색에서 판매처 후보를 찾고 정확한 품번만 비교합니다.</Text></SafeAreaView>{probe}</>;
  if(err&&!webOffers.length)return <><SafeAreaView style={s.center}><Text style={s.err}>검색하지 못했어요</Text><Text style={s.loading}>{err}</Text><View style={{width:220,marginTop:20}}><PrimaryButton title="다시 검색" onPress={()=>void run()}/></View></SafeAreaView>{probe}</>;
  if(data&&!data.offers.length&&!allRetailersDone)return <><SafeAreaView style={s.center}><ActivityIndicator/><Text style={s.loading}>웹 검색 결과가 없어 판매처를 직접 재확인하고 있어요</Text><Text style={s.loadingSmall}>{doneProviders.size}/4 판매처 확인 완료</Text></SafeAreaView>{probe}</>;

  const low=data?.offers[0]; const sum=data?.summary;
  if(!data||!sum)return <><SafeAreaView style={s.center}><ActivityIndicator/></SafeAreaView>{probe}</>;
  const onlineWin=sum.recommendation==='ONLINE_WIN'; const storeWin=sum.recommendation==='STORE_WIN';
  const searchFailed=!low&&data.discovery?.status==='failed';
  const headline=searchFailed?'온라인 검색에 실패했어요':!low?'현재 확인된 온라인 판매처가 없어요':onlineWin?`온라인이 ${money(Math.abs(sum.savingAmount!))} 더 저렴해요`:storeWin?`매장이 ${money(Math.abs(sum.savingAmount!))} 더 저렴해요`:sum.recommendation==='SAME_PRICE'?'가격 차이가 없어요':'온라인 판매처를 찾았어요';
  const present=new Set(data.offers.map(o=>o.provider));
  const unresolvedFailures=data.failures.filter(f=>!([...present].some(p=>f.toLowerCase().startsWith(String(p).toLowerCase()))));

  return <><SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.wrap}>
    <View style={s.topRow}><View><Text style={s.brand}>{args.brand||'상품 가격 비교'}</Text><Text style={s.code}>{data.query.normalizedCode}</Text></View><Pressable hitSlop={12} onPress={()=>void setFav()} disabled={!scanId}><Text style={[s.heart,favorite?{color:theme.danger}:null]}>{favorite?'♥':'♡'}</Text></Pressable></View>
    {!allRetailersDone?<Text style={s.live}>판매처 직접 재확인 중 · {doneProviders.size}/4</Text>:null}
    <Text style={s.headline}>{headline}</Text>
    {low?<>
      <Text style={s.price}>{money(low.finalPrice)}</Text>
      <Text style={s.provider}>{providerName(low.provider)} · {new Date(low.checkedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})} 확인{low.source==='naver-shopping'?' · 네이버 쇼핑 검색 기준':''}</Text>
      <View style={{height:18}}/>
      <PrimaryButton title={`${money(low.finalPrice)}에 구매하기`} onPress={()=>void Linking.openURL(low.affiliateUrl||low.productUrl)}/>
    </>:<Text style={s.no}>{searchFailed?'검색 서비스 응답을 받지 못했습니다. 네트워크를 확인하고 다시 검색해 주세요.':'웹 검색과 4개 판매처 재확인에서 정확히 같은 품번의 판매 상품을 찾지 못했습니다.'}</Text>}

    {sum.storePrice?<View style={s.compare}><View><Text style={s.compareLabel}>매장가</Text><Text style={s.compareValue}>{money(sum.storePrice)}</Text></View>{typeof sum.savingAmount==='number'&&sum.savingAmount!==0?<Text style={[s.delta,sum.savingAmount>0?s.good:s.bad]}>{sum.savingAmount>0?`온라인 -${money(sum.savingAmount)}`:`매장 -${money(Math.abs(sum.savingAmount))}`}</Text>:null}</View>:null}

    <Text style={s.listTitle}>동일 상품 판매처 {data.offers.length}곳</Text>
    {data.offers.map(o=><Section key={`${o.provider}-${o.providerProductId}`}><View style={s.row}><View style={{flex:1}}><Text style={s.offerName}>{providerName(o.provider)}</Text><Text numberOfLines={2} style={s.productName}>{o.productName}</Text><Text style={s.match}>품번 일치도 {Math.round(o.matchConfidence*100)}%{o.source==='naver-shopping'?' · 네이버 쇼핑 발견':''}</Text></View><Text style={s.offerPrice}>{money(o.finalPrice)}</Text></View><Text onPress={()=>void Linking.openURL(o.affiliateUrl||o.productUrl)} style={s.buy}>구매 페이지 열기 ›</Text></Section>)}
    {unresolvedFailures.length?<Text style={s.fail}>{unresolvedFailures.length}개 검색 경로에서 응답 제한 또는 파싱 실패가 있었습니다.</Text>:null}
    <Text style={s.notice}>일부 구매 링크는 LinkPrice 제휴 링크이며 구매 시 tagX-ray가 수수료를 받을 수 있습니다.</Text>
  </ScrollView></SafeAreaView>{probe}</>;
}
const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:theme.bg},wrap:{padding:22,paddingBottom:48,gap:10},center:{flex:1,alignItems:'center',justifyContent:'center',padding:22,backgroundColor:theme.bg},
  loading:{marginTop:12,color:theme.muted,textAlign:'center'},loadingSmall:{marginTop:6,color:theme.muted,fontSize:12},err:{fontSize:24,fontWeight:'900'},topRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},live:{fontSize:11,color:theme.success,fontWeight:'800',marginTop:2},
  brand:{fontSize:12,color:theme.muted,fontWeight:'800'},code:{fontSize:14,color:theme.text,fontWeight:'900',marginTop:3},heart:{fontSize:34,padding:4},headline:{fontSize:27,fontWeight:'900',lineHeight:35,marginTop:12,color:theme.text,letterSpacing:-.6},
  price:{fontSize:44,fontWeight:'900',letterSpacing:-1.8,marginTop:8},provider:{fontSize:14,color:theme.muted,marginTop:3},no:{fontSize:15,color:theme.muted,marginVertical:18,lineHeight:22},
  compare:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingVertical:20,borderBottomWidth:1,borderColor:theme.border},compareLabel:{fontSize:12,color:theme.muted},compareValue:{fontSize:18,fontWeight:'900',marginTop:4},delta:{fontSize:13,fontWeight:'900'},good:{color:theme.success},bad:{color:theme.danger},
  listTitle:{fontSize:17,fontWeight:'900',marginTop:18,marginBottom:2},row:{flexDirection:'row',gap:12},offerName:{fontSize:15,fontWeight:'900'},productName:{fontSize:13,color:theme.muted,marginTop:5,lineHeight:18},match:{fontSize:11,color:theme.muted,marginTop:6},offerPrice:{fontSize:18,fontWeight:'900'},buy:{marginTop:12,fontWeight:'800'},fail:{fontSize:12,color:theme.muted,textAlign:'center',marginTop:10,lineHeight:18},notice:{fontSize:11,color:theme.muted,lineHeight:17,marginTop:16},
});
