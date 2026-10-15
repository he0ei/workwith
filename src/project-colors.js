// Deterministic for the same project set, independent of screen sorting and task filters.
const palette=[
 ['#e8f3ff','#1b64da'],['#e4f7ec','#087f5b'],['#f0e8ff','#7544bc'],['#fff0df','#b35a00'],
 ['#ffe8ee','#bd3360'],['#def5f5','#007c83'],['#fff5cf','#926800'],['#e9ecff','#4654bb'],
 ['#f9e5f6','#a2368c'],['#eaf4d9','#527b15'],['#e1eff7','#306f96'],['#f7e9df','#92522d'],
 ['#e4f4f0','#08786d'],['#ffe7df','#b4452b'],['#eee6f7','#70508e'],['#f2efd9','#726719'],
 ['#e3ecf9','#3d629b'],['#f9e4e4','#a73737'],['#def3e1','#357941'],['#f5e7ed','#91516f']
];
export function projectColor(slot){
 if(slot<palette.length)return {background:palette[slot][0],accent:palette[slot][1]};
 // More projects still receive unique tints, instead of looping back through the palette.
 const n=slot-palette.length,hue=(n*137.50776405)%360;
 return {background:`hsl(${hue.toFixed(5)} 68% 92%)`,accent:`hsl(${hue.toFixed(5)} 62% 34%)`};
}
export function projectColors(projects){
 return new Map([...new Set(projects.map(p=>p.id))].sort().map((id,slot)=>[id,projectColor(slot)]));
}
