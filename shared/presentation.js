(()=>{'use strict';const script=document.currentScript;const base=new URL('./',script.src);fetch(new URL('traditional-map.json',base)).then(r=>r.json()).then(map=>{
 const translate=s=>Array.from(s).map(c=>map[c]||c).join('');
 const process=node=>{if(node.nodeType===3){if(node.parentElement?.closest('script,style,code,pre,textarea'))return;const before=node.nodeValue,after=translate(before);if(before!==after)node.nodeValue=after;}else if(node.nodeType===1&&!node.matches('script,style,code,pre,textarea')){for(const child of node.childNodes)process(child);}};
 process(document.body);new MutationObserver(list=>{for(const m of list){if(m.type==='characterData')process(m.target);else for(const n of m.addedNodes)process(n);}}).observe(document.body,{subtree:true,childList:true,characterData:true});
 }).catch(()=>{});})();
