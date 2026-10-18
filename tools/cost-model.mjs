import { pathToFileURL } from 'node:url';
export function costModel({storageGiB=1,egressGiB=2,operations=10000,fixedUSD=25,payers=100,freeUsers=100,freeUSD=.1,supportUSD=.5,fx=5.5,storageRate=.025,egressRate=.09,operationRate=1,fee=.05,tax=.06,refund=.02,margin=.5,fixedFeeBRL=.5}={}) {
 const inputs=[storageGiB,egressGiB,operations,fixedUSD,payers,freeUsers,freeUSD,supportUSD,fx,storageRate,egressRate,operationRate,fee,tax,refund,margin,fixedFeeBRL];
 if(inputs.some(x=>!Number.isFinite(x)||x<0)||payers<1||fx<=0||fee+tax+refund+margin>=1)throw new Error('Premissas de custo inválidas.');
 const costUSD=storageGiB*storageRate+egressGiB*egressRate+operations/1e6*operationRate+(fixedUSD+freeUsers*freeUSD)/payers+supportUSD;
 return {costUSD,minimumBRL:(costUSD*fx+fixedFeeBRL)/(1-fee-tax-refund-margin),hypothesis:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) console.log(JSON.stringify({typical:costModel(),heavy:costModel({storageGiB:10,egressGiB:20,operations:100000}),smallPilot:costModel({payers:20})},null,2));
