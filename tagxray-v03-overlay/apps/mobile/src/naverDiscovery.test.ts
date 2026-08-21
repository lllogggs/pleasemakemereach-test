import {describe,expect,it} from 'vitest';
import {parseNaverShoppingHtml} from './naverDiscovery';

const fixture = String.raw`
<script>
{"productName":"\u003Cmark\u003E리바이스\u003C\u002Fmark\u003E 여성 루즈 부츠 진 \u003Cmark\u003E005DO0005\u003C\u002Fmark\u003E 720458","productUrl":{"pcUrl":"https:\u002F\u002Fwww.lotteon.com\u002Fp\u002Fproduct\u002FLO2745688218?sitmNo=LO2745688218_2745688219","mobileUrl":"https:\u002F\u002Fwww.lotteon.com\u002Fm\u002Fproduct\u002FLO2745688218"},"images":[{"imageUrl":"https:\u002F\u002Fshopping-phinf.pstatic.net\u002Fmain_1.jpg"}],"mallName":"롯데ON","mallId":"lotteon","productDeliveryInfo":{"deliveryFee":0},"salePrice":139000}
{"productName":"\u003Cmark\u003E리바이스\u003C\u002Fmark\u003E 여성 루즈 부츠 진 \u003Cmark\u003E005DO0005\u003C\u002Fmark\u003E 670617","productUrl":{"pcUrl":"https:\u002F\u002Flink.gmarket.co.kr\u002Fgate\u002Fpcs?item-no=4831846457&sub-id=1003","mobileUrl":"https:\u002F\u002Flink.gmarket.co.kr\u002Fgate\u002Fpcs?item-no=4831846457"},"mallName":"G마켓","mallId":"goodsdaq","productDeliveryInfo":{"deliveryFee":0},"salePrice":141550}
{"productName":"[현대판교점] [\u003Cmark\u003E리바이스\u003C\u002Fmark\u003E] 여성 로제 루즈 부츠 진 005DO-0005 \u003Cmark\u003E005DO0005\u003C\u002Fmark\u003E","productUrl":{"pcUrl":"https:\u002F\u002Fwww.hmall.com\u002Fmd\u002Fpda\u002FitemPtc?ReferCode=429&slitmCd=2252820647","mobileUrl":"https:\u002F\u002Fwww.hmall.com\u002Fmd\u002Fpda\u002FitemPtc?slitmCd=2252820647"},"mallName":"현대Hmall","mallId":"hmall","productDeliveryInfo":{"deliveryFee":0},"salePrice":135150,"discountedSalePrice":135150}
</script>`;

describe('Naver structured shopping discovery',()=>{
  it('finds exact Levi SKU across LotteON, Gmarket and Hmall',()=>{
    const offers=parseNaverShoppingHtml(fixture,['005DO0005','005DO-0005']);
    expect(offers.map(x=>x.provider).sort()).toEqual(['gmarket','hmall','lotteon']);
    expect(offers[0]?.provider).toBe('hmall');
    expect(offers[0]?.finalPrice).toBe(135150);
    expect(offers.find(x=>x.provider==='lotteon')?.productUrl).toContain('LO2745688218');
    expect(offers.find(x=>x.provider==='gmarket')?.providerProductId).toBe('4831846457');
  });
  it('rejects a different SKU',()=>{
    const offers=parseNaverShoppingHtml(fixture,['005DO0004']);
    expect(offers).toHaveLength(0);
  });
});
