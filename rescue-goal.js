'use strict';
// Stage duration is distance-based, so the final 30 seconds are an ETA.
class RescueGoal {
 constructor(){this.reset();}
 reset(){this.warned=new Set();this.until=0;}
 update(s){
  const remaining=Math.max(0,Math.ceil((Number(s.required)||0)-(Number(s.animals)||0)));
  const eta=s.speed>0?Math.max(0,(s.courseLength-s.z)/s.speed):Infinity;
  const active=!!s.running&&!s.ended&&!s.finishing&&!s.paused;
  let warn=false;
  if(active&&remaining>0&&eta<=30){
   const crossed=[30,15,5].filter(t=>eta<=t&&!this.warned.has(t));
   if(crossed.length){crossed.forEach(t=>this.warned.add(t));this.until=s.elapsed+1.2;warn=true;}
  }
  if(!remaining||s.ended||s.finishing)this.until=0;
  return {remaining,eta,warn,urgent:active&&remaining>0&&eta<=30,popup:active&&remaining>0&&s.elapsed<this.until};
 }
}
if(typeof module!=='undefined')module.exports=RescueGoal;
