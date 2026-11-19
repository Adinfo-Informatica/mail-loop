export function presentQueue(state) {
 const production=state.environment==='production';
 const total=status=>state.counts.find(item=>item.status===status)?.total || 0;
 const cards=[{key:'pending',total:total('pending')}];
 if(!production)cards.push({key:'simulated',total:total('simulated')});
 cards.push({key:'accepted',total:total('accepted')},{key:'error',total:total('review')+total('uncertain')});
 return {production,cards,jobs:state.jobs.filter(job=>!production || job.status!=='simulated')};
}
