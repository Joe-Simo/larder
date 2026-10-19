/**
 * Larder's MCP Apps view (ui://larder/kitchen-card.html, mimeType text/html;profile=mcp-app).
 * One self-contained HTML file that any MCP Apps host can render next to a tool result: it does the
 * ui/initialize handshake, listens for ui/notifications/tool-result, and draws an Echo Show style card
 * for whichever Larder result arrived. Buttons call Larder tools back through the host (tools/call),
 * and tapping a recipe sends a follow-up message (ui/message), so touch and voice share one flow.
 */
export const CARD_URI = "ui://larder/kitchen-card.html";
export const CARD_MIME = "text/html;profile=mcp-app";

export const CARD_HTML = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Larder</title>
<style>
:root{--bg:#0f1512;--panel:#17201b;--line:#26332c;--ink:#eef3ee;--mute:#9db0a4;--ok:#7fd49b;--warn:#f2c46b;--bad:#f08a7e;--accent:#8fd3ff}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.4 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{padding:18px 20px 20px;min-height:100vh}
h1{font-size:22px;line-height:1.2;margin:0 0 4px;font-weight:650;letter-spacing:-.01em}
.sub{color:var(--mute);font-size:13px;margin:0 0 14px}
.row{display:flex;gap:10px;align-items:center}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{border:1px solid var(--line);background:var(--panel);border-radius:999px;padding:4px 10px;font-size:13px}
.chip.low{border-color:#5b4a22;color:var(--warn)}.chip.out{border-color:#5a2c27;color:var(--bad)}.chip.order{border-color:#22465a;color:var(--accent)}
.group{margin:10px 0 0}.group h2{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--mute);margin:0 0 6px;font-weight:600}
.rail{display:flex;gap:10px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:6px}
.rc{flex:0 0 190px;scroll-snap-align:start;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px;cursor:pointer;text-align:left;color:inherit;font:inherit}
.rc:hover,.rc:focus-visible{border-color:#3b5446;outline:none}
.rc b{display:block;font-size:15px;margin-bottom:4px}.rc .m{color:var(--mute);font-size:12px}
.tag{display:inline-block;margin-top:8px;font-size:12px;border-radius:6px;padding:2px 7px;background:#1f3327;color:var(--ok)}.tag.need{background:#33291a;color:var(--warn)}
ul.list{list-style:none;margin:0;padding:0}ul.list li{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px solid var(--line)}
ul.list li:last-child{border-bottom:0}.dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:8px;background:var(--ok);flex:none;margin-top:6px}
.dot.missing{background:var(--bad)}.dot.short{background:var(--warn)}
.amt{color:var(--mute);font-size:13px;white-space:nowrap}
ol{margin:6px 0 0;padding-left:20px;color:#d5dfd8}ol li{margin:4px 0}
.btns{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
button.b{background:var(--ink);color:#0f1512;border:0;border-radius:999px;padding:9px 14px;font:600 14px/1 inherit;cursor:pointer}
button.b.ghost{background:transparent;color:var(--ink);border:1px solid var(--line)}
button.b:disabled{opacity:.5;cursor:default}
.code{font:600 13px ui-monospace,SFMono-Regular,Menlo,monospace;background:#1d2a33;color:var(--accent);padding:3px 8px;border-radius:6px}
.note{color:var(--mute);font-size:12px;margin-top:10px}
.tl li{display:block}.tl .who{color:var(--accent)}.tl time{color:var(--mute);font-size:12px;display:block}
.empty{color:var(--mute);padding:24px 0}
</style></head>
<body><main id="app" aria-live="polite"><p class="empty">Waiting for Larder...</p></main>
<script>
(function(){
  var app=document.getElementById("app"), nextId=1, pending={}, last=null;
  function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
  function send(msg){window.parent.postMessage(Object.assign({jsonrpc:"2.0"},msg),"*")}
  function request(method,params){var id=nextId++;send({id:id,method:method,params:params});return new Promise(function(res,rej){pending[id]={res:res,rej:rej}})}
  function notify(method,params){send({method:method,params:params||{}})}
  function size(){notify("ui/notifications/size-changed",{height:Math.ceil(document.documentElement.scrollHeight)})}
  window.addEventListener("message",function(e){
    var m=e.data; if(!m||m.jsonrpc!=="2.0")return;
    if(m.id!=null&&pending[m.id]&&!m.method){var p=pending[m.id];delete pending[m.id];m.error?p.rej(m.error):p.res(m.result);return}
    if(m.method==="ui/notifications/tool-result"){render(m.params&&m.params.structuredContent)}
    if(m.method==="ui/resource-teardown"&&m.id!=null){send({id:m.id,result:{}})}
  });
  function callTool(name,args){
    app.querySelectorAll("button").forEach(function(b){b.disabled=true});
    return request("tools/call",{name:name,arguments:args||{}}).then(function(r){render(r&&r.structuredContent)}).catch(function(){app.querySelectorAll("button").forEach(function(b){b.disabled=false})});
  }
  function say(text){request("ui/message",{role:"user",content:[{type:"text",text:text}]}).catch(function(){})}
  function level(e){return e.onOrder?"order":e.level}
  function label(e){var n=e.count!=null?e.count+" ":"";return esc(n+e.name)+(e.onOrder?" (on order)":e.level==="low"?" (low)":e.level==="out"?" (out)":"")}
  var AISLE={produce:"Produce",meat:"Meat and fish",dairy:"Dairy and eggs",bakery:"Bakery",pantry:"Pantry",spices:"Spices",frozen:"Frozen",other:"Other"};
  var R={
    pantry_check:function(d){
      var items=(d.items||[]).filter(function(i){return i.entry});
      if(!items.length)return "<h1>In the kitchen</h1><p class='sub'>"+esc(d.speech)+"</p>";
      var groups={};items.forEach(function(i){(groups[i.entry.aisle]=groups[i.entry.aisle]||[]).push(i.entry)});
      var h="<h1>In the kitchen</h1><p class='sub'>"+esc(d.speech)+"</p>";
      Object.keys(groups).forEach(function(a){h+="<div class='group'><h2>"+esc(AISLE[a]||a)+"</h2><div class='chips'>"+groups[a].map(function(e){return "<span class='chip "+level(e)+"'>"+label(e)+"</span>"}).join("")+"</div></div>"});
      var need=(d.low||[]).concat(d.out||[]);
      if(need.length)h+="<div class='btns'><button class='b' data-add='"+esc(JSON.stringify(need))+"'>Add low and out items to cart</button></div>";
      return h;
    },
    pantry_update:function(d){
      var h="<h1>Pantry updated</h1><p class='sub'>"+esc(d.speech)+"</p><div class='chips'>"+(d.changed||[]).map(function(e){return "<span class='chip "+level(e)+"'>"+label(e)+"</span>"}).join("")+"</div>";
      if(d.suggestCart&&d.suggestCart.length)h+="<div class='btns'><button class='b' data-add='"+esc(JSON.stringify(d.suggestCart))+"'>Add to cart</button></div>";
      return h;
    },
    recipe_suggestions:function(d){
      return "<h1>What you can make</h1><p class='sub'>"+esc(d.speech)+"</p><div class='rail' role='list'>"+(d.recipes||[]).map(function(r){
        var tag=r.missing.length?"<span class='tag need'>Needs "+esc(r.missing.slice(0,3).join(", "))+(r.missing.length>3?" +"+(r.missing.length-3):"")+"</span>":"<span class='tag'>Ready to cook</span>";
        return "<button class='rc' role='listitem' data-say='"+esc("Make "+r.name+" for "+r.servings)+"'><b>"+esc(r.name)+"</b><span class='m'>"+r.minutes+" min, serves "+r.servings+"</span><br>"+tag+"</button>"}).join("")+"</div><p class='note'>Tap a recipe to plan it.</p>";
    },
    recipe_plan:function(d){
      var r=d.recipe; if(!r)return "<h1>Recipe</h1><p class='sub'>"+esc(d.speech)+"</p>";
      var miss=r.needs.filter(function(n){return n.status!=="have"});
      var h="<h1>"+esc(r.name)+" for "+r.servings+"</h1><p class='sub'>"+esc(d.speech)+"</p><ul class='list'>"+r.needs.map(function(n){return "<li><span class='row' style='align-items:flex-start'><span class='dot "+n.status+"'></span>"+esc(n.name)+(n.status==="short"?" (need "+n.buy+" more)":n.status==="missing"?" (missing)":"")+"</span><span class='amt'>"+esc(n.amount)+"</span></li>"}).join("")+"</ul>";
      if(miss.length)h+="<div class='btns'><button class='b' data-tool='cart_add' data-args='"+esc(JSON.stringify({recipe:r.id,servings:r.servings}))+"'>Add "+miss.length+" missing to cart</button></div>";
      h+="<div class='group'><h2>Steps</h2><ol>"+r.steps.map(function(s){return "<li>"+esc(s)+"</li>"}).join("")+"</ol></div>";
      return h;
    },
    cart:function(d){
      var c=d.cart||[]; if(!c.length)return "<h1>Cart</h1><p class='sub'>"+esc(d.speech)+"</p>";
      return "<h1>Cart</h1><p class='sub'>"+esc(d.speech)+"</p><ul class='list'>"+c.map(function(l){return "<li><span>"+esc(l.name)+(l.qty?" x"+l.qty:"")+"</span><span class='amt'>"+esc(l.note||"")+"</span></li>"}).join("")+"</ul><div class='btns'><button class='b' data-tool='order_place' data-args='{}'>Review order</button></div>";
    },
    order_review:function(d){
      if(!d.confirmation_code)return "<h1>Order</h1><p class='sub'>"+esc(d.speech)+"</p>";
      return "<h1>Review your order</h1><p class='sub'>"+esc(d.speech)+"</p><ul class='list'>"+d.lines.map(function(l){return "<li><span>"+esc(l.name)+(l.qty?" x"+l.qty:"")+"</span><span class='amt'>"+esc(l.note||"")+"</span></li>"}).join("")+"</ul><div class='btns'><button class='b' data-tool='order_confirm' data-args='"+esc(JSON.stringify({confirmation_code:d.confirmation_code}))+"'>Place order</button></div><p class='note'>Confirmation <span class='code'>"+esc(d.confirmation_code)+"</span>. Simulated order: no store, no payment.</p>";
    },
    order_placed:function(d){
      if(!d.ok)return "<h1>Not placed</h1><p class='sub'>"+esc(d.speech)+"</p>";
      return "<h1>Order placed</h1><p class='sub'>"+esc(d.speech)+"</p><div class='chips'>"+d.order.lines.map(function(l){return "<span class='chip order'>"+esc(l.name)+"</span>"}).join("")+"</div><div class='btns'><button class='b ghost' data-tool='order_received' data-args='{}'>It arrived</button></div><p class='note'>Simulated order: no store, no payment.</p>";
    },
    order_received:function(d){return "<h1>Restocked</h1><p class='sub'>"+esc(d.speech)+"</p><div class='chips'>"+(d.restocked||[]).map(function(n){return "<span class='chip'>"+esc(n)+"</span>"}).join("")+"</div>"},
    recap:function(d){
      return "<h1>Kitchen activity</h1><p class='sub'>"+esc(d.speech)+"</p><ul class='list tl'>"+(d.activity||[]).map(function(a){return "<li>"+(a.who?"<span class='who'>"+esc(a.who)+"</span>: ":"")+esc(a.text)+"<time datetime='"+esc(a.at)+"'>"+esc(new Date(a.at).toLocaleString([], {weekday:"short",hour:"numeric",minute:"2-digit"}))+"</time></li>"}).join("")+"</ul>";
    }
  };
  function render(d){
    if(!d||!d.kind){return}
    last=d; window.scrollTo(0,0); var f=R[d.kind]; app.innerHTML=f?f(d):"<p class='sub'>"+esc(d.speech)+"</p>";
    app.querySelectorAll("[data-tool]").forEach(function(b){b.addEventListener("click",function(){callTool(b.getAttribute("data-tool"),JSON.parse(b.getAttribute("data-args")||"{}"))})});
    app.querySelectorAll("[data-add]").forEach(function(b){b.addEventListener("click",function(){callTool("cart_add",{items:JSON.parse(b.getAttribute("data-add")).map(function(n){return {item:n}})})})});
    app.querySelectorAll("[data-say]").forEach(function(b){b.addEventListener("click",function(){say(b.getAttribute("data-say"))})});
    size();
  }
  request("ui/initialize",{protocolVersion:"2026-01-26",appInfo:{name:"Larder kitchen card",version:"1.0.0"},appCapabilities:{}}).then(function(){notify("ui/notifications/initialized");size()}).catch(function(){});
  new ResizeObserver(size).observe(document.body);
})();
</script></body></html>`;
