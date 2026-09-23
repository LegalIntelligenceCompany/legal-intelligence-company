// Reference material and dry-run arithmetic only. Never imported by funding or
// settlement: a published price is not proof of a complete billing adapter.
export const tariffReviewDate = '2026-09-23';
export const tariffReviewUntil = '2026-10-23T00:00:00Z';
export const referenceTariffs = [
  {model:'GPT-5 mini',input:'0,25',cached:'0,025',output:'2,00',extra:'Pesquisa web: 0,01 USD por chamada, mais os tokens pesquisados.',source:'https://developers.openai.com/api/docs/models/gpt-5-mini'},
  {model:'GPT-6 Astra · até 272 mil tokens de entrada',input:'10,00',cached:'1,00',output:'50,00',extra:'Escrita de cache: 12,50 USD por milhão de tokens.',source:'https://developers.openai.com/api/docs/models/gpt-6-astra'},
  {model:'GPT-6 Astra · acima de 272 mil tokens de entrada',input:'20,00',cached:'2,00',output:'75,00',extra:'Escrita de cache: 25,00 USD por milhão de tokens; escalão aplicado ao pedido completo.',source:'https://developers.openai.com/api/docs/models/gpt-6-astra'},
] as const;

export const ecbSource = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';
export type ReferenceExchange = {date:string;usdPerEuro:string;eurNumerator:number;usdDenominator:number};
// ECB publishes USD per EUR. Invert the exact decimal, never round a float or
// quietly assume parity. This is an informational estimate, not a bank quote.
export function parseReferenceExchange(xml:string,now=Date.now()):ReferenceExchange {
  if(xml.length>100_000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('FX_INVALID');
  const dates=[...xml.matchAll(/<Cube\s+time=["'](\d{4}-\d{2}-\d{2})["']\s*>/g)];
  if(dates.length!==1)throw Error('FX_INVALID');
  const date=dates[0][1],start=Date.parse(date+'T00:00:00Z');
  if(!Number.isFinite(now)||!Number.isFinite(start)||new Date(start).toISOString().slice(0,10)!==date||start>now||now-start>7*86400000)throw Error('FX_STALE');
  const datedBlock=xml.slice(dates[0].index!+dates[0][0].length).split('</Cube>')[0];
  const rates=[...datedBlock.matchAll(/<Cube\s+currency=["']USD["']\s+rate=["'](\d{1,3}(?:\.\d{1,6})?)["']\s*\/>/g)];
  if(rates.length!==1)throw Error('FX_INVALID');
  const usdPerEuro=rates[0][1],parts=usdPerEuro.split('.');
  const eurNumerator=10**(parts[1]?.length||0),usdDenominator=Number(parts.join(''));
  if(usdDenominator<=0)throw Error('FX_INVALID');
  return {date,usdPerEuro,eurNumerator,usdDenominator};
}

export function simulateProviderCost(usd:string,exchange:ReferenceExchange) {
  const value=usd.trim().replace(',','.');
  if(!/^\d{1,6}(?:\.\d{1,6})?$/.test(value)||!Number.isSafeInteger(exchange.eurNumerator)||exchange.eurNumerator<=0||!Number.isSafeInteger(exchange.usdDenominator)||exchange.usdDenominator<=0)throw Error('SIMULATION_INVALID');
  const [whole,fraction='']=value.split('.');
  const micros=BigInt(whole)*BigInt(1_000_000)+BigInt(fraction.padEnd(6,'0'));
  const numerator=micros*BigInt(exchange.eurNumerator),denominator=BigInt(exchange.usdDenominator)*BigInt(10_000);
  const customerCents=Number((numerator*BigInt(7)+denominator*BigInt(2)-BigInt(1))/(denominator*BigInt(2)));
  if(!Number.isSafeInteger(customerCents))throw Error('SIMULATION_INVALID');
  return {customerCents,providerEuro:Number(numerator)/Number(BigInt(exchange.usdDenominator)*BigInt(1_000_000))};
}
